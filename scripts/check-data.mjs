import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import jsts from "jsts";
import {
  DATA_SCHEMA_VERSION,
  JOIN_THRESHOLD_METERS,
  LICENSE,
  SOURCE_CONFIG,
} from "./data-sources.mjs";
import { geometryBounds } from "./geo.mjs";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIRECTORY = join(PROJECT_ROOT, "public", "data");
const PATHS = {
  parks: join(DATA_DIRECTORY, "parks.geojson"),
  index: join(DATA_DIRECTORY, "parks-index.json"),
  summary: join(DATA_DIRECTORY, "summary.json"),
  sources: join(DATA_DIRECTORY, "sources.json"),
};
const AMENITY_KINDS = [
  "playground",
  "toilet",
  "drinkingFountain",
  "dogRun",
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function round(value, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function readJson(path) {
  const text = await readFile(path, "utf8");
  invariant(text.length > 0, `${path} is empty`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error}`);
  }
}

function checkSchemaVersion(document, name) {
  invariant(
    document.schemaVersion === DATA_SCHEMA_VERSION,
    `${name}: expected schemaVersion ${DATA_SCHEMA_VERSION}`,
  );
}

function checkDate(value, label) {
  invariant(
    typeof value === "string" && Number.isFinite(Date.parse(value)),
    `${label}: invalid timestamp`,
  );
}

function checkRing(ring, parkId) {
  invariant(Array.isArray(ring) && ring.length >= 4, `${parkId}: short ring`);
  const first = ring[0];
  const last = ring[ring.length - 1];
  invariant(
    first[0] === last[0] && first[1] === last[1],
    `${parkId}: unclosed ring`,
  );
  for (const position of ring) {
    invariant(
      Array.isArray(position) &&
        position.length >= 2 &&
        Number.isFinite(position[0]) &&
        Number.isFinite(position[1]),
      `${parkId}: invalid coordinate`,
    );
    invariant(
      position[0] >= 12 &&
        position[0] <= 15 &&
        position[1] >= 51 &&
        position[1] <= 54,
      `${parkId}: coordinate outside Berlin region`,
    );
  }
}

function checkGeometry(geometry, parkId) {
  invariant(
    geometry?.type === "Polygon" || geometry?.type === "MultiPolygon",
    `${parkId}: unsupported park geometry`,
  );
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  invariant(polygons.length > 0, `${parkId}: geometry has no polygons`);
  for (const polygon of polygons) {
    invariant(polygon.length > 0, `${parkId}: polygon has no rings`);
    polygon.forEach((ring) => checkRing(ring, parkId));
  }
  const validity = new jsts.operation.valid.IsValidOp(
    new jsts.io.GeoJSONReader().read(geometry),
  );
  invariant(
    validity.isValid(),
    `${parkId}: invalid polygon topology (${validity.getValidationError()})`,
  );
}

function checkObservation(observation, kind, parkId) {
  invariant(
    observation &&
      (observation.status === "observed-nearby" ||
        observation.status === "not-observed"),
    `${parkId}: invalid ${kind} status`,
  );
  invariant(
    Number.isInteger(observation.count) && observation.count >= 0,
    `${parkId}: invalid ${kind} count`,
  );
  invariant(
    observation.coverage === "official-observations" ||
      observation.coverage === "partial-official-observations",
    `${parkId}: invalid ${kind} coverage`,
  );

  if (observation.status === "observed-nearby") {
    invariant(observation.count > 0, `${parkId}: observed ${kind} has no count`);
    invariant(
      Number.isInteger(observation.nearestMeters) &&
        observation.nearestMeters >= 0 &&
        observation.nearestMeters <= JOIN_THRESHOLD_METERS,
      `${parkId}: invalid nearest ${kind} distance`,
    );
  } else {
    invariant(
      observation.count === 0 && observation.nearestMeters === null,
      `${parkId}: not-observed ${kind} must have count 0 and null distance`,
    );
  }
}

function checkParkFeature(feature, ids) {
  invariant(feature?.type === "Feature", "parks: non-Feature item");
  invariant(
    typeof feature.id === "string" &&
      /^\d{8}:[0-9a-f]{8}$/i.test(feature.id),
    `parks: invalid PITID ${feature.id}`,
  );
  invariant(!ids.has(feature.id), `parks: duplicate PITID ${feature.id}`);
  ids.add(feature.id);
  checkGeometry(feature.geometry, feature.id);

  const properties = feature.properties;
  invariant(properties?.id === feature.id, `${feature.id}: property id mismatch`);
  invariant(
    typeof properties.name === "string" && properties.name.trim().length > 0,
    `${feature.id}: empty name`,
  );
  invariant(
    typeof properties.district === "string" &&
      properties.district.trim().length > 0,
    `${feature.id}: empty district`,
  );
  invariant(
    Number.isFinite(properties.areaM2) && properties.areaM2 >= 0,
    `${feature.id}: invalid area`,
  );
  invariant(
    Array.isArray(properties.centroid) &&
      properties.centroid.length === 2 &&
      properties.centroid.every(Number.isFinite),
    `${feature.id}: invalid centroid`,
  );
  invariant(
    Array.isArray(properties.bounds) &&
      properties.bounds.length === 4 &&
      properties.bounds.every(Number.isFinite),
    `${feature.id}: invalid bounds`,
  );
  invariant(
    sameJson(properties.bounds, geometryBounds(feature.geometry)),
    `${feature.id}: stored bounds do not match geometry`,
  );
  const [longitude, latitude] = properties.centroid;
  const [west, south, east, north] = properties.bounds;
  invariant(
    longitude >= west &&
      longitude <= east &&
      latitude >= south &&
      latitude <= north,
    `${feature.id}: centroid outside geometry bounds`,
  );
  invariant(
    properties.sourceId === "parks",
    `${feature.id}: unexpected sourceId`,
  );
  invariant(
    !Object.keys(properties).some((key) => /^has[A-Z_]/.test(key)),
    `${feature.id}: authoritative has* boolean is forbidden`,
  );

  for (const kind of AMENITY_KINDS) {
    checkObservation(properties.amenities?.[kind], kind, feature.id);
  }
  invariant(
    properties.amenities.dogRun.coverage ===
      "partial-official-observations",
    `${feature.id}: dog-run coverage must remain explicitly partial`,
  );
}

function checkIndexEntry(entry, feature) {
  const expected = {
    id: feature.id,
    name: feature.properties.name,
    nameAddon: feature.properties.nameAddon,
    district: feature.properties.district,
    locality: feature.properties.locality,
    type: feature.properties.type,
    areaM2: feature.properties.areaM2,
    areaHa: feature.properties.areaHa,
    centroid: feature.properties.centroid,
    bounds: feature.properties.bounds,
    amenities: feature.properties.amenities,
  };
  invariant(
    sameJson(entry, expected),
    `${feature.id}: index entry diverges from GeoJSON`,
  );
}

function checkSources(sources) {
  invariant(
    sources.publisher === "Land Berlin",
    "sources: unexpected publisher",
  );
  invariant(
    sources.license?.id === LICENSE.id &&
      sources.license?.url === LICENSE.url,
    "sources: unexpected license",
  );
  invariant(
    /^[0-9a-f]{64}$/.test(sources.upstreamFingerprint),
    "sources: invalid upstream fingerprint",
  );
  invariant(
    sources.methodology?.canonicalParkId === "pitid",
    "sources: PITID methodology missing",
  );
  invariant(
    sources.methodology?.amenityJoinThresholdMeters === JOIN_THRESHOLD_METERS,
    "sources: join threshold mismatch",
  );
  invariant(
    typeof sources.methodology?.absenceSemantics === "string" &&
      sources.methodology.absenceSemantics.includes("not-observed") &&
      sources.methodology.absenceSemantics.includes("authoritative"),
    "sources: absence semantics missing",
  );

  for (const config of SOURCE_CONFIG) {
    const source = sources.sources.find((candidate) => candidate.id === config.id);
    invariant(source, `sources: missing ${config.id}`);
    invariant(
      source.featureCount >= config.minimumCount,
      `sources: ${config.id} below minimum count`,
    );
    invariant(
      Number.isInteger(source.normalizedEntityCount) &&
        source.normalizedEntityCount > 0 &&
        source.normalizedEntityCount <= source.featureCount,
      `sources: ${config.id} invalid normalized count`,
    );
    invariant(
      source.coverage === config.coverage,
      `sources: ${config.id} coverage mismatch`,
    );
    invariant(
      source.license?.id === LICENSE.id,
      `sources: ${config.id} license mismatch`,
    );
    invariant(
      /^[0-9a-f]{64}$/.test(source.contentFingerprint),
      `sources: ${config.id} invalid fingerprint`,
    );
    checkDate(source.retrievedAt, `sources: ${config.id} retrievedAt`);
    const requestUrl = new URL(source.requestUrl);
    invariant(
      requestUrl.protocol === "https:" &&
        requestUrl.hostname === "gdi.berlin.de" &&
        requestUrl.searchParams.get("request") === "GetFeature" &&
        requestUrl.searchParams.get("typeNames") === config.layer &&
        requestUrl.searchParams.get("srsName") === "EPSG:4326",
      `sources: ${config.id} invalid WFS request URL`,
    );
  }
  invariant(
    sources.sources.length === SOURCE_CONFIG.length,
    "sources: unexpected extra sources",
  );
}

async function main() {
  const [parks, index, summary, sources] = await Promise.all(
    Object.values(PATHS).map(readJson),
  );
  for (const [name, document] of Object.entries({
    parks,
    index,
    summary,
    sources,
  })) {
    checkSchemaVersion(document, name);
    checkDate(document.generatedAt, `${name}: generatedAt`);
  }
  invariant(
    new Set([
      parks.generatedAt,
      index.generatedAt,
      summary.generatedAt,
      sources.generatedAt,
    ]).size === 1,
    "generatedAt must match across all snapshots",
  );
  invariant(
    parks?.type === "FeatureCollection" && Array.isArray(parks.features),
    "parks: invalid FeatureCollection",
  );
  invariant(Array.isArray(index.parks), "index: parks must be an array");
  invariant(
    parks.features.length === index.parks.length &&
      parks.features.length === summary.parkCount,
    "park counts disagree across snapshots",
  );

  const ids = new Set();
  parks.features.forEach((feature) => checkParkFeature(feature, ids));
  parks.features.forEach((feature, position) =>
    checkIndexEntry(index.parks[position], feature),
  );

  const areaM2 = round(
    parks.features.reduce(
      (total, feature) => total + feature.properties.areaM2,
      0,
    ),
    1,
  );
  invariant(summary.totalAreaM2 === areaM2, "summary: total area mismatch");
  invariant(
    summary.totalAreaHa === round(areaM2 / 10_000, 1),
    "summary: hectare total mismatch",
  );
  const districts = new Set(
    parks.features.map((feature) => feature.properties.district),
  );
  invariant(
    summary.districtCount === districts.size &&
      summary.districts.length === districts.size,
    "summary: district count mismatch",
  );
  invariant(
    summary.sourceParkFeatureCount ===
      sources.sources.find((source) => source.id === "parks").featureCount,
    "summary: source park count mismatch",
  );
  for (const kind of AMENITY_KINDS) {
    const observedCount = parks.features.filter(
      (feature) =>
        feature.properties.amenities[kind].status === "observed-nearby",
    ).length;
    invariant(
      summary.amenities[kind].parksWithObservation === observedCount,
      `summary: ${kind} observed park count mismatch`,
    );
  }
  invariant(
    summary.amenities.dogRun.coverage ===
      "partial-official-observations",
    "summary: dog-run coverage must be partial",
  );
  checkSources(sources);

  const fileSizes = Object.fromEntries(
    await Promise.all(
      Object.entries(PATHS).map(async ([name, path]) => [
        name,
        (await stat(path)).size,
      ]),
    ),
  );
  invariant(fileSizes.parks < 12_000_000, "parks.geojson is unexpectedly large");
  invariant(
    fileSizes.index < 6_000_000,
    "parks-index.json is unexpectedly large",
  );

  console.log(
    `Data check passed: ${summary.parkCount} parks, ${summary.totalAreaHa.toLocaleString("de-DE")} ha, ${summary.districtCount} districts, ${(fileSizes.parks / 1_000_000).toFixed(2)} MB GeoJSON.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
