#!/usr/bin/env python3
"""Extract OSM parks, amenities, and districts for one city boundary."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import tempfile
from pathlib import Path
from typing import Any

import osmium
from pyproj import CRS, Transformer
from shapely import from_geojson, make_valid, union_all
from shapely.errors import GEOSException
from shapely.geometry import (
    GeometryCollection,
    MultiPolygon,
    Point,
    Polygon,
    mapping,
    shape,
)
from shapely.ops import transform as transform_geometry


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Extract public park areas and amenity observations from an OSM "
            "PBF, clipped to an OSM administrative boundary relation."
        )
    )
    parser.add_argument("--pbf", required=True, type=Path)
    boundary_group = parser.add_mutually_exclusive_group(required=True)
    boundary_group.add_argument("--boundary-relation", type=int)
    boundary_group.add_argument("--boundary-geojson", type=Path)
    parser.add_argument("--city-id", required=True)
    parser.add_argument("--city-name", required=True)
    parser.add_argument(
        "--district-admin-levels",
        default="",
        help=(
            "Comma-separated preferred OSM admin levels. The first level with "
            "useful city coverage is used for park district assignment."
        ),
    )
    parser.add_argument(
        "--district-place-fallback",
        action="store_true",
        help=(
            "When no administrative polygons are mapped, assign parks to the "
            "nearest named OSM suburb or borough point."
        ),
    )
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    if not args.pbf.is_file():
        parser.error(f"--pbf does not exist or is not a file: {args.pbf}")
    if args.boundary_relation is not None and args.boundary_relation <= 0:
        parser.error("--boundary-relation must be a positive OSM relation ID")
    if (
        args.boundary_geojson is not None
        and not args.boundary_geojson.is_file()
    ):
        parser.error(
            f"--boundary-geojson does not exist or is not a file: "
            f"{args.boundary_geojson}"
        )
    if not args.city_id.strip():
        parser.error("--city-id must not be empty")
    if not args.city_name.strip():
        parser.error("--city-name must not be empty")
    try:
        args.district_admin_levels = tuple(
            dict.fromkeys(
                int(value.strip())
                for value in args.district_admin_levels.split(",")
                if value.strip()
            )
        )
    except ValueError:
        parser.error("--district-admin-levels must contain integers")
    return args


def polygonal_only(geometry: Any) -> Any:
    if geometry.is_empty:
        return GeometryCollection()
    if isinstance(geometry, (Polygon, MultiPolygon)):
        return geometry
    if isinstance(geometry, GeometryCollection):
        parts = [
            polygonal_only(part)
            for part in geometry.geoms
            if isinstance(part, (Polygon, MultiPolygon, GeometryCollection))
        ]
        parts = [part for part in parts if not part.is_empty]
        return union_all(parts) if parts else GeometryCollection()
    return GeometryCollection()


def osm_area_geometry(area: Any, factory: osmium.geom.GeoJSONFactory) -> Any:
    geometry = from_geojson(factory.create_multipolygon(area))
    return polygonal_only(make_valid(geometry))


def extract_boundary(pbf: Path, relation_id: int) -> Any:
    factory = osmium.geom.GeoJSONFactory()
    for item in (
        osmium.FileProcessor(str(pbf)).with_locations().with_areas()
    ):
        if (
            item.is_area()
            and not item.from_way()
            and item.orig_id() == relation_id
        ):
            boundary = osm_area_geometry(item, factory)
            if boundary.is_empty:
                break
            return boundary
    raise RuntimeError(
        f"OSM boundary relation {relation_id} was not found as a valid area in {pbf}"
    )


def load_boundary_geojson(path: Path) -> Any:
    payload = json.loads(path.read_text(encoding="utf-8"))
    features = payload.get("features")
    if payload.get("type") != "FeatureCollection" or not isinstance(
        features, list
    ):
        raise RuntimeError(f"{path}: expected a GeoJSON FeatureCollection")
    parts = [
        polygonal_only(make_valid(shape(feature["geometry"])))
        for feature in features
        if feature.get("geometry")
    ]
    parts = [part for part in parts if not part.is_empty]
    if not parts:
        raise RuntimeError(f"{path}: no polygonal boundary geometry")
    return polygonal_only(make_valid(union_all(parts)))


def local_area_transformer(boundary: Any) -> Transformer:
    centroid = boundary.centroid
    zone = min(60, max(1, math.floor((centroid.x + 180) / 6) + 1))
    projected = CRS.from_dict(
        {
            "proj": "utm",
            "zone": zone,
            "south": centroid.y < 0,
            "datum": "WGS84",
            "units": "m",
        }
    )
    return Transformer.from_crs("EPSG:4326", projected, always_xy=True)


def preferred_name(tags: Any) -> str:
    for key in ("name", "name:en", "name:ar"):
        value = tags.get(key)
        if value and value.strip():
            return value.strip()
    return ""


def preferred_district_name(tags: Any) -> str:
    for key in ("name:de", "name:en", "name"):
        value = tags.get(key)
        if value and value.strip() and any(
            character.isalpha() for character in value
        ):
            return value.strip()
    official_name = tags.get("official_name")
    if official_name and official_name.strip():
        normalized = re.sub(
            r"^(?:Stadtbezirk|Stadtteil|Bezirk)\s+\d+(?:[.\-]\d+)?\s+",
            "",
            official_name.strip(),
            flags=re.IGNORECASE,
        )
        return normalized or official_name.strip()
    return ""


def amenity_kinds(tags: Any) -> tuple[str, ...]:
    kinds: list[str] = []
    if tags.get("leisure") == "playground":
        kinds.append("playground")
    if tags.get("amenity") == "toilets":
        kinds.append("toilet")
    if tags.get("amenity") == "drinking_water" or (
        tags.get("drinking_water") in {"yes", "designated"}
        and tags.get("amenity") == "fountain"
    ):
        kinds.append("drinkingFountain")
    if tags.get("leisure") == "dog_park":
        kinds.append("dogRun")
    return tuple(kinds)


def source_identity(item: Any) -> tuple[str, int, str]:
    if item.is_node():
        osm_type = "node"
        osm_id = int(item.id)
    elif item.is_area():
        osm_type = "way" if item.from_way() else "relation"
        osm_id = int(item.orig_id())
    else:
        raise ValueError("Only nodes and areas have source identities")
    return osm_type, osm_id, f"{osm_type}:{osm_id}"


def clip_area_to_boundary(
    item: Any,
    factory: osmium.geom.GeoJSONFactory,
    boundary: Any,
) -> Any:
    geometry = osm_area_geometry(item, factory)
    if geometry.is_empty or not geometry.intersects(boundary):
        return GeometryCollection()
    return polygonal_only(make_valid(geometry.intersection(boundary)))


def choose_districts(
    candidates_by_level: dict[int, list[dict[str, Any]]],
    preferred_levels: tuple[int, ...],
    boundary: Any,
) -> tuple[int | None, list[dict[str, Any]]]:
    if not preferred_levels:
        return None, []

    scored: list[tuple[float, int, int, list[dict[str, Any]]]] = []
    for preference, level in enumerate(preferred_levels):
        candidates = candidates_by_level.get(level, [])
        if len(candidates) < 2:
            continue
        covered = polygonal_only(
            make_valid(union_all([candidate["geometry"] for candidate in candidates]))
        )
        coverage = (
            covered.intersection(boundary).area / boundary.area
            if boundary.area > 0
            else 0
        )
        scored.append((coverage, -preference, level, candidates))
        if coverage >= 0.8 and len(candidates) <= 60:
            return level, candidates

    if not scored:
        return None, []
    _, _, level, candidates = max(scored, key=lambda item: (item[0], item[1]))
    return level, candidates


def district_for_geometry(
    geometry: Any,
    districts: list[dict[str, Any]],
    fallback: str,
) -> str:
    if not districts:
        return fallback
    point = geometry.representative_point()
    containing = [
        district
        for district in districts
        if district["geometry"].covers(point)
    ]
    if containing:
        return min(
            containing,
            key=lambda district: district["geometry"].area,
        )["name"]
    if all(isinstance(district["geometry"], Point) for district in districts):
        return min(
            districts,
            key=lambda district: district["geometry"].distance(point),
        )["name"]
    overlaps = [
        (geometry.intersection(district["geometry"]).area, district)
        for district in districts
        if geometry.intersects(district["geometry"])
    ]
    if overlaps:
        return max(overlaps, key=lambda item: item[0])[1]["name"]
    return fallback


def extract_city_features(
    pbf: Path,
    boundary: Any,
    city_id: str,
    city_name: str,
    district_admin_levels: tuple[int, ...],
    district_place_fallback: bool,
) -> tuple[list[dict[str, Any]], int | None, str | None]:
    factory = osmium.geom.GeoJSONFactory()
    transformer = local_area_transformer(boundary)
    park_candidates: list[dict[str, Any]] = []
    amenity_features: list[dict[str, Any]] = []
    candidates_by_level: dict[int, list[dict[str, Any]]] = {}
    place_candidates: list[dict[str, Any]] = []
    seen_park_ids: set[str] = set()
    seen_amenity_ids: set[tuple[str, str]] = set()
    seen_district_ids: set[str] = set()

    for item in (
        osmium.FileProcessor(str(pbf)).with_locations().with_areas()
    ):
        is_park = item.is_area() and item.tags.get("leisure") == "park"
        kinds = amenity_kinds(item.tags)
        admin_level_text = item.tags.get("admin_level")
        is_district = (
            item.is_area()
            and not item.from_way()
            and item.tags.get("boundary") == "administrative"
            and admin_level_text
            and admin_level_text.isdigit()
            and int(admin_level_text) in district_admin_levels
            and preferred_district_name(item.tags)
        )
        place_name = preferred_district_name(item.tags)
        is_district_place = (
            district_place_fallback
            and item.is_node()
            and item.tags.get("place") in {"borough", "suburb", "quarter"}
            and place_name
            and any(character.isalpha() for character in place_name)
        )
        if not is_park and not kinds and not is_district and not is_district_place:
            continue
        if item.tags.get("access") in {"private", "no"}:
            continue

        try:
            osm_type, osm_id, identity = source_identity(item)
        except ValueError:
            continue
        canonical_id = f"{city_id}:osm:{osm_type}:{osm_id}"

        try:
            if item.is_node():
                geometry = Point(item.location.lon, item.location.lat)
                if not boundary.covers(geometry):
                    continue
            else:
                geometry = clip_area_to_boundary(item, factory, boundary)
            if geometry.is_empty:
                continue
        except (GEOSException, RuntimeError, ValueError):
            continue

        if is_district and identity not in seen_district_ids:
            seen_district_ids.add(identity)
            candidates_by_level.setdefault(int(admin_level_text), []).append(
                {
                    "canonical_id": canonical_id,
                    "geometry": geometry,
                    "name": preferred_district_name(item.tags),
                    "osm_type": osm_type,
                    "osm_id": osm_id,
                }
            )

        if is_district_place and identity not in seen_district_ids:
            seen_district_ids.add(identity)
            place_candidates.append(
                {
                    "canonical_id": canonical_id,
                    "geometry": geometry,
                    "name": place_name,
                    "osm_type": osm_type,
                    "osm_id": osm_id,
                }
            )

        if is_park and canonical_id not in seen_park_ids:
            try:
                projected = polygonal_only(
                    make_valid(
                        transform_geometry(transformer.transform, geometry)
                    )
                )
                area_m2 = projected.area
            except (GEOSException, RuntimeError, ValueError):
                area_m2 = 0
            if math.isfinite(area_m2) and area_m2 > 0:
                seen_park_ids.add(canonical_id)
                park_candidates.append(
                    {
                        "canonical_id": canonical_id,
                        "geometry": geometry,
                        "name": preferred_name(item.tags),
                        "area_m2": round(area_m2, 1),
                        "osm_type": osm_type,
                        "osm_id": osm_id,
                    }
                )

        for kind in kinds:
            amenity_identity = (kind, canonical_id)
            if amenity_identity in seen_amenity_ids:
                continue
            seen_amenity_ids.add(amenity_identity)
            amenity_features.append(
                {
                    "type": "Feature",
                    "id": f"{kind}:{canonical_id}",
                    "geometry": mapping(geometry),
                    "properties": {
                        "canonical_id": canonical_id,
                        "name": preferred_name(item.tags),
                        "type": kind,
                        "osm_type": osm_type,
                        "osm_id": osm_id,
                        "source_kind": kind,
                    },
                }
            )

    district_level, districts = choose_districts(
        candidates_by_level,
        district_admin_levels,
        boundary,
    )
    district_assignment_kind = (
        "administrative-boundary" if districts else None
    )
    if not districts and district_place_fallback:
        unique_places: dict[str, dict[str, Any]] = {}
        for place in place_candidates:
            unique_places.setdefault(place["name"].casefold(), place)
        districts = sorted(
            unique_places.values(),
            key=lambda place: place["name"].casefold(),
        )
        district_assignment_kind = "nearest-place-label" if districts else None
    district_features = [
        {
            "type": "Feature",
            "id": district["canonical_id"],
            "geometry": mapping(district["geometry"]),
            "properties": {
                "canonical_id": district["canonical_id"],
                "name": district["name"],
                "admin_level": district_level,
                "osm_type": district["osm_type"],
                "osm_id": district["osm_id"],
                "source_kind": "district",
            },
        }
        for district in districts
    ]
    park_features = [
        {
            "type": "Feature",
            "id": park["canonical_id"],
            "geometry": mapping(park["geometry"]),
            "properties": {
                "canonical_id": park["canonical_id"],
                "name": park["name"],
                "district": district_for_geometry(
                    park["geometry"],
                    districts,
                    city_name,
                ),
                "type": "Park",
                "area_m2": park["area_m2"],
                "osm_type": park["osm_type"],
                "osm_id": park["osm_id"],
                "source_kind": "park",
            },
        }
        for park in park_candidates
    ]
    features = park_features + amenity_features + district_features
    return sorted(
        features,
        key=lambda feature: (
            feature["properties"]["source_kind"],
            feature["properties"]["osm_type"],
            feature["properties"]["osm_id"],
        ),
    ), district_level, district_assignment_kind


def pbf_data_as_of(pbf: Path) -> str | None:
    reader = osmium.io.Reader(str(pbf))
    try:
        timestamp = reader.header().get("osmosis_replication_timestamp")
    finally:
        reader.close()
    if not timestamp:
        return None
    match = re.match(r"^\d{4}-\d{2}-\d{2}", timestamp)
    return match.group(0) if match else timestamp


def write_geojson(
    output: Path,
    city_id: str,
    city_name: str,
    boundary_relation: int | None,
    features: list[dict[str, Any]],
    district_admin_level: int | None,
    district_assignment_kind: str | None,
    data_as_of: str | None,
) -> None:
    payload: dict[str, Any] = {
        "type": "FeatureCollection",
        "cityId": city_id,
        "cityName": city_name,
        "boundaryRelation": boundary_relation,
        "districtAdminLevel": district_admin_level,
        "districtAssignmentKind": district_assignment_kind,
        "features": features,
    }
    if data_as_of:
        payload["dataAsOf"] = data_as_of

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=output.parent,
        prefix=f".{output.name}.",
        suffix=".tmp",
        delete=False,
    ) as temporary:
        json.dump(
            payload,
            temporary,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        temporary.write("\n")
        temporary_path = Path(temporary.name)
    os.replace(temporary_path, output)


def main() -> None:
    args = parse_args()
    city_id = args.city_id.strip()
    city_name = args.city_name.strip()
    boundary = (
        extract_boundary(args.pbf, args.boundary_relation)
        if args.boundary_relation is not None
        else load_boundary_geojson(args.boundary_geojson)
    )
    features, district_admin_level, district_assignment_kind = (
        extract_city_features(
        args.pbf,
        boundary,
        city_id,
        city_name,
        args.district_admin_levels,
        args.district_place_fallback,
        )
    )
    if not features:
        raise RuntimeError(
            f"No public park or amenity observations found for {city_name}"
        )
    data_as_of = pbf_data_as_of(args.pbf)
    write_geojson(
        args.output,
        city_id,
        city_name,
        args.boundary_relation,
        features,
        district_admin_level,
        district_assignment_kind,
        data_as_of,
    )
    counts: dict[str, int] = {}
    for feature in features:
        kind = feature["properties"]["source_kind"]
        counts[kind] = counts.get(kind, 0) + 1
    print(
        f"{city_name}: wrote {len(features):,} OSM features "
        f"({', '.join(f'{kind}={count}' for kind, count in sorted(counts.items()))}) "
        f"to {args.output}"
    )


if __name__ == "__main__":
    main()
