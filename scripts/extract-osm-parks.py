#!/usr/bin/env python3
"""Extract strict OpenStreetMap park polygons for one administrative boundary."""

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
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon, mapping
from shapely.ops import transform as transform_geometry


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Extract leisure=park areas from an OSM PBF, clipped to an OSM "
            "administrative boundary relation."
        )
    )
    parser.add_argument("--pbf", required=True, type=Path)
    parser.add_argument("--boundary-relation", required=True, type=int)
    parser.add_argument("--city-id", required=True)
    parser.add_argument("--city-name", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    if not args.pbf.is_file():
        parser.error(f"--pbf does not exist or is not a file: {args.pbf}")
    if args.boundary_relation <= 0:
        parser.error("--boundary-relation must be a positive OSM relation ID")
    if not args.city_id.strip():
        parser.error("--city-id must not be empty")
    if not args.city_name.strip():
        parser.error("--city-name must not be empty")
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


def extract_parks(
    pbf: Path,
    boundary: Any,
    city_id: str,
    city_name: str,
) -> list[dict[str, Any]]:
    factory = osmium.geom.GeoJSONFactory()
    transformer = local_area_transformer(boundary)
    features: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for item in (
        osmium.FileProcessor(str(pbf)).with_locations().with_areas()
    ):
        if not item.is_area() or item.tags.get("leisure") != "park":
            continue
        if item.tags.get("access") in {"private", "no"}:
            continue

        osm_type = "way" if item.from_way() else "relation"
        osm_id = int(item.orig_id())
        canonical_id = f"{city_id}:osm:{osm_type}:{osm_id}"
        if canonical_id in seen_ids:
            continue

        try:
            geometry = osm_area_geometry(item, factory)
            if geometry.is_empty or not geometry.intersects(boundary):
                continue
            clipped = polygonal_only(
                make_valid(geometry.intersection(boundary))
            )
            if clipped.is_empty:
                continue
            projected = polygonal_only(
                make_valid(
                    transform_geometry(transformer.transform, clipped)
                )
            )
        except (GEOSException, RuntimeError, ValueError):
            continue

        area_m2 = projected.area
        if not math.isfinite(area_m2) or area_m2 <= 0:
            continue

        seen_ids.add(canonical_id)
        features.append(
            {
                "type": "Feature",
                "id": canonical_id,
                "geometry": mapping(clipped),
                "properties": {
                    "canonical_id": canonical_id,
                    "name": preferred_name(item.tags),
                    "district": city_name,
                    "type": "Park",
                    "area_m2": round(area_m2, 1),
                    "osm_type": osm_type,
                    "osm_id": osm_id,
                },
            }
        )

    return sorted(
        features,
        key=lambda feature: (
            feature["properties"]["osm_type"],
            feature["properties"]["osm_id"],
        ),
    )


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
    boundary_relation: int,
    features: list[dict[str, Any]],
    data_as_of: str | None,
) -> None:
    payload: dict[str, Any] = {
        "type": "FeatureCollection",
        "cityId": city_id,
        "cityName": city_name,
        "boundaryRelation": boundary_relation,
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
    boundary = extract_boundary(args.pbf, args.boundary_relation)
    features = extract_parks(
        args.pbf,
        boundary,
        city_id,
        city_name,
    )
    if not features:
        raise RuntimeError(
            f"No public leisure=park polygons found for {city_name}"
        )
    data_as_of = pbf_data_as_of(args.pbf)
    write_geojson(
        args.output,
        city_id,
        city_name,
        args.boundary_relation,
        features,
        data_as_of,
    )
    print(
        f"{city_name}: wrote {len(features):,} OSM park polygons "
        f"to {args.output}"
    )


if __name__ == "__main__":
    main()
