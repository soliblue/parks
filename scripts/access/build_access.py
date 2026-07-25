#!/usr/bin/env python3
"""Build a static, population-weighted 10-minute park-access estimate.

The batch intentionally runs offline after downloading versioned/cacheable
inputs. It builds a pedestrian graph directly from OpenStreetMap PBF extracts,
so production remains a static site and no routing service or API key is
required.
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
import os
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from array import array
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import osmium
import rasterio
import shapely
from pyproj import Geod, Transformer
from rasterio.mask import mask as raster_mask
from scipy.sparse import coo_matrix, csr_matrix, hstack, vstack
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree
from shapely import contains_xy, from_geojson, make_valid, points, union_all
from shapely.geometry import (
    GeometryCollection,
    MultiPolygon,
    Polygon,
    box,
    mapping,
    shape,
)
from shapely.ops import transform as transform_geometry


SCHEMA_VERSION = 1
GRAPH_CACHE_VERSION = 2
GREEN_INVENTORY_VERSION = 2
POPULATION_YEAR = 2020
THRESHOLD_MINUTES = 10
THRESHOLD_METERS = 805.0
MINIMUM_PARK_AREA_M2 = 5_000.0
FORMAL_ENTRANCE_MAX_METERS = 30.0
BOUNDARY_INTERSECTION_MAX_METERS = 3.0
PERIMETER_FALLBACK_MAX_METERS = 61.0
MAX_POPULATION_SNAP_METERS = 200.0
BOUNDARY_SAMPLE_STEP_METERS = 30.0
POPULATION_CRS = "ESRI:54009"
USER_AGENT = "parks.soli.blue access batch/1 (+https://parks.soli.blue)"
POPULATION_TILE_BASE_URL = (
    "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/"
    "GHS_POP_GLOBE_R2023A/GHS_POP_E2020_GLOBE_R2023A_54009_100/"
    "V1-0/tiles"
)
JRC_DATASET_URL = (
    "https://data.jrc.ec.europa.eu/dataset/"
    "2ff68a52-5b5b-4a22-8f40-c41da8332cfe"
)
CGLS_RECORD_URL = "https://zenodo.org/records/3939050"
CGLS_TREE_URL = (
    "https://zenodo.org/api/records/3939050/files/"
    "PROBAV_LC100_global_v3.0.1_2019-nrt_"
    "Tree-CoverFraction-layer_EPSG-4326.tif/content"
)
CGLS_WATER_URL = (
    "https://zenodo.org/api/records/3939050/files/"
    "PROBAV_LC100_global_v3.0.1_2019-nrt_"
    "PermanentWater-CoverFraction-layer_EPSG-4326.tif/content"
)
CGLS_TREE_MD5 = "37b7914dd88503a41b88f6445700e425"
CGLS_WATER_MD5 = "6f1b2d8efeb5cde02e99bfc183eb4888"
CGLS_OBSERVATION_YEAR = 2019
CGLS_RESOLUTION_METERS = 100
CGLS_CACHE_VERSION = 1
GEOD = Geod(ellps="WGS84")

GREEN_CLASSES = (
    ("leisure", "park"),
    ("leisure", "nature_reserve"),
    ("natural", "wood"),
    ("landuse", "forest"),
)
GREEN_EXCLUDED_ACCESS = {
    "no",
    "private",
    "customers",
    "members",
    "permit",
    "agricultural",
    "forestry",
}
GREEN_EXPLICIT_PUBLIC_ACCESS = {"yes", "permissive", "designated"}


@dataclass(frozen=True)
class CityConfig:
    id: str
    name: str
    parks_relative_path: str
    boundary_url: str | None
    boundary_metadata_url: str
    boundary_title: str
    boundary_license: str
    boundary_relation: int | None
    osm_url: str
    osm_title: str
    projected_crs: str
    population_tiles: tuple[str, ...]
    plausible_population_range: tuple[int, int]


CITY_CONFIGS = (
    CityConfig(
        id="berlin",
        name="Berlin",
        parks_relative_path="public/data/berlin/parks.geojson",
        boundary_url=(
            "https://gdi.berlin.de/services/wfs/alkis_land?"
            "service=WFS&version=2.0.0&request=GetFeature&"
            "typeNames=alkis_land:landesgrenze&srsName=EPSG:4326&"
            "outputFormat=application/json"
        ),
        boundary_metadata_url=(
            "https://daten.berlin.de/datensaetze/"
            "alkis-berlin-landesgrenze-wfs-07b1347b"
        ),
        boundary_title="ALKIS Berlin Landesgrenze",
        boundary_license="Datenlizenz Deutschland – Zero – Version 2.0",
        boundary_relation=None,
        osm_url=(
            "https://download.geofabrik.de/europe/germany/"
            "berlin-latest.osm.pbf"
        ),
        osm_title="Geofabrik OpenStreetMap extract — Berlin",
        projected_crs="EPSG:32633",
        population_tiles=("R3_C20",),
        plausible_population_range=(3_200_000, 4_200_000),
    ),
    CityConfig(
        id="vienna",
        name="Wien",
        parks_relative_path="public/data/vienna/parks.geojson",
        boundary_url=(
            "https://data.wien.gv.at/daten/geo?"
            "service=WFS&version=1.1.0&request=GetFeature&"
            "typeName=ogdwien:LANDESGRENZEOGD&srsName=EPSG:4326&"
            "outputFormat=json"
        ),
        boundary_metadata_url=(
            "https://www.data.gv.at/katalog/dataset/"
            "stadt-wien_landesgrenzewien"
        ),
        boundary_title="Landesgrenze Wien",
        boundary_license="Creative Commons Namensnennung 4.0 – Stadt Wien",
        boundary_relation=None,
        osm_url="https://download.bbbike.org/osm/bbbike/Wien/Wien.osm.pbf",
        osm_title="BBBike OpenStreetMap extract — Wien",
        projected_crs="EPSG:32633",
        population_tiles=("R4_C20",),
        plausible_population_range=(1_650_000, 2_250_000),
    ),
    CityConfig(
        id="munich",
        name="München",
        parks_relative_path="public/data/munich/parks.geojson",
        boundary_url=None,
        boundary_metadata_url="https://www.openstreetmap.org/relation/62428",
        boundary_title="OpenStreetMap administrative boundary — München",
        boundary_license="Open Data Commons Open Database License 1.0",
        boundary_relation=62428,
        osm_url="https://download.bbbike.org/osm/bbbike/Muenchen/Muenchen.osm.pbf",
        osm_title="BBBike OpenStreetMap extract — München",
        projected_crs="EPSG:32632",
        population_tiles=("R4_C19",),
        plausible_population_range=(1_250_000, 1_850_000),
    ),
    CityConfig(
        id="stuttgart",
        name="Stuttgart",
        parks_relative_path="public/data/stuttgart/parks.geojson",
        boundary_url=None,
        boundary_metadata_url="https://www.openstreetmap.org/relation/2793104",
        boundary_title="OpenStreetMap administrative boundary — Stuttgart",
        boundary_license="Open Data Commons Open Database License 1.0",
        boundary_relation=2793104,
        osm_url="https://download.bbbike.org/osm/bbbike/Stuttgart/Stuttgart.osm.pbf",
        osm_title="BBBike OpenStreetMap extract — Stuttgart",
        projected_crs="EPSG:32632",
        population_tiles=("R4_C19",),
        plausible_population_range=(500_000, 800_000),
    ),
    CityConfig(
        id="madrid",
        name="Madrid",
        parks_relative_path="public/data/madrid/parks.geojson",
        boundary_url=None,
        boundary_metadata_url="https://www.openstreetmap.org/relation/5326784",
        boundary_title="OpenStreetMap administrative boundary — Madrid",
        boundary_license="Open Data Commons Open Database License 1.0",
        boundary_relation=5326784,
        osm_url="https://download.bbbike.org/osm/bbbike/Madrid/Madrid.osm.pbf",
        osm_title="BBBike OpenStreetMap extract — Madrid",
        projected_crs="EPSG:32630",
        population_tiles=("R5_C18",),
        plausible_population_range=(2_800_000, 3_900_000),
    ),
    CityConfig(
        id="barcelona",
        name="Barcelona",
        parks_relative_path="public/data/barcelona/parks.geojson",
        boundary_url=None,
        boundary_metadata_url="https://www.openstreetmap.org/relation/347950",
        boundary_title="OpenStreetMap administrative boundary — Barcelona",
        boundary_license="Open Data Commons Open Database License 1.0",
        boundary_relation=347950,
        osm_url="https://download.bbbike.org/osm/bbbike/Barcelona/Barcelona.osm.pbf",
        osm_title="BBBike OpenStreetMap extract — Barcelona",
        projected_crs="EPSG:32631",
        population_tiles=("R5_C19",),
        plausible_population_range=(1_300_000, 2_000_000),
    ),
    CityConfig(
        id="cairo",
        name="Kairo",
        parks_relative_path="public/data/cairo/parks.geojson",
        boundary_url=None,
        boundary_metadata_url="https://www.openstreetmap.org/relation/4103336",
        boundary_title="OpenStreetMap administrative boundary — Cairo Governorate",
        boundary_license="Open Data Commons Open Database License 1.0",
        boundary_relation=4103336,
        osm_url="https://download.geofabrik.de/africa/egypt-latest.osm.pbf",
        osm_title="Geofabrik OpenStreetMap extract — Egypt",
        projected_crs="EPSG:32636",
        population_tiles=("R6_C21",),
        plausible_population_range=(7_000_000, 13_500_000),
    ),
    CityConfig(
        id="paris",
        name="Paris",
        parks_relative_path="public/data/paris/parks.geojson",
        boundary_url=None,
        boundary_metadata_url="https://www.openstreetmap.org/relation/7444",
        boundary_title="OpenStreetMap administrative boundary — Paris",
        boundary_license="Open Data Commons Open Database License 1.0",
        boundary_relation=7444,
        osm_url="https://download.bbbike.org/osm/bbbike/Paris/Paris.osm.pbf",
        osm_title="BBBike OpenStreetMap extract — Paris",
        projected_crs="EPSG:32631",
        population_tiles=("R4_C19",),
        plausible_population_range=(1_750_000, 2_500_000),
    ),
    CityConfig(
        id="copenhagen",
        name="Kopenhagen",
        parks_relative_path="public/data/copenhagen/parks.geojson",
        boundary_url=(
            "https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=1.0.0&"
            "request=GetFeature&typeName=k101%3Akommunegraense&"
            "outputFormat=json&SRSNAME=EPSG%3A4326&"
            "CQL_FILTER=kommunekode%3D%270101%27"
        ),
        boundary_metadata_url=(
            "https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=2.0.0&"
            "request=GetCapabilities"
        ),
        boundary_title="Official municipal boundary — Copenhagen (code 0101)",
        boundary_license="Open data (WFS states no fees or access constraints)",
        boundary_relation=None,
        osm_url="https://download.geofabrik.de/europe/denmark-latest.osm.pbf",
        osm_title="Geofabrik OpenStreetMap extract — Denmark",
        projected_crs="EPSG:32633",
        population_tiles=("R3_C19",),
        plausible_population_range=(500_000, 800_000),
    ),
)


@dataclass(frozen=True)
class DownloadRecord:
    path: Path
    url: str
    sha256: str
    etag: str | None
    last_modified: str | None
    retrieved_at: str


@dataclass
class WalkGraph:
    matrix: csr_matrix
    x: np.ndarray
    y: np.ndarray
    formal_entrance_indices: np.ndarray
    parsed_way_count: int
    parsed_directed_edge_count: int


@dataclass
class ParkInventory:
    geometries: list[Any]
    union: Any
    all_union: Any
    access_all_union: Any
    input_count: int
    access_input_count: int
    eligible_count: int
    below_minimum_area_count: int
    invalid_or_empty_count: int
    excluded_access_count: int
    without_public_access_evidence_count: int
    class_counts: dict[str, int]
    access_class_counts: dict[str, int]
    source_sha256: str
    definition_version: int


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def geometry_sha256(geometry: Any) -> str:
    """Hash only canonical geometry, excluding volatile WFS envelope metadata."""
    normalized = shapely.normalize(geometry)
    return hashlib.sha256(
        shapely.to_wkb(normalized, output_dimension=2)
    ).hexdigest()


def atomic_write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def atomic_write_bytes(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(value)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def normalize_http_datetime(value: str | None) -> str | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError, OverflowError):
        return value


def load_download_record(path: Path, url: str) -> DownloadRecord | None:
    metadata_path = path.with_suffix(path.suffix + ".meta.json")
    if not path.exists() or not metadata_path.exists():
        return None
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    if metadata.get("url") != url:
        return None
    sha256 = metadata.get("sha256")
    if not isinstance(sha256, str) or len(sha256) != 64:
        sha256 = file_sha256(path)
    return DownloadRecord(
        path=path,
        url=url,
        sha256=sha256,
        etag=metadata.get("etag"),
        last_modified=metadata.get("lastModified"),
        retrieved_at=metadata.get("retrievedAt") or utc_now(),
    )


def download_cached(
    url: str,
    path: Path,
    *,
    refresh: bool,
    timeout_seconds: int = 300,
) -> tuple[DownloadRecord, bool]:
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = load_download_record(path, url)
    if existing and not refresh:
        return existing, False

    headers = {"User-Agent": USER_AGENT, "Accept-Encoding": "identity"}
    if existing and existing.etag:
        headers["If-None-Match"] = existing.etag
    if existing and existing.last_modified:
        headers["If-Modified-Since"] = existing.last_modified

    request = urllib.request.Request(url, headers=headers)
    try:
        response = urllib.request.urlopen(request, timeout=timeout_seconds)
    except urllib.error.HTTPError as error:
        if error.code == 304 and existing:
            return existing, False
        raise

    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".download", dir=path.parent
    )
    temporary_path = Path(temporary_name)
    try:
        digest = hashlib.sha256()
        with os.fdopen(descriptor, "wb") as output, response:
            for chunk in iter(lambda: response.read(1024 * 1024), b""):
                output.write(chunk)
                digest.update(chunk)
            response_headers = response.headers
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)

    digest_value = digest.hexdigest()
    unchanged_content = existing is not None and existing.sha256 == digest_value
    record = DownloadRecord(
        path=path,
        url=url,
        sha256=digest_value,
        # A server may omit or rewrite validators despite returning identical
        # bytes. Preserve the prior provenance in that case so a refreshed
        # analysis can still be a true no-op.
        etag=(
            existing.etag
            if unchanged_content
            else response_headers.get("ETag")
        ),
        last_modified=(
            existing.last_modified
            if unchanged_content
            else normalize_http_datetime(response_headers.get("Last-Modified"))
        ),
        retrieved_at=existing.retrieved_at if unchanged_content else utc_now(),
    )
    atomic_write_json(
        path.with_suffix(path.suffix + ".meta.json"),
        {
            "url": record.url,
            "sha256": record.sha256,
            "etag": record.etag,
            "lastModified": record.last_modified,
            "retrievedAt": record.retrieved_at,
        },
    )
    return record, not unchanged_content


def population_tile_url(tile_id: str) -> str:
    filename = (
        "GHS_POP_E2020_GLOBE_R2023A_54009_100_V1_0_"
        f"{tile_id}.zip"
    )
    return f"{POPULATION_TILE_BASE_URL}/{filename}"


def prime_shared_pbf_cache(
    project_root: Path, city: CityConfig, target: Path
) -> None:
    """Reuse the park-refresh PBF when it matches the routing source."""
    existing = load_download_record(target, city.osm_url)
    shared = project_root / ".cache/parks-sources" / f"{city.id}.osm.pbf"
    shared_metadata = shared.with_suffix(shared.suffix + ".source.json")
    if not shared.exists() or not shared_metadata.exists():
        return
    metadata = json.loads(shared_metadata.read_text(encoding="utf-8"))
    if metadata.get("url") != city.osm_url:
        return
    shared_sha256 = file_sha256(shared)
    if existing and existing.sha256 == shared_sha256:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.shared")
    temporary.unlink(missing_ok=True)
    try:
        os.link(shared, temporary)
    except OSError:
        shutil.copy2(shared, temporary)
    os.replace(temporary, target)
    atomic_write_json(
        target.with_suffix(target.suffix + ".meta.json"),
        {
            "url": city.osm_url,
            "sha256": shared_sha256,
            "etag": metadata.get("etag"),
            "lastModified": normalize_http_datetime(
                metadata.get("lastModified")
            ),
            "retrievedAt": metadata.get("retrievedAt") or utc_now(),
        },
    )


def extract_population_raster(
    archive: DownloadRecord,
    target: Path,
    *,
    archive_changed: bool,
    expected_crs: str,
) -> Path:
    if target.exists() and not archive_changed:
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive.path) as package:
        candidates = [
            name
            for name in package.namelist()
            if name.lower().endswith((".tif", ".tiff"))
        ]
        if len(candidates) != 1:
            raise RuntimeError(
                f"Expected one TIFF in {archive.path}, found {len(candidates)}"
            )
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{target.name}.", suffix=".extract", dir=target.parent
        )
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "wb") as output, package.open(
                candidates[0]
            ) as source:
                for chunk in iter(lambda: source.read(1024 * 1024), b""):
                    output.write(chunk)
            os.replace(temporary_path, target)
        finally:
            temporary_path.unlink(missing_ok=True)

    with rasterio.open(target) as dataset:
        expected = rasterio.crs.CRS.from_string(expected_crs)
        if dataset.crs is None or dataset.crs != expected:
            raise RuntimeError(
                f"Population raster CRS is {dataset.crs}, expected {expected_crs}"
            )
        if tuple(round(value, 3) for value in dataset.res) != (100.0, 100.0):
            raise RuntimeError(
                f"Population raster resolution is {dataset.res}, expected 100 m"
            )
    return target


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


def load_boundary(path: Path, transformer: Transformer) -> tuple[Any, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    features = payload.get("features")
    if not isinstance(features, list) or not features:
        raise RuntimeError(f"{path}: boundary is not a populated FeatureCollection")
    geographic_parts = []
    for feature in features:
        geometry_value = feature.get("geometry")
        if geometry_value:
            geographic_parts.append(polygonal_only(make_valid(shape(geometry_value))))
    geographic_parts = [part for part in geographic_parts if not part.is_empty]
    if not geographic_parts:
        raise RuntimeError(f"{path}: no polygonal boundary geometry")
    geographic = make_valid(union_all(geographic_parts))
    projected = make_valid(
        transform_geometry(transformer.transform, geographic)
    )
    return geographic, projected


def extract_osm_boundary(pbf_path: Path, relation_id: int) -> Any:
    factory = osmium.geom.GeoJSONFactory()
    for item in (
        osmium.FileProcessor(str(pbf_path)).with_locations().with_areas()
    ):
        if (
            item.is_area()
            and not item.from_way()
            and item.orig_id() == relation_id
        ):
            geometry = polygonal_only(
                make_valid(from_geojson(factory.create_multipolygon(item)))
            )
            if not geometry.is_empty:
                return geometry
    raise RuntimeError(
        f"OSM boundary relation {relation_id} was not found in {pbf_path}"
    )


def load_or_extract_osm_boundary(
    pbf: DownloadRecord, relation_id: int, cache_path: Path
) -> Any:
    metadata_path = cache_path.with_suffix(cache_path.suffix + ".meta.json")
    if cache_path.exists() and metadata_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if (
            metadata.get("pbfSha256") == pbf.sha256
            and metadata.get("relationId") == relation_id
        ):
            transformer = Transformer.from_crs(
                "EPSG:4326", "EPSG:4326", always_xy=True
            )
            return load_boundary(cache_path, transformer)[0]

    geometry = extract_osm_boundary(pbf.path, relation_id)
    atomic_write_json(
        cache_path,
        {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": mapping(geometry),
                    "properties": {"osmRelationId": relation_id},
                }
            ],
        },
    )
    atomic_write_json(
        metadata_path,
        {
            "pbfSha256": pbf.sha256,
            "relationId": relation_id,
            "generatedAt": utc_now(),
        },
    )
    return geometry


def comparison_green_class(tags: Any) -> str | None:
    for key, value in GREEN_CLASSES:
        if tags.get(key) == value:
            return f"{key}={value}"
    if tags.get("leisure") == "garden":
        return "leisure=garden"
    return None


def is_routable_green_class(green_class: str, access: str | None) -> bool:
    return green_class in {
        "leisure=park",
        "leisure=nature_reserve",
        "leisure=garden",
    } or access in GREEN_EXPLICIT_PUBLIC_ACCESS


def area_bounds(item: Any) -> tuple[float, float, float, float] | None:
    min_lon = math.inf
    min_lat = math.inf
    max_lon = -math.inf
    max_lat = -math.inf
    try:
        for ring in item.outer_rings():
            for node in ring:
                if not node.location.valid():
                    continue
                min_lon = min(min_lon, node.location.lon)
                min_lat = min(min_lat, node.location.lat)
                max_lon = max(max_lon, node.location.lon)
                max_lat = max(max_lat, node.location.lat)
    except (AttributeError, RuntimeError, ValueError):
        return None
    if not math.isfinite(min_lon):
        return None
    return min_lon, min_lat, max_lon, max_lat


def bounds_intersect(
    left: tuple[float, float, float, float],
    right: tuple[float, float, float, float],
) -> bool:
    return not (
        left[2] < right[0]
        or left[0] > right[2]
        or left[3] < right[1]
        or left[1] > right[3]
    )


def polygon_components(geometry: Any) -> list[Any]:
    if geometry.is_empty:
        return []
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, (MultiPolygon, GeometryCollection)):
        components: list[Any] = []
        for part in geometry.geoms:
            components.extend(polygon_components(part))
        return components
    return []


def inventory_from_unions(
    *,
    all_union: Any,
    access_union: Any,
    input_count: int,
    access_input_count: int,
    invalid_or_empty_count: int,
    excluded_access_count: int,
    without_public_access_evidence_count: int,
    class_counts: dict[str, int],
    access_class_counts: dict[str, int],
    source_sha256: str,
) -> ParkInventory:
    components = polygon_components(polygonal_only(make_valid(access_union)))
    eligible = [
        component
        for component in components
        if component.area >= MINIMUM_PARK_AREA_M2
    ]
    if not eligible:
        raise RuntimeError("No harmonized green spaces meet the 0.5 ha rule")
    eligible_union = polygonal_only(make_valid(union_all(eligible)))
    return ParkInventory(
        geometries=eligible,
        union=eligible_union,
        all_union=polygonal_only(make_valid(all_union)),
        access_all_union=polygonal_only(make_valid(access_union)),
        input_count=input_count,
        access_input_count=access_input_count,
        eligible_count=len(eligible),
        below_minimum_area_count=len(components) - len(eligible),
        invalid_or_empty_count=invalid_or_empty_count,
        excluded_access_count=excluded_access_count,
        without_public_access_evidence_count=(
            without_public_access_evidence_count
        ),
        class_counts=class_counts,
        access_class_counts=access_class_counts,
        source_sha256=source_sha256,
        definition_version=GREEN_INVENTORY_VERSION,
    )


def comparison_inventory_cache_key(
    *,
    pbf_sha256: str,
    boundary_sha256: str,
    projected_crs: str,
) -> str:
    material = {
        "version": GREEN_INVENTORY_VERSION,
        "pbfSha256": pbf_sha256,
        "boundaryGeometrySha256": boundary_sha256,
        "projectedCrs": projected_crs,
        "classes": list(GREEN_CLASSES),
        "excludedAccess": sorted(GREEN_EXCLUDED_ACCESS),
        "explicitPublicAccess": sorted(GREEN_EXPLICIT_PUBLIC_ACCESS),
        "gardenRule": "explicit-public-no-fee",
        "feeRule": "exclude-fee-yes",
        "restrictionPrecedence": "restricted-area-subtracted-after-union",
        "areaRule": "core-classes-regardless-access-public-no-fee-gardens",
        "candidateCounting": "boundary-bbox-intersection",
        "routingRule": (
            "park-nature-reserve-public-garden-or-explicit-public-woodland"
        ),
        "minimumAccessAreaM2": MINIMUM_PARK_AREA_M2,
        "shapelyVersion": shapely.__version__,
    }
    encoded = json.dumps(
        material, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:20]


def extract_comparison_green(
    *,
    pbf: DownloadRecord,
    geographic_boundary: Any,
    projected_boundary: Any,
    transformer: Transformer,
) -> ParkInventory:
    factory = osmium.geom.GeoJSONFactory()
    boundary_bounds = geographic_boundary.bounds
    projected_parts: list[Any] = []
    access_projected_parts: list[Any] = []
    excluded_projected_parts: list[Any] = []
    input_count = 0
    access_input_count = 0
    invalid_or_empty = 0
    excluded_access = 0
    without_public_access_evidence = 0
    class_counts: dict[str, int] = {}
    access_class_counts: dict[str, int] = {}

    for item in (
        osmium.FileProcessor(str(pbf.path)).with_locations().with_areas()
    ):
        if not item.is_area():
            continue
        green_class = comparison_green_class(item.tags)
        if green_class is None:
            continue
        cheap_bounds = area_bounds(item)
        if cheap_bounds is None:
            continue
        if not bounds_intersect(cheap_bounds, boundary_bounds):
            continue
        input_count += 1
        access = item.tags.get("access")
        hard_restricted = (
            access in GREEN_EXCLUDED_ACCESS
            or item.tags.get("fee") == "yes"
        )
        garden_without_public_access = (
            green_class == "leisure=garden"
            and access not in GREEN_EXPLICIT_PUBLIC_ACCESS
        )
        try:
            geographic = polygonal_only(
                make_valid(from_geojson(factory.create_multipolygon(item)))
            )
            if geographic.is_empty or not geographic.intersects(
                geographic_boundary
            ):
                continue
            geographic = polygonal_only(
                make_valid(geographic.intersection(geographic_boundary))
            )
            projected = polygonal_only(
                make_valid(
                    transform_geometry(transformer.transform, geographic)
                )
            )
            projected = polygonal_only(
                make_valid(projected.intersection(projected_boundary))
            )
        except Exception:
            invalid_or_empty += 1
            continue
        if projected.is_empty or projected.area <= 0:
            invalid_or_empty += 1
            continue
        if hard_restricted:
            excluded_access += 1
            excluded_projected_parts.append(projected)
        if garden_without_public_access or (
            green_class == "leisure=garden"
            and item.tags.get("fee") == "yes"
        ):
            continue
        projected_parts.append(projected)
        class_counts[green_class] = class_counts.get(green_class, 0) + 1
        if hard_restricted:
            continue
        if is_routable_green_class(green_class, access):
            access_projected_parts.append(projected)
            access_input_count += 1
            access_class_counts[green_class] = (
                access_class_counts.get(green_class, 0) + 1
            )
        else:
            without_public_access_evidence += 1

    if not projected_parts:
        raise RuntimeError(f"{pbf.path}: no harmonized green-space polygons")
    if not access_projected_parts:
        raise RuntimeError(
            f"{pbf.path}: no harmonized publicly routable green-space polygons"
        )
    excluded_union = (
        polygonal_only(make_valid(union_all(excluded_projected_parts)))
        if excluded_projected_parts
        else GeometryCollection()
    )
    all_union = polygonal_only(make_valid(union_all(projected_parts)))
    access_union = polygonal_only(
        make_valid(
            union_all(access_projected_parts).difference(excluded_union)
        )
    )
    return inventory_from_unions(
        all_union=all_union,
        access_union=access_union,
        input_count=input_count,
        access_input_count=access_input_count,
        invalid_or_empty_count=invalid_or_empty,
        excluded_access_count=excluded_access,
        without_public_access_evidence_count=(
            without_public_access_evidence
        ),
        class_counts=class_counts,
        access_class_counts=access_class_counts,
        source_sha256=pbf.sha256,
    )


def prune_stale_inventory_caches(active_path: Path) -> None:
    city_id = active_path.name.split("-", 1)[0]
    older = sorted(
        (
            path
            for path in active_path.parent.glob(f"{city_id}-*.wkb")
            if path != active_path and ".access." not in path.name
        ),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for stale_path in older[1:]:
        stale_path.unlink(missing_ok=True)
        stale_path.with_suffix(".access.wkb").unlink(missing_ok=True)
        stale_path.with_suffix(".meta.json").unlink(missing_ok=True)


def load_or_build_comparison_inventory(
    *,
    city: CityConfig,
    pbf: DownloadRecord,
    geographic_boundary: Any,
    projected_boundary: Any,
    boundary_sha256: str,
    transformer: Transformer,
    cache_directory: Path,
) -> ParkInventory:
    key = comparison_inventory_cache_key(
        pbf_sha256=pbf.sha256,
        boundary_sha256=boundary_sha256,
        projected_crs=city.projected_crs,
    )
    cache_path = cache_directory / f"{city.id}-{key}.wkb"
    access_cache_path = cache_path.with_suffix(".access.wkb")
    metadata_path = cache_path.with_suffix(".meta.json")
    if (
        cache_path.exists()
        and access_cache_path.exists()
        and metadata_path.exists()
    ):
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("cacheKey") == key:
            print(
                f"  loading cached harmonized green inventory "
                f"{cache_path.name}",
                flush=True,
            )
            inventory = inventory_from_unions(
                all_union=shapely.from_wkb(cache_path.read_bytes()),
                access_union=shapely.from_wkb(
                    access_cache_path.read_bytes()
                ),
                input_count=int(metadata["inputCount"]),
                access_input_count=int(metadata["accessInputCount"]),
                invalid_or_empty_count=int(metadata["invalidOrEmptyCount"]),
                excluded_access_count=int(metadata["excludedAccessCount"]),
                without_public_access_evidence_count=int(
                    metadata["withoutPublicAccessEvidenceCount"]
                ),
                class_counts={
                    str(class_name): int(count)
                    for class_name, count in metadata["classCounts"].items()
                },
                access_class_counts={
                    str(class_name): int(count)
                    for class_name, count in metadata[
                        "accessClassCounts"
                    ].items()
                },
                source_sha256=pbf.sha256,
            )
            prune_stale_inventory_caches(cache_path)
            return inventory

    print(f"  extracting harmonized green spaces from {pbf.path.name}", flush=True)
    inventory = extract_comparison_green(
        pbf=pbf,
        geographic_boundary=geographic_boundary,
        projected_boundary=projected_boundary,
        transformer=transformer,
    )
    atomic_write_bytes(
        cache_path,
        shapely.to_wkb(inventory.all_union, output_dimension=2),
    )
    atomic_write_bytes(
        access_cache_path,
        shapely.to_wkb(inventory.access_all_union, output_dimension=2),
    )
    atomic_write_json(
        metadata_path,
        {
            "cacheKey": key,
            "pbfSha256": pbf.sha256,
            "boundaryGeometrySha256": boundary_sha256,
            "projectedCrs": city.projected_crs,
            "definitionVersion": GREEN_INVENTORY_VERSION,
            "inputCount": inventory.input_count,
            "accessInputCount": inventory.access_input_count,
            "invalidOrEmptyCount": inventory.invalid_or_empty_count,
            "excludedAccessCount": inventory.excluded_access_count,
            "withoutPublicAccessEvidenceCount": (
                inventory.without_public_access_evidence_count
            ),
            "classCounts": inventory.class_counts,
            "accessClassCounts": inventory.access_class_counts,
            "generatedAt": utc_now(),
        },
    )
    prune_stale_inventory_caches(cache_path)
    return inventory


def remote_raster_mask(
    url: str, geographic_boundary: Any
) -> tuple[np.ma.MaskedArray, Any]:
    for attempt in range(4):
        try:
            with rasterio.open(url) as dataset:
                values, transform = raster_mask(
                    dataset,
                    [mapping(geographic_boundary)],
                    crop=True,
                    filled=False,
                    all_touched=False,
                )
            return np.ma.asarray(values[0]), transform
        except Exception:
            if attempt == 3:
                raise
            time.sleep(1 + attempt)
    raise RuntimeError("Unreachable raster retry state")


def load_or_calculate_tree_cover(
    *,
    city: CityConfig,
    geographic_boundary: Any,
    boundary_sha256: str,
    cache_directory: Path,
) -> dict[str, Any]:
    cache_key_material = json.dumps(
        {
            "version": CGLS_CACHE_VERSION,
            "boundaryGeometrySha256": boundary_sha256,
            "treeMd5": CGLS_TREE_MD5,
            "waterMd5": CGLS_WATER_MD5,
            "mask": "pixel-centre",
            "denominator": "land-area",
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    key = hashlib.sha256(cache_key_material).hexdigest()[:20]
    cache_path = cache_directory / f"{city.id}-{key}.json"
    if cache_path.exists():
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
        if cached.get("cacheKey") == key:
            print(
                f"  loading cached tree-cover estimate {cache_path.name}",
                flush=True,
            )
            return cached["metric"]

    print("  calculating harmonized 2019 tree-cover estimate", flush=True)
    cache_directory.mkdir(parents=True, exist_ok=True)
    with rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
        GDAL_HTTP_CONNECTTIMEOUT="20",
        GDAL_HTTP_TIMEOUT="60",
        GDAL_HTTP_MAX_RETRY="5",
        GDAL_HTTP_RETRY_DELAY="1",
    ):
        tree, transform = remote_raster_mask(
            CGLS_TREE_URL, geographic_boundary
        )
        water, water_transform = remote_raster_mask(
            CGLS_WATER_URL, geographic_boundary
        )
    if tree.shape != water.shape or transform != water_transform:
        raise RuntimeError(
            f"{city.name}: CGLS tree and water grids do not align"
        )

    tree_values = np.asarray(tree.data)
    water_values = np.asarray(water.data)
    valid = (~np.ma.getmaskarray(tree)) & (~np.ma.getmaskarray(water))
    valid &= (tree_values >= 0) & (tree_values <= 100)
    valid &= (water_values >= 0) & (water_values <= 100)
    if not np.any(valid):
        raise RuntimeError(f"{city.name}: no valid CGLS pixels")

    row_count, column_count = tree.shape
    row_area_m2 = np.empty(row_count, dtype=np.float64)
    x1 = transform.c
    x2 = transform.c + transform.a
    for row in range(row_count):
        y1 = transform.f + row * transform.e
        y2 = y1 + transform.e
        signed_area, _ = GEOD.polygon_area_perimeter(
            [x1, x2, x2, x1],
            [y1, y1, y2, y2],
        )
        row_area_m2[row] = abs(signed_area)
    pixel_area_m2 = np.broadcast_to(
        row_area_m2[:, None], (row_count, column_count)
    )
    tree_fraction = tree_values.astype(np.float64) / 100.0
    water_fraction = water_values.astype(np.float64) / 100.0
    tree_area_m2 = float(
        np.sum(tree_fraction[valid] * pixel_area_m2[valid])
    )
    land_area_m2 = float(
        np.sum((1.0 - water_fraction[valid]) * pixel_area_m2[valid])
    )
    if land_area_m2 <= 0:
        raise RuntimeError(f"{city.name}: CGLS land denominator is zero")
    metric = {
        "areaM2": int(round(tree_area_m2)),
        "landAreaM2": int(round(land_area_m2)),
        "sharePercent": round((tree_area_m2 / land_area_m2) * 100, 1),
        "observationYear": CGLS_OBSERVATION_YEAR,
        "resolutionMeters": CGLS_RESOLUTION_METERS,
        "denominator": "land-area",
    }
    atomic_write_json(
        cache_path,
        {
            "cacheKey": key,
            "boundaryGeometrySha256": boundary_sha256,
            "treeMd5": CGLS_TREE_MD5,
            "waterMd5": CGLS_WATER_MD5,
            "validPixelCount": int(np.count_nonzero(valid)),
            "metric": metric,
            "generatedAt": utc_now(),
        },
    )
    older = sorted(
        (
            path
            for path in cache_directory.glob(f"{city.id}-*.json")
            if path != cache_path
        ),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for stale_path in older[1:]:
        stale_path.unlink(missing_ok=True)
    return metric


EXCLUDED_HIGHWAYS = {
    "abandoned",
    "bus_guideway",
    "construction",
    "motorway",
    "motorway_link",
    "proposed",
    "raceway",
    "trunk",
    "trunk_link",
}
EXPLICIT_FOOT_ALLOWED = {"yes", "designated", "permissive", "destination"}
EXCLUDED_ACCESS = {"no", "private", "customers", "agricultural", "forestry"}
FORMAL_BARRIERS = {"gate", "entrance", "kissing_gate", "stile", "lift_gate"}


def is_walkable_way(tags: Any) -> bool:
    highway = tags.get("highway")
    if not highway:
        return False
    foot = tags.get("foot")
    access = tags.get("access")
    if foot in {"no", "private", "use_sidepath"}:
        return False
    if highway in EXCLUDED_HIGHWAYS and foot not in EXPLICIT_FOOT_ALLOWED:
        return False
    if access in EXCLUDED_ACCESS and foot not in EXPLICIT_FOOT_ALLOWED:
        return False
    if tags.get("area") == "yes":
        return False
    return True


class WalkGraphHandler(osmium.SimpleHandler):
    def __init__(self, bounding_box: tuple[float, float, float, float]) -> None:
        super().__init__()
        self.min_lon, self.min_lat, self.max_lon, self.max_lat = bounding_box
        self.node_index: dict[int, int] = {}
        self.longitudes = array("d")
        self.latitudes = array("d")
        self.edge_from = array("I")
        self.edge_to = array("I")
        self.blocked_node_ids: set[int] = set()
        self.formal_node_ids: set[int] = set()
        self.walkable_way_count = 0

    def node(self, node: Any) -> None:
        foot = node.tags.get("foot")
        access = node.tags.get("access")
        barrier = node.tags.get("barrier")
        entrance = node.tags.get("entrance")
        explicitly_allowed = foot in EXPLICIT_FOOT_ALLOWED
        if foot in {"no", "private"} or (
            access in {"no", "private"} and not explicitly_allowed
        ):
            self.blocked_node_ids.add(node.id)
        if (
            (barrier in FORMAL_BARRIERS or (entrance and entrance != "no"))
            and foot not in {"no", "private"}
            and access not in {"no", "private"}
        ):
            self.formal_node_ids.add(node.id)

    def compact_index(self, reference: Any) -> int:
        node_id = reference.ref
        existing = self.node_index.get(node_id)
        if existing is not None:
            return existing
        index = len(self.longitudes)
        self.node_index[node_id] = index
        self.longitudes.append(reference.location.lon)
        self.latitudes.append(reference.location.lat)
        return index

    def segment_near_city(
        self, left_lon: float, left_lat: float, right_lon: float, right_lat: float
    ) -> bool:
        return not (
            max(left_lon, right_lon) < self.min_lon
            or min(left_lon, right_lon) > self.max_lon
            or max(left_lat, right_lat) < self.min_lat
            or min(left_lat, right_lat) > self.max_lat
        )

    def way(self, way: Any) -> None:
        if not is_walkable_way(way.tags):
            return
        references = list(way.nodes)
        if len(references) < 2:
            return

        oneway_foot = way.tags.get("oneway:foot")
        forward = oneway_foot not in {"-1", "reverse"}
        backward = oneway_foot not in {"yes", "1", "true"}
        if way.tags.get("foot:forward") in {"no", "private"}:
            forward = False
        if way.tags.get("foot:backward") in {"no", "private"}:
            backward = False
        if not forward and not backward:
            return

        added = False
        for left, right in zip(references, references[1:]):
            if (
                not left.location.valid()
                or not right.location.valid()
                or left.ref in self.blocked_node_ids
                or right.ref in self.blocked_node_ids
            ):
                continue
            if not self.segment_near_city(
                left.location.lon,
                left.location.lat,
                right.location.lon,
                right.location.lat,
            ):
                continue
            left_index = self.compact_index(left)
            right_index = self.compact_index(right)
            if left_index == right_index:
                continue
            if forward:
                self.edge_from.append(left_index)
                self.edge_to.append(right_index)
            if backward:
                self.edge_from.append(right_index)
                self.edge_to.append(left_index)
            added = True
        if added:
            self.walkable_way_count += 1


def graph_cache_key(
    pbf_sha256: str, bounding_box: tuple[float, float, float, float]
) -> str:
    material = json.dumps(
        {
            "version": GRAPH_CACHE_VERSION,
            "pbfSha256": pbf_sha256,
            "boundingBox": [round(value, 7) for value in bounding_box],
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:20]


def save_graph_cache(path: Path, graph: WalkGraph) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_name(f".{path.name}.tmp.npz")
    np.savez(
        temporary_path,
        data=graph.matrix.data.astype(np.float32, copy=False),
        indices=graph.matrix.indices.astype(np.int32, copy=False),
        indptr=graph.matrix.indptr.astype(np.int32, copy=False),
        x=graph.x.astype(np.float64, copy=False),
        y=graph.y.astype(np.float64, copy=False),
        formal=graph.formal_entrance_indices.astype(np.int32, copy=False),
        parsed_way_count=np.asarray([graph.parsed_way_count], dtype=np.int64),
        parsed_directed_edge_count=np.asarray(
            [graph.parsed_directed_edge_count], dtype=np.int64
        ),
    )
    os.replace(temporary_path, path)


def load_graph_cache(path: Path) -> WalkGraph:
    with np.load(path, allow_pickle=False) as values:
        x = values["x"]
        y = values["y"]
        count = x.size
        matrix = csr_matrix(
            (values["data"], values["indices"], values["indptr"]),
            shape=(count, count),
        )
        return WalkGraph(
            matrix=matrix,
            x=x,
            y=y,
            formal_entrance_indices=values["formal"],
            parsed_way_count=int(values["parsed_way_count"][0]),
            parsed_directed_edge_count=int(
                values["parsed_directed_edge_count"][0]
            ),
        )


def prune_stale_graph_caches(active_path: Path) -> None:
    """Keep the active graph and at most one rollback cache for this city."""
    city_id = active_path.name.split("-", 1)[0]
    older = sorted(
        (
            path
            for path in active_path.parent.glob(f"{city_id}-*.npz")
            if path != active_path
        ),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for stale_path in older[1:]:
        stale_path.unlink(missing_ok=True)


def build_or_load_walk_graph(
    *,
    city: CityConfig,
    pbf: DownloadRecord,
    geographic_boundary: Any,
    transformer: Transformer,
    graph_cache_directory: Path,
) -> tuple[WalkGraph, bool]:
    min_lon, min_lat, max_lon, max_lat = geographic_boundary.bounds
    # Roughly two kilometres, enough to avoid edge effects for the 805 m search.
    margin_lon = 0.035
    margin_lat = 0.022
    bounding_box = (
        min_lon - margin_lon,
        min_lat - margin_lat,
        max_lon + margin_lon,
        max_lat + margin_lat,
    )
    key = graph_cache_key(pbf.sha256, bounding_box)
    cache_path = graph_cache_directory / f"{city.id}-{key}.npz"
    if cache_path.exists():
        print(f"  loading cached pedestrian graph {cache_path.name}", flush=True)
        graph = load_graph_cache(cache_path)
        prune_stale_graph_caches(cache_path)
        return graph, True

    print(f"  parsing pedestrian graph from {pbf.path.name}", flush=True)
    handler = WalkGraphHandler(bounding_box)
    handler.apply_file(str(pbf.path), locations=True, idx="flex_mem")
    if not handler.edge_from:
        raise RuntimeError(f"{city.name}: OSM extract produced no walking edges")

    longitudes = np.frombuffer(handler.longitudes, dtype=np.float64)
    latitudes = np.frombuffer(handler.latitudes, dtype=np.float64)
    x, y = transformer.transform(longitudes, latitudes)
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    edge_from = np.frombuffer(handler.edge_from, dtype=np.uint32).astype(
        np.int32, copy=False
    )
    edge_to = np.frombuffer(handler.edge_to, dtype=np.uint32).astype(
        np.int32, copy=False
    )
    edge_lengths = np.hypot(
        x[edge_to] - x[edge_from], y[edge_to] - y[edge_from]
    ).astype(np.float32)
    valid = np.isfinite(edge_lengths) & (edge_lengths > 0)
    edge_from = edge_from[valid]
    edge_to = edge_to[valid]
    edge_lengths = edge_lengths[valid]
    node_count = x.size

    weighted = coo_matrix(
        (edge_lengths, (edge_from, edge_to)),
        shape=(node_count, node_count),
        dtype=np.float32,
    ).tocsr()
    duplicate_counts = coo_matrix(
        (
            np.ones(edge_lengths.size, dtype=np.float32),
            (edge_from, edge_to),
        ),
        shape=(node_count, node_count),
        dtype=np.float32,
    ).tocsr()
    # Parallel OSM ways between identical nodes have the same geometric length.
    # Averaging prevents scipy's duplicate COO entries from being summed.
    weighted.data /= duplicate_counts.data
    weighted.eliminate_zeros()

    formal_indices = np.fromiter(
        (
            handler.node_index[node_id]
            for node_id in handler.formal_node_ids
            if node_id in handler.node_index
        ),
        dtype=np.int32,
    )
    graph = WalkGraph(
        matrix=weighted,
        x=x,
        y=y,
        formal_entrance_indices=np.unique(formal_indices),
        parsed_way_count=handler.walkable_way_count,
        parsed_directed_edge_count=int(edge_lengths.size),
    )
    save_graph_cache(cache_path, graph)
    prune_stale_graph_caches(cache_path)
    del handler, edge_from, edge_to, edge_lengths, duplicate_counts
    gc.collect()
    return graph, False


def iter_line_coordinates(geometry: Any) -> Iterable[list[tuple[float, float]]]:
    boundary = geometry.boundary
    if boundary.geom_type == "LineString":
        yield list(boundary.coords)
    elif boundary.geom_type == "MultiLineString":
        for line in boundary.geoms:
            yield list(line.coords)
    elif boundary.geom_type == "GeometryCollection":
        for part in boundary.geoms:
            if part.geom_type == "LineString":
                yield list(part.coords)
            elif part.geom_type == "MultiLineString":
                for line in part.geoms:
                    yield list(line.coords)


def sample_boundary(
    geometry: Any, step_meters: float = BOUNDARY_SAMPLE_STEP_METERS
) -> np.ndarray:
    samples: list[tuple[float, float]] = []
    for coordinates in iter_line_coordinates(geometry):
        for start, end in zip(coordinates, coordinates[1:]):
            dx = end[0] - start[0]
            dy = end[1] - start[1]
            length = math.hypot(dx, dy)
            segment_count = max(1, math.ceil(length / step_meters))
            for index in range(segment_count):
                fraction = index / segment_count
                samples.append(
                    (start[0] + dx * fraction, start[1] + dy * fraction)
                )
    if not samples:
        representative = geometry.representative_point()
        samples.append((representative.x, representative.y))
    return np.asarray(samples, dtype=np.float64)


def update_source_weight(
    source_weights: dict[int, float], node_index: int, weight: float
) -> None:
    weight = max(0.001, float(weight))
    previous = source_weights.get(int(node_index))
    if previous is None or weight < previous:
        source_weights[int(node_index)] = weight


def build_access_sources(
    graph: WalkGraph, parks: ParkInventory, node_tree: cKDTree
) -> tuple[dict[int, float], dict[str, int]]:
    node_inside_park = contains_xy(parks.union, graph.x, graph.y)
    inside_indices = np.flatnonzero(node_inside_park)
    source_weights = {int(index): 0.001 for index in inside_indices}

    # Add the outside endpoint of every edge that crosses a park boundary. Its
    # connector cost is the projected distance back to that boundary.
    edge_rows, edge_columns = graph.matrix.nonzero()
    crossing = node_inside_park[edge_rows] != node_inside_park[edge_columns]
    crossing_outside = np.where(
        node_inside_park[edge_rows[crossing]],
        edge_columns[crossing],
        edge_rows[crossing],
    )
    crossing_outside = np.unique(crossing_outside)
    if crossing_outside.size:
        connector_distances = shapely.distance(
            points(graph.x[crossing_outside], graph.y[crossing_outside]),
            parks.union,
        )
        for index, distance_value in zip(
            crossing_outside, connector_distances
        ):
            update_source_weight(source_weights, int(index), float(distance_value))

    formal_indices = graph.formal_entrance_indices
    formal_near = np.empty(0, dtype=np.int32)
    if formal_indices.size:
        formal_distances = shapely.distance(
            points(graph.x[formal_indices], graph.y[formal_indices]),
            parks.union,
        )
        formal_mask = formal_distances <= FORMAL_ENTRANCE_MAX_METERS
        formal_near = formal_indices[formal_mask]
        for index, distance_value in zip(
            formal_near, formal_distances[formal_mask]
        ):
            update_source_weight(source_weights, int(index), float(distance_value))

    formal_tree = (
        cKDTree(
            np.column_stack(
                (graph.x[formal_indices], graph.y[formal_indices])
            )
        )
        if formal_indices.size
        else None
    )
    internal_parks = 0
    boundary_intersection_parks = 0
    mapped_entrance_parks = 0
    fallback_parks = 0
    without_access_parks = 0

    for park in parks.geometries:
        min_x, min_y, max_x, max_y = park.bounds
        center = ((min_x + max_x) / 2, (min_y + max_y) / 2)
        radius = math.hypot(max_x - min_x, max_y - min_y) / 2 + 1
        candidates = node_tree.query_ball_point(center, radius)
        if candidates:
            candidate_array = np.asarray(candidates, dtype=np.int32)
            if np.any(
                contains_xy(
                    park,
                    graph.x[candidate_array],
                    graph.y[candidate_array],
                )
            ):
                internal_parks += 1
                continue

        boundary_samples = sample_boundary(park)
        distances, indices = node_tree.query(
            boundary_samples, k=1, workers=-1
        )
        nearest_position = int(np.argmin(distances))
        nearest_distance = float(distances[nearest_position])
        nearest_index = int(indices[nearest_position])
        if nearest_distance <= BOUNDARY_INTERSECTION_MAX_METERS:
            update_source_weight(source_weights, nearest_index, nearest_distance)
            boundary_intersection_parks += 1
            continue

        if formal_tree is not None:
            formal_distances, formal_positions = formal_tree.query(
                boundary_samples, k=1, workers=-1
            )
            formal_position = int(np.argmin(formal_distances))
            formal_distance = float(formal_distances[formal_position])
            if formal_distance <= FORMAL_ENTRANCE_MAX_METERS:
                formal_index = int(formal_indices[int(formal_positions[formal_position])])
                update_source_weight(
                    source_weights, formal_index, formal_distance
                )
                mapped_entrance_parks += 1
                continue

        if nearest_distance <= PERIMETER_FALLBACK_MAX_METERS:
            update_source_weight(source_weights, nearest_index, nearest_distance)
            fallback_parks += 1
        else:
            without_access_parks += 1

    guardrails = {
        "eligibleParkCount": parks.eligible_count,
        "parksWithInternalPedestrianNetwork": internal_parks,
        "parksWithBoundaryNetworkIntersection": boundary_intersection_parks,
        "parksUsingMappedEntrance": mapped_entrance_parks,
        "parksUsingPerimeterFallback": fallback_parks,
        "parksWithoutNetworkAccess": without_access_parks,
        "internalNetworkNodeCount": int(inside_indices.size),
        "boundaryCrossingNodeCount": int(crossing_outside.size),
        "mappedEntranceNodeCount": int(formal_near.size),
    }
    classified = (
        internal_parks
        + boundary_intersection_parks
        + mapped_entrance_parks
        + fallback_parks
        + without_access_parks
    )
    if classified != parks.eligible_count:
        raise RuntimeError(
            f"Park access classification mismatch: {classified} != "
            f"{parks.eligible_count}"
        )
    if not source_weights:
        raise RuntimeError("No pedestrian access sources were created")
    return source_weights, guardrails


def route_to_nearest_park(
    graph: WalkGraph, source_weights: dict[int, float]
) -> np.ndarray:
    node_count = graph.x.size
    source_nodes = np.fromiter(source_weights.keys(), dtype=np.int32)
    source_costs = np.fromiter(source_weights.values(), dtype=np.float32)
    source_row = csr_matrix(
        (
            source_costs,
            (np.zeros(source_nodes.size, dtype=np.int32), source_nodes),
        ),
        shape=(1, node_count),
        dtype=np.float32,
    )
    # Distances are needed from a resident to a park. Therefore run from the
    # virtual park source over the transposed directed pedestrian graph.
    reversed_graph = graph.matrix.transpose().tocsr()
    extended = vstack(
        [
            hstack(
                [reversed_graph, csr_matrix((node_count, 1), dtype=np.float32)],
                format="csr",
            ),
            hstack(
                [source_row, csr_matrix((1, 1), dtype=np.float32)],
                format="csr",
            ),
        ],
        format="csr",
    )
    distances = dijkstra(
        extended,
        directed=True,
        indices=node_count,
        limit=THRESHOLD_METERS,
        min_only=True,
    )
    return np.asarray(distances[:node_count], dtype=np.float64)


def population_cells(
    raster_paths: Iterable[Path],
    population_boundary: Any,
    population_to_city: Transformer,
) -> tuple[np.ndarray, np.ndarray]:
    coordinate_parts: list[np.ndarray] = []
    value_parts: list[np.ndarray] = []
    for raster_path in raster_paths:
        with rasterio.open(raster_path) as dataset:
            try:
                clipped, transform = raster_mask(
                    dataset,
                    [mapping(population_boundary)],
                    crop=True,
                    filled=False,
                    all_touched=False,
                    indexes=1,
                )
            except ValueError as error:
                if "do not overlap" in str(error).lower():
                    continue
                raise
        clipped = np.ma.asarray(clipped)
        valid = (~np.ma.getmaskarray(clipped)) & (np.asarray(clipped) > 0)
        rows, columns = np.nonzero(valid)
        if rows.size == 0:
            continue
        # Preserve the fractional dasymetric population assigned to each cell.
        values = np.asarray(clipped)[rows, columns].astype(np.float64)
        x, y = rasterio.transform.xy(transform, rows, columns, offset="center")
        city_x, city_y = population_to_city.transform(
            np.asarray(x, dtype=np.float64),
            np.asarray(y, dtype=np.float64),
        )
        coordinate_parts.append(
            np.column_stack(
                (
                    np.asarray(city_x, dtype=np.float64),
                    np.asarray(city_y, dtype=np.float64),
                )
            )
        )
        value_parts.append(values)
    if not coordinate_parts:
        raise RuntimeError("No positive population cells intersect the city boundary")
    return np.vstack(coordinate_parts), np.concatenate(value_parts)


def aggregate_population_access(
    *,
    cell_coordinates: np.ndarray,
    cell_population: np.ndarray,
    node_tree: cKDTree,
    node_distances: np.ndarray,
) -> tuple[int, int, dict[str, int]]:
    snap_distances, snap_indices = node_tree.query(
        cell_coordinates,
        k=3,
        distance_upper_bound=MAX_POPULATION_SNAP_METERS,
        workers=-1,
    )
    if snap_distances.ndim == 1:
        snap_distances = snap_distances[:, None]
        snap_indices = snap_indices[:, None]
    valid_snap = snap_indices < node_distances.size
    candidate_distances = np.full(snap_distances.shape, np.inf)
    valid_indices = snap_indices[valid_snap]
    candidate_distances[valid_snap] = (
        node_distances[valid_indices] + snap_distances[valid_snap]
    )
    nearest_park_distance = np.min(candidate_distances, axis=1)
    covered = nearest_park_distance <= THRESHOLD_METERS
    snapped = np.any(valid_snap, axis=1)
    population_total = int(round(float(np.sum(cell_population, dtype=np.float64))))
    population_within = int(
        round(float(np.sum(cell_population[covered], dtype=np.float64)))
    )
    guardrails = {
        "populationGridCellCount": int(cell_population.size),
        "populationGridCellsSnappedToNetwork": int(np.count_nonzero(snapped)),
        "populationGridCellsBeyondSnapLimit": int(
            cell_population.size - np.count_nonzero(snapped)
        ),
        "populationBeyondSnapLimit": int(
            round(
                float(
                    np.sum(cell_population[~snapped], dtype=np.float64)
                )
            )
        ),
    }
    return population_within, population_total, guardrails


def source_record(
    *,
    source_id: str,
    title: str,
    role: str,
    url: str,
    metadata_url: str | None,
    license_name: str,
    record: DownloadRecord | None = None,
    sha256: str | None = None,
    generated_at: str | None = None,
    city: str | None = None,
) -> dict[str, Any]:
    value: dict[str, Any] = {
        "id": source_id,
        "title": title,
        "role": role,
        "url": url,
        "license": license_name,
    }
    if metadata_url:
        value["metadataUrl"] = metadata_url
    if city:
        value["city"] = city
    if record:
        value.update(
            {
                "sha256": sha256 or record.sha256,
                "lastModified": record.last_modified,
            }
        )
    elif sha256:
        value.update({"sha256": sha256, "generatedAt": generated_at})
    return value


def validate_city_result(city: CityConfig, result: dict[str, Any]) -> None:
    total = result["populationTotal"]
    within = result["populationWithinThreshold"]
    share = result["sharePercent"]
    low, high = city.plausible_population_range
    if not low <= total <= high:
        raise RuntimeError(
            f"{city.name}: population {total:,} outside plausibility range "
            f"{low:,}–{high:,}"
        )
    if not 0 <= within <= total:
        raise RuntimeError(
            f"{city.name}: invalid covered population {within:,}/{total:,}"
        )
    expected_share = round((within / total) * 100, 1)
    if share != expected_share:
        raise RuntimeError(
            f"{city.name}: share {share} does not match {expected_share}"
        )
    green_space = result["greenSpace"]
    green_area = green_space["areaM2"]
    city_area = green_space["cityAreaM2"]
    if not 0 < green_area <= city_area:
        raise RuntimeError(
            f"{city.name}: invalid green area {green_area:,}/{city_area:,}"
        )
    expected_green_share = round((green_area / city_area) * 100, 1)
    if green_space["sharePercent"] != expected_green_share:
        raise RuntimeError(
            f"{city.name}: green share {green_space['sharePercent']} "
            f"does not match {expected_green_share}"
        )
    expected_per_resident = round(green_area / total, 1)
    if green_space["m2PerResident"] != expected_per_resident:
        raise RuntimeError(
            f"{city.name}: green area per resident "
            f"{green_space['m2PerResident']} does not match "
            f"{expected_per_resident}"
        )
    tree_cover = result["treeCover"]
    if not 0 <= tree_cover["sharePercent"] <= 100:
        raise RuntimeError(
            f"{city.name}: invalid tree-cover share "
            f"{tree_cover['sharePercent']}"
        )
    if not 0 <= tree_cover["areaM2"] <= tree_cover["landAreaM2"]:
        raise RuntimeError(
            f"{city.name}: invalid tree-cover area "
            f"{tree_cover['areaM2']:,}/{tree_cover['landAreaM2']:,}"
        )
    expected_tree_share = round(
        (tree_cover["areaM2"] / tree_cover["landAreaM2"]) * 100, 1
    )
    if tree_cover["sharePercent"] != expected_tree_share:
        raise RuntimeError(
            f"{city.name}: tree-cover share {tree_cover['sharePercent']} "
            f"does not match {expected_tree_share}"
        )
    guardrails = result["guardrails"]
    if guardrails["eligibleParkCount"] < 20:
        raise RuntimeError(
            f"{city.name}: implausibly few eligible parks "
            f"({guardrails['eligibleParkCount']})"
        )
    if guardrails["networkNodeCount"] < 10_000:
        raise RuntimeError(
            f"{city.name}: implausibly small walking graph "
            f"({guardrails['networkNodeCount']} nodes)"
        )
    if guardrails["populationBoundaryUncoveredM2"] != 0:
        raise RuntimeError(
            f"{city.name}: population tiles do not cover the full boundary"
        )
    if guardrails["populationBeyondSnapLimit"] / total > 0.05:
        raise RuntimeError(
            f"{city.name}: more than 5% of residents cannot be snapped "
            "to the pedestrian network"
        )
    if (
        guardrails["parksWithoutNetworkAccess"]
        / guardrails["eligibleParkCount"]
        > 0.1
    ):
        raise RuntimeError(
            f"{city.name}: more than 10% of eligible parks have no "
            "pedestrian-network access"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--project-root", type=Path, default=Path(__file__).resolve().parents[2]
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path(__file__).resolve().parent / ".cache",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Defaults to public/data/access.json under the project root.",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Conditionally refresh cached remote sources before computing.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    project_root = args.project_root.resolve()
    cache_directory = args.cache_dir.resolve()
    output_path = (
        args.output.resolve()
        if args.output
        else project_root / "public/data/access.json"
    )
    input_cache = cache_directory / "inputs"
    graph_cache = cache_directory / "graphs"
    inventory_cache = cache_directory / "inventories"
    tree_cover_cache = cache_directory / "tree-cover"
    started = time.monotonic()

    generated_at = utc_now()
    sources: list[dict[str, Any]] = []
    population_rasters: dict[str, Path] = {}
    required_tiles = sorted(
        {tile for city in CITY_CONFIGS for tile in city.population_tiles}
    )
    print(
        f"Preparing {len(required_tiles)} GHSL 2020 population tiles…",
        flush=True,
    )
    for tile_id in required_tiles:
        url = population_tile_url(tile_id)
        archive, changed = download_cached(
            url,
            input_cache / f"ghsl-population-2020-100m-{tile_id}.zip",
            refresh=args.refresh,
            timeout_seconds=600,
        )
        raster = extract_population_raster(
            archive,
            input_cache / f"ghsl-population-2020-100m-{tile_id}.tif",
            archive_changed=changed,
            expected_crs=POPULATION_CRS,
        )
        population_rasters[tile_id] = raster
        sources.append(
            source_record(
                source_id=f"ghsl-population-2020-100m-{tile_id.lower()}",
                title=f"GHSL GHS-POP 2020 (100 m) — tile {tile_id}",
                role="population",
                url=url,
                metadata_url=JRC_DATASET_URL,
                license_name="European Commission reuse notice",
                record=archive,
            )
        )
    sources.extend(
        [
            {
                "id": "cgls-lc100-2019-tree-cover-fraction",
                "title": (
                    "Copernicus Global Land Service LC100 2019 — "
                    "Tree Cover Fraction"
                ),
                "role": "tree-cover",
                "url": CGLS_TREE_URL,
                "metadataUrl": CGLS_RECORD_URL,
                "license": "Creative Commons Attribution 4.0",
                "md5": CGLS_TREE_MD5,
            },
            {
                "id": "cgls-lc100-2019-permanent-water-fraction",
                "title": (
                    "Copernicus Global Land Service LC100 2019 — "
                    "Permanent Water Cover Fraction"
                ),
                "role": "land-mask",
                "url": CGLS_WATER_URL,
                "metadataUrl": CGLS_RECORD_URL,
                "license": "Creative Commons Attribution 4.0",
                "md5": CGLS_WATER_MD5,
            },
        ]
    )
    city_results: dict[str, Any] = {}

    for city in CITY_CONFIGS:
        city_started = time.monotonic()
        print(f"{city.name}:", flush=True)
        pbf_path = input_cache / f"{city.id}.osm.pbf"
        prime_shared_pbf_cache(project_root, city, pbf_path)
        pbf_record, _ = download_cached(
            city.osm_url,
            pbf_path,
            refresh=args.refresh,
            timeout_seconds=600,
        )
        transformer = Transformer.from_crs(
            "EPSG:4326", city.projected_crs, always_xy=True
        )
        boundary_record: DownloadRecord | None = None
        if city.boundary_url:
            boundary_record, _ = download_cached(
                city.boundary_url,
                input_cache / f"{city.id}-boundary.geojson",
                refresh=args.refresh,
            )
            geographic_boundary, projected_boundary = load_boundary(
                boundary_record.path, transformer
            )
        elif city.boundary_relation:
            geographic_boundary = load_or_extract_osm_boundary(
                pbf_record,
                city.boundary_relation,
                input_cache / f"{city.id}-boundary.geojson",
            )
            projected_boundary = make_valid(
                transform_geometry(transformer.transform, geographic_boundary)
            )
        else:
            raise RuntimeError(f"{city.name}: no city boundary configured")
        boundary_geometry_sha256 = geometry_sha256(geographic_boundary)
        parks = load_or_build_comparison_inventory(
            city=city,
            pbf=pbf_record,
            geographic_boundary=geographic_boundary,
            projected_boundary=projected_boundary,
            boundary_sha256=boundary_geometry_sha256,
            transformer=transformer,
            cache_directory=inventory_cache,
        )
        print(
            f"  {parks.eligible_count:,} dissolved green spaces meet "
            "the harmonized 0.5 ha access rule",
            flush=True,
        )
        tree_cover = load_or_calculate_tree_cover(
            city=city,
            geographic_boundary=geographic_boundary,
            boundary_sha256=boundary_geometry_sha256,
            cache_directory=tree_cover_cache,
        )
        graph, _graph_was_cached = build_or_load_walk_graph(
            city=city,
            pbf=pbf_record,
            geographic_boundary=geographic_boundary,
            transformer=transformer,
            graph_cache_directory=graph_cache,
        )
        node_tree = cKDTree(np.column_stack((graph.x, graph.y)))
        source_weights, park_guardrails = build_access_sources(
            graph, parks, node_tree
        )
        print(
            f"  routing from {len(source_weights):,} park-network access nodes",
            flush=True,
        )
        node_distances = route_to_nearest_park(graph, source_weights)
        geographic_to_population = Transformer.from_crs(
            "EPSG:4326", POPULATION_CRS, always_xy=True
        )
        population_to_city = Transformer.from_crs(
            POPULATION_CRS, city.projected_crs, always_xy=True
        )
        population_boundary = make_valid(
            transform_geometry(
                geographic_to_population.transform, geographic_boundary
            )
        )
        tile_geometries = []
        for tile in city.population_tiles:
            with rasterio.open(population_rasters[tile]) as dataset:
                tile_geometries.append(box(*dataset.bounds))
        uncovered_population_boundary = population_boundary.difference(
            union_all(tile_geometries)
        )
        if (
            not uncovered_population_boundary.is_empty
            and uncovered_population_boundary.area > 1
        ):
            raise RuntimeError(
                f"{city.name}: configured GHSL tiles leave "
                f"{uncovered_population_boundary.area:,.0f} m² of the "
                "administrative boundary uncovered"
            )
        cell_coordinates, cell_population = population_cells(
            (population_rasters[tile] for tile in city.population_tiles),
            population_boundary,
            population_to_city,
        )
        (
            population_within,
            population_total,
            population_guardrails,
        ) = aggregate_population_access(
            cell_coordinates=cell_coordinates,
            cell_population=cell_population,
            node_tree=node_tree,
            node_distances=node_distances,
        )
        share_percent = round(
            (population_within / population_total) * 100, 1
        )
        green_area_m2 = int(round(parks.all_union.area))
        city_area_m2 = int(round(projected_boundary.area))
        green_space = {
            "areaM2": green_area_m2,
            "cityAreaM2": city_area_m2,
            "sharePercent": round(
                (green_area_m2 / city_area_m2) * 100, 1
            ),
            "m2PerResident": round(
                green_area_m2 / population_total, 1
            ),
            "definitionVersion": GREEN_INVENTORY_VERSION,
        }
        guardrails = {
            "populationGridResolutionMeters": 100,
            "populationModel": (
                "GHSL GHS-POP R2023A epoch 2020 population counts "
                "dasymetrically allocated to 100 m cells"
            ),
            "populationTileIds": list(city.population_tiles),
            "populationBoundaryUncoveredM2": int(
                round(uncovered_population_boundary.area)
            ),
            "metricProjection": city.projected_crs,
            "minimumEligibleParkAreaHa": 0.5,
            "maximumPopulationNetworkSnapMeters": int(
                MAX_POPULATION_SNAP_METERS
            ),
            "greenInputFeatureCount": parks.input_count,
            "greenAccessInputFeatureCount": parks.access_input_count,
            "greenDissolvedComponentCount": (
                parks.eligible_count + parks.below_minimum_area_count
            ),
            "greenComponentsBelowMinimumArea": (
                parks.below_minimum_area_count
            ),
            "greenFeaturesWithInvalidOrEmptyGeometry": (
                parks.invalid_or_empty_count
            ),
            "greenFeaturesExcludedByAccessRule": (
                parks.excluded_access_count
            ),
            "greenFeaturesWithoutPublicAccessEvidence": (
                parks.without_public_access_evidence_count
            ),
            "greenInputClassCounts": parks.class_counts,
            "greenAccessInputClassCounts": parks.access_class_counts,
            "routedEligibleGreenAreaM2": int(round(parks.union.area)),
            "networkNodeCount": int(graph.x.size),
            "networkDirectedEdgeCount": int(graph.matrix.nnz),
            **park_guardrails,
            **population_guardrails,
        }
        result = {
            "sharePercent": share_percent,
            "populationWithinThreshold": population_within,
            "populationTotal": population_total,
            "populationYear": POPULATION_YEAR,
            "thresholdMinutes": THRESHOLD_MINUTES,
            "thresholdMeters": int(THRESHOLD_METERS),
            "method": "walking-network",
            "generatedAt": generated_at,
            "greenSpace": green_space,
            "treeCover": tree_cover,
            "note": (
                "Modellschätzung auf Basis des GHSL-Bevölkerungsrasters 2020 "
                "und harmonisierter OpenStreetMap-Grünflächen; keine "
                "individuelle "
                "Erreichbarkeitsgarantie."
            ),
            "guardrails": guardrails,
        }
        validate_city_result(city, result)
        city_results[city.id] = result
        sources.extend(
            [
                {
                    **source_record(
                        source_id=f"{city.id}-comparison-green",
                        title=(
                            "Harmonized OpenStreetMap green-space "
                            f"inventory — {city.name}"
                        ),
                        role="comparison-green-space",
                        url=city.osm_url,
                        metadata_url=(
                            "https://www.openstreetmap.org/copyright"
                        ),
                        license_name=(
                            "Open Data Commons Open Database License 1.0"
                        ),
                        record=pbf_record,
                        city=city.id,
                    ),
                    "definitionVersion": GREEN_INVENTORY_VERSION,
                    "includedClasses": [
                        f"{key}={value}" for key, value in GREEN_CLASSES
                    ]
                    + ["leisure=garden (explicit public access, no fee)"],
                    "routingExcludedRules": [
                        "access=no/private/customers/members/permit/"
                        "agricultural/forestry",
                        "fee=yes",
                    ],
                    "routingRule": (
                        "parks, nature reserves and explicit-public gardens; "
                        "woods and forests only with explicit public access"
                    ),
                },
                source_record(
                    source_id=f"{city.id}-boundary",
                    title=city.boundary_title,
                    role="city-boundary",
                    url=city.boundary_url or city.boundary_metadata_url,
                    metadata_url=city.boundary_metadata_url,
                    license_name=city.boundary_license,
                    record=boundary_record,
                    sha256=boundary_geometry_sha256,
                    generated_at=(
                        None
                        if boundary_record
                        else pbf_record.retrieved_at
                    ),
                    city=city.id,
                ),
                source_record(
                    source_id=f"{city.id}-pedestrian-network",
                    title=city.osm_title,
                    role="pedestrian-network",
                    url=city.osm_url,
                    metadata_url="https://www.openstreetmap.org/copyright",
                    license_name="Open Data Commons Open Database License 1.0",
                    record=pbf_record,
                    city=city.id,
                ),
            ]
        )
        print(
            f"  {share_percent:.1f}% ({population_within:,}/"
            f"{population_total:,}); {green_space['sharePercent']:.1f}% green; "
            f"{tree_cover['sharePercent']:.1f}% tree cover in "
            f"{time.monotonic() - city_started:.1f}s",
            flush=True,
        )
        del graph, node_tree, node_distances, cell_coordinates, cell_population
        gc.collect()

    output = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": generated_at,
        "methodology": {
            "metric": (
                "Share of resident population whose 100 m population-cell "
                "centre can reach an eligible harmonized green-space access "
                "point "
                "within 805 m on the pedestrian network."
            ),
            "numerator": (
                "GHSL GHS-POP 2020 resident population in cells with snapped "
                "pedestrian-network distance to an eligible green space of "
                "at most "
                "805 m."
            ),
            "denominator": (
                "All positive GHSL GHS-POP 2020 population cells whose centres "
                "fall inside the configured administrative boundary."
            ),
            "parkEligibility": (
                "The same OpenStreetMap classes in every city: leisure=park, "
                "leisure=nature_reserve, natural=wood and landuse=forest, "
                "plus leisure=garden only with explicit public access and no "
                "fee. For access routing, fee=yes, private or inaccessible "
                "geometry is excluded and takes precedence over overlapping "
                "unrestricted geometry. Parks, nature reserves and public "
                "gardens qualify by class; woods and forests require explicit "
                "public-access tags. Geometries are clipped and dissolved, and "
                "routed components must measure at least 0.5 ha."
            ),
            "greenArea": (
                "Harmonized green-space area is the dissolved area of the "
                "same OpenStreetMap definition inside the administrative "
                "boundary. Share uses total administrative area; square "
                "metres per resident uses the GHSL 2020 population. Mapped "
                "wood or forest contributes even when public access is not "
                "established, so this is a land-cover indicator rather than "
                "an accessible-park total."
            ),
            "treeCover": (
                "Tree-cover share is the area-weighted CGLS-LC100 2019 Tree "
                "Cover Fraction divided by land area from the matching "
                "Permanent Water Cover Fraction. Both rasters are 100 m; "
                "boundary pixels are selected by pixel centre."
            ),
            "entranceModel": (
                "Mapped pedestrian nodes inside green spaces and network edges "
                "crossing their boundaries are primary access. Mapped OSM "
                "entrances within 30 m are also accepted. A green space without "
                "those signals receives a generated nearest-perimeter access only "
                "when a pedestrian node is within 61 m; otherwise it is "
                "excluded from routed access."
            ),
            "walkingStandard": (
                "805 m (one half-mile) pedestrian-network distance is used as "
                "the conventional 10-minute-walk proxy; it is not a "
                "personalized travel-time prediction."
            ),
            "populationSnap": (
                "Each populated cell centre is connected to the best of its "
                "three nearest pedestrian nodes within 200 m, including the "
                "straight connector distance."
            ),
            "uncertainty": (
                "Population is the harmonized GHSL 2020 dasymetric model; OSM "
                "mapping and access/barrier tags can be incomplete. CGLS tree "
                "cover is a modelled 2019 estimate at 100 m resolution, not a "
                "street-tree census, and has documented global mean absolute "
                "error of 8.9 percentage points. "
                "Results are comparative planning estimates, not accessibility "
                "guarantees."
            ),
        },
        "sources": sources,
        "cities": city_results,
    }
    previous_output: dict[str, Any] | None = None
    if output_path.exists():
        try:
            previous_output = json.loads(output_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            previous_output = None

    def count_total(value: Any) -> int | None:
        if not isinstance(value, dict):
            return None
        counts = list(value.values())
        if not counts or not all(
            isinstance(count, int) and count >= 0 for count in counts
        ):
            return None
        return sum(counts)

    if previous_output is not None:
        for city_id, result in city_results.items():
            previous_result = previous_output.get("cities", {}).get(city_id)
            if not isinstance(previous_result, dict):
                continue
            previous_green = previous_result.get("greenSpace")
            if (
                not isinstance(previous_green, dict)
                or previous_green.get("definitionVersion")
                != GREEN_INVENTORY_VERSION
            ):
                continue
            previous_guardrails = previous_result.get("guardrails", {})
            comparisons = (
                (
                    "green area",
                    previous_green.get("areaM2"),
                    result["greenSpace"]["areaM2"],
                ),
                (
                    "eligible access components",
                    previous_guardrails.get("eligibleParkCount"),
                    result["guardrails"]["eligibleParkCount"],
                ),
                (
                    "eligible routed green area",
                    previous_guardrails.get(
                        "routedEligibleGreenAreaM2"
                    ),
                    result["guardrails"]["routedEligibleGreenAreaM2"],
                ),
                (
                    "population with access",
                    previous_result.get("populationWithinThreshold"),
                    result["populationWithinThreshold"],
                ),
                (
                    "included green features",
                    count_total(
                        previous_guardrails.get("greenInputClassCounts")
                    ),
                    count_total(
                        result["guardrails"]["greenInputClassCounts"]
                    ),
                ),
            )
            for label, previous_value, current_value in comparisons:
                if (
                    isinstance(previous_value, (int, float))
                    and isinstance(current_value, (int, float))
                    and previous_value > 0
                    and current_value < previous_value * 0.7
                ):
                    raise RuntimeError(
                        f"{city_id}: {label} dropped by more than 30% "
                        f"({previous_value:,} to {current_value:,})"
                    )

    def without_run_timestamps(value: dict[str, Any]) -> dict[str, Any]:
        comparable = json.loads(json.dumps(value))
        comparable.pop("generatedAt", None)
        for city_value in comparable.get("cities", {}).values():
            city_value.pop("generatedAt", None)
        return comparable

    if (
        previous_output is not None
        and without_run_timestamps(previous_output)
        == without_run_timestamps(output)
    ):
        print(
            f"No access-data changes; left {output_path} untouched "
            f"({time.monotonic() - started:.1f}s)",
            flush=True,
        )
        return 0

    atomic_write_json(output_path, output)
    print(f"Wrote {output_path} in {time.monotonic() - started:.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        raise SystemExit(130)
