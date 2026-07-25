import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  COORDINATE_PRECISION,
  DATA_SCHEMA_VERSION,
  JOIN_THRESHOLD_METERS,
  LICENSE,
  SIMPLIFY_TOLERANCE_METERS,
  SOURCE_CONFIG,
  buildWfsUrl,
} from "./data-sources.mjs";
import {
  boundsCouldBeWithin,
  combinePolygonGeometries,
  geometryBounds,
  geometryCentroid,
  geometryDistanceMeters,
  normalizeGeometry,
} from "./geo.mjs";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIRECTORY = join(PROJECT_ROOT, "public", "data");
const OUTPUT_FILES = {
  parks: join(OUTPUT_DIRECTORY, "parks.geojson"),
  index: join(OUTPUT_DIRECTORY, "parks-index.json"),
  summary: join(OUTPUT_DIRECTORY, "summary.json"),
  sources: join(OUTPUT_DIRECTORY, "sources.json"),
};
const VOLATILE_KEYS = new Set([
  "generatedAt",
  "retrievedAt",
  "responseTimestamp",
]);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function stripVolatile(value) {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !VOLATILE_KEYS.has(key))
        .map(([key, nested]) => [key, stripVolatile(nested)]),
    );
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceFeatureId(source, feature) {
  const value = feature?.properties?.[source.idProperty];
  if (value === undefined || value === null || value === "") {
    throw new Error(
      `${source.id}: feature is missing canonical field ${source.idProperty}`,
    );
  }
  return String(value).trim();
}

function sourceFingerprint(source, features) {
  const canonicalFeatures = features
    .map((feature) => ({
      stableId: sourceFeatureId(source, feature),
      value: canonicalJson({
        id: feature.id ?? null,
        geometry: feature.geometry,
        properties: feature.properties,
      }),
    }))
    .sort(
      (left, right) =>
        left.stableId.localeCompare(right.stableId) ||
        left.value.localeCompare(right.value),
    );
  const hash = createHash("sha256");
  for (const feature of canonicalFeatures) {
    hash.update(feature.stableId);
    hash.update("\0");
    hash.update(feature.value);
    hash.update("\n");
  }
  return hash.digest("hex");
}

function validateCoordinates(value, sourceId) {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    const [longitude, latitude] = value;
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < 12 ||
      longitude > 15 ||
      latitude < 51 ||
      latitude > 54
    ) {
      throw new Error(
        `${sourceId}: coordinate is outside the expected Berlin region: ${longitude},${latitude}`,
      );
    }
    return;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${sourceId}: malformed coordinate array`);
  }
  value.forEach((nested) => validateCoordinates(nested, sourceId));
}

function validateFeature(source, feature, index) {
  if (feature?.type !== "Feature") {
    throw new Error(`${source.id}: item ${index} is not a GeoJSON Feature`);
  }
  if (!source.geometryTypes.includes(feature.geometry?.type)) {
    throw new Error(
      `${source.id}: item ${index} has unexpected geometry ${feature.geometry?.type}`,
    );
  }
  if (!feature.properties || typeof feature.properties !== "object") {
    throw new Error(`${source.id}: item ${index} has no properties object`);
  }
  for (const property of source.requiredProperties) {
    if (!Object.hasOwn(feature.properties, property)) {
      throw new Error(
        `${source.id}: item ${index} is missing required property ${property}`,
      );
    }
  }
  sourceFeatureId(source, feature);
  validateCoordinates(feature.geometry.coordinates, source.id);
}

function previousSourceCount(previousSources, sourceId) {
  const previous = previousSources?.sources?.find(
    (source) => source.id === sourceId,
  );
  return Number.isFinite(previous?.featureCount)
    ? previous.featureCount
    : null;
}

function validateFeatureCount(source, count, previousSources) {
  if (count < source.minimumCount) {
    throw new Error(
      `${source.id}: received ${count} features, below hard minimum ${source.minimumCount}`,
    );
  }

  const previousCount = previousSourceCount(previousSources, source.id);
  const comparisonCount = previousCount ?? source.baselineCount;
  const minimumFromComparison = Math.floor(
    comparisonCount * (1 - source.maximumDropFraction),
  );
  if (count < minimumFromComparison) {
    throw new Error(
      `${source.id}: implausible count drop from ${comparisonCount} to ${count} (guard ${Math.round(source.maximumDropFraction * 100)}%)`,
    );
  }
}

async function fetchJsonWithRetries(url, sourceId) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/geo+json, application/json",
          "User-Agent": "Parkblick data refresh (parks.soli.blue)",
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("json")) {
        throw new Error(`unexpected content type ${contentType}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }
  throw new Error(`${sourceId}: WFS fetch failed after 3 attempts: ${lastError}`);
}

async function readPreviousSources() {
  try {
    return JSON.parse(await readFile(OUTPUT_FILES.sources, "utf8"));
  } catch {
    return null;
  }
}

async function fetchSource(source, previousSources) {
  const requestUrl = buildWfsUrl(source);
  const retrievedAt = new Date().toISOString();
  const data = await fetchJsonWithRetries(requestUrl, source.id);
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error(`${source.id}: response is not a GeoJSON FeatureCollection`);
  }

  const reportedCount = Number(
    data.numberMatched ?? data.totalFeatures ?? data.features.length,
  );
  if (Number.isFinite(reportedCount) && reportedCount !== data.features.length) {
    throw new Error(
      `${source.id}: response is truncated (${data.features.length} of ${reportedCount})`,
    );
  }

  validateFeatureCount(source, data.features.length, previousSources);
  data.features.forEach((feature, index) =>
    validateFeature(source, feature, index),
  );

  return {
    source,
    data,
    requestUrl,
    retrievedAt,
    fingerprint: sourceFingerprint(source, data.features),
  };
}

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function cleanYear(value) {
  const text = cleanText(value);
  if (!text) return null;
  const match = text.match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function round(value, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function designationStatus(value) {
  const text = cleanText(value)?.toLocaleLowerCase("de");
  if (!text) return null;
  if (text.includes("nicht") || text.includes("ungewidmet")) return false;
  if (text.includes("gewidmet")) return true;
  return null;
}

function normalizeParkGroup(features, id) {
  const first = features[0];
  const properties = first.properties;
  const geometries = features.map((feature) =>
    normalizeGeometry(
      feature.geometry,
      SIMPLIFY_TOLERANCE_METERS,
      COORDINATE_PRECISION,
    ),
  );
  const geometry = combinePolygonGeometries(geometries);
  const area = Number(properties.katasterfl);
  const areaM2 = Number.isFinite(area) && area >= 0 ? round(area, 1) : null;
  const officialName = cleanText(properties.namenr);
  const objectNumber = cleanText(properties.kennzeich);
  const designation = cleanText(properties.widmung);

  return {
    type: "Feature",
    id,
    geometry,
    properties: {
      id,
      name:
        officialName ??
        (objectNumber ? `Grünanlage ${objectNumber}` : "Unbenannte Grünanlage"),
      nameAddon: cleanText(properties.namezusatz),
      objectNumber,
      district: cleanText(properties.bezirkname) ?? "Unbekannter Bezirk",
      locality: cleanText(properties.ortstlname),
      type: cleanText(properties.objartname) ?? "Grünanlage",
      areaM2,
      areaHa: areaM2 === null ? null : round(areaM2 / 10_000, 2),
      designation,
      dedicated: designationStatus(designation),
      builtYear: cleanYear(properties.baujahr),
      renovatedYear: cleanYear(properties.sanierjahr),
      planningAreaId: cleanText(properties.plannr),
      planningAreaName: cleanText(properties.planname),
      centroid: geometryCentroid(geometry),
      bounds: geometryBounds(geometry),
      amenities: null,
      sourceId: "parks",
    },
  };
}

function normalizeParks(sourceResult) {
  const groups = new Map();
  for (const feature of sourceResult.data.features) {
    const id = sourceFeatureId(sourceResult.source, feature);
    const group = groups.get(id) ?? [];
    group.push(feature);
    groups.set(id, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, features]) => normalizeParkGroup(features, id));
}

function normalizeAmenitySource(sourceResult) {
  const { source } = sourceResult;
  const groups = new Map();
  for (const feature of sourceResult.data.features) {
    const sourceId = sourceFeatureId(source, feature);
    const group = groups.get(sourceId) ?? {
      id: `${source.kind}:${sourceId}`,
      sourceId,
      kind: source.kind,
      coverage: source.coverage,
      geometries: [],
    };
    group.geometries.push(
      normalizeGeometry(
        feature.geometry,
        SIMPLIFY_TOLERANCE_METERS,
        COORDINATE_PRECISION,
      ),
    );
    groups.set(sourceId, group);
  }

  return [...groups.values()]
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId))
    .map((amenity) => {
      const childBounds = amenity.geometries.map(geometryBounds);
      return {
        ...amenity,
        bounds: [
          Math.min(...childBounds.map((bounds) => bounds[0])),
          Math.min(...childBounds.map((bounds) => bounds[1])),
          Math.max(...childBounds.map((bounds) => bounds[2])),
          Math.max(...childBounds.map((bounds) => bounds[3])),
        ],
      };
    });
}

function amenityObservation(park, amenities, coverage) {
  let count = 0;
  let nearestMeters = Infinity;
  const parkBounds = park.properties.bounds;

  for (const amenity of amenities) {
    if (
      !boundsCouldBeWithin(
        parkBounds,
        amenity.bounds,
        JOIN_THRESHOLD_METERS,
      )
    ) {
      continue;
    }

    let distance = Infinity;
    for (const geometry of amenity.geometries) {
      distance = Math.min(
        distance,
        geometryDistanceMeters(park.geometry, geometry),
      );
      if (distance === 0) break;
    }

    if (distance <= JOIN_THRESHOLD_METERS) {
      count += 1;
      nearestMeters = Math.min(nearestMeters, distance);
    }
  }

  return {
    status: count > 0 ? "observed-nearby" : "not-observed",
    count,
    nearestMeters:
      count > 0 && Number.isFinite(nearestMeters)
        ? Math.max(0, Math.round(nearestMeters))
        : null,
    coverage,
  };
}

function attachAmenities(parks, amenitiesByKind, coverageByKind) {
  for (const park of parks) {
    park.properties.amenities = {
      playground: amenityObservation(
        park,
        amenitiesByKind.playground,
        coverageByKind.playground,
      ),
      toilet: amenityObservation(
        park,
        amenitiesByKind.toilet,
        coverageByKind.toilet,
      ),
      drinkingFountain: amenityObservation(
        park,
        amenitiesByKind.drinkingFountain,
        coverageByKind.drinkingFountain,
      ),
      dogRun: amenityObservation(
        park,
        amenitiesByKind.dogRun,
        coverageByKind.dogRun,
      ),
    };
  }
}

function buildDistrictSummary(parks) {
  const districts = new Map();
  for (const park of parks) {
    const name = park.properties.district;
    const current = districts.get(name) ?? {
      name,
      parkCount: 0,
      totalAreaM2: 0,
    };
    current.parkCount += 1;
    current.totalAreaM2 += park.properties.areaM2 ?? 0;
    districts.set(name, current);
  }
  return [...districts.values()]
    .map((district) => ({
      ...district,
      totalAreaM2: round(district.totalAreaM2, 1),
      totalAreaHa: round(district.totalAreaM2 / 10_000, 1),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "de"));
}

function buildAmenitySummary(parks, sourceResult, normalizedAmenities) {
  const kind = sourceResult.source.kind;
  const parksWithObservation = parks.filter(
    (park) =>
      park.properties.amenities[kind].status === "observed-nearby",
  ).length;
  return {
    sourceFeatureCount: sourceResult.data.features.length,
    entityCount: normalizedAmenities.length,
    parksWithObservation,
    coverage: sourceResult.source.coverage,
  };
}

function buildOutputs(sourceResults, generatedAt) {
  const sourceById = Object.fromEntries(
    sourceResults.map((result) => [result.source.id, result]),
  );
  const parks = normalizeParks(sourceById.parks);
  const amenityResults = sourceResults.filter(
    (result) => result.source.kind !== "park",
  );
  const amenitiesByKind = Object.fromEntries(
    amenityResults.map((result) => [
      result.source.kind,
      normalizeAmenitySource(result),
    ]),
  );
  const coverageByKind = Object.fromEntries(
    amenityResults.map((result) => [
      result.source.kind,
      result.source.coverage,
    ]),
  );
  attachAmenities(parks, amenitiesByKind, coverageByKind);

  const sourceRecords = sourceResults.map((result) => ({
    id: result.source.id,
    kind: result.source.kind,
    title: result.source.title,
    publisher: "Land Berlin",
    service: result.source.service,
    layer: result.source.layer,
    requestUrl: result.requestUrl,
    metadataUrl: result.source.metadataUrl,
    ...(result.source.schemaUrl
      ? { schemaUrl: result.source.schemaUrl }
      : {}),
    geometryTypes: result.source.geometryTypes,
    featureCount: result.data.features.length,
    normalizedEntityCount:
      result.source.kind === "park"
        ? parks.length
        : amenitiesByKind[result.source.kind].length,
    contentFingerprint: result.fingerprint,
    responseTimestamp: result.data.timeStamp ?? null,
    retrievedAt: result.retrievedAt,
    dataAsOf: result.source.dataAsOf ?? null,
    license: LICENSE,
    coverage: result.source.coverage,
    coverageNote: result.source.coverageNote,
  }));
  const upstreamFingerprint = sha256(
    sourceRecords
      .map((source) => `${source.id}:${source.contentFingerprint}`)
      .sort()
      .join("\n"),
  );
  const totalAreaM2 = parks.reduce(
    (total, park) => total + (park.properties.areaM2 ?? 0),
    0,
  );
  const districts = buildDistrictSummary(parks);
  const parkSource = sourceById.parks.source;

  const geojson = {
    type: "FeatureCollection",
    schemaVersion: DATA_SCHEMA_VERSION,
    generatedAt,
    dataAsOf: parkSource.dataAsOf,
    sourceId: "parks",
    features: parks,
  };
  const index = {
    schemaVersion: DATA_SCHEMA_VERSION,
    generatedAt,
    parks: parks.map(({ id, properties }) => ({
      id,
      name: properties.name,
      nameAddon: properties.nameAddon,
      district: properties.district,
      locality: properties.locality,
      type: properties.type,
      areaM2: properties.areaM2,
      areaHa: properties.areaHa,
      centroid: properties.centroid,
      bounds: properties.bounds,
      amenities: properties.amenities,
    })),
  };
  const summary = {
    schemaVersion: DATA_SCHEMA_VERSION,
    city: "Berlin",
    country: "DE",
    generatedAt,
    dataAsOf: parkSource.dataAsOf,
    parkCount: parks.length,
    sourceParkFeatureCount: sourceById.parks.data.features.length,
    totalAreaM2: round(totalAreaM2, 1),
    totalAreaHa: round(totalAreaM2 / 10_000, 1),
    districtCount: districts.length,
    districts,
    amenities: Object.fromEntries(
      amenityResults.map((result) => [
        result.source.kind,
        buildAmenitySummary(
          parks,
          result,
          amenitiesByKind[result.source.kind],
        ),
      ]),
    ),
  };
  const sources = {
    schemaVersion: DATA_SCHEMA_VERSION,
    generatedAt,
    upstreamFingerprint,
    publisher: "Land Berlin",
    license: LICENSE,
    methodology: {
      canonicalParkId: "pitid",
      coordinateReferenceSystem: "EPSG:4326",
      coordinatePrecision: COORDINATE_PRECISION,
      polygonSimplificationToleranceMeters: SIMPLIFY_TOLERANCE_METERS,
      amenityJoinThresholdMeters: JOIN_THRESHOLD_METERS,
      amenityJoin:
        "Polygon-aware intersection or nearest-boundary distance. One official entity may match more than one adjacent park.",
      duplicateHandling:
        "Features sharing a source identifier are treated as one entity; polygon fragments are combined before matching.",
      areaCalculation:
        "Park and district totals sum the official katasterfl field, not the simplified browser geometry.",
      absenceSemantics:
        "not-observed means no source entity was matched within the threshold. It is not an authoritative claim of absence; dog-run coverage is explicitly partial.",
    },
    sources: sourceRecords,
  };

  return { parks: geojson, index, summary, sources };
}

async function readExistingOutputs() {
  try {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(OUTPUT_FILES).map(async ([key, path]) => [
          key,
          JSON.parse(await readFile(path, "utf8")),
        ]),
      ),
    );
  } catch {
    return null;
  }
}

function outputsAreEquivalent(previous, next) {
  if (!previous) return false;
  return Object.keys(OUTPUT_FILES).every(
    (key) =>
      canonicalJson(stripVolatile(previous[key])) ===
      canonicalJson(stripVolatile(next[key])),
  );
}

async function writeJsonAtomically(path, value) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function main() {
  const previousSources = await readPreviousSources();
  const sourceResults = [];
  for (const source of SOURCE_CONFIG) {
    process.stdout.write(`Fetching ${source.id}… `);
    const result = await fetchSource(source, previousSources);
    sourceResults.push(result);
    process.stdout.write(
      `${result.data.features.length} features (${result.fingerprint.slice(0, 12)})\n`,
    );
  }

  process.stdout.write("Normalizing parks and joining amenities… ");
  const generatedAt = new Date().toISOString();
  const outputs = buildOutputs(sourceResults, generatedAt);
  process.stdout.write("done\n");

  const previousOutputs = await readExistingOutputs();
  if (outputsAreEquivalent(previousOutputs, outputs)) {
    console.log(
      `No canonical content change (${outputs.sources.upstreamFingerprint.slice(0, 12)}); public/data left untouched.`,
    );
    return;
  }

  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  for (const [key, path] of Object.entries(OUTPUT_FILES)) {
    await writeJsonAtomically(path, outputs[key]);
  }
  console.log(
    `Wrote ${outputs.summary.parkCount} parks and ${Object.values(outputs.summary.amenities)
      .map((amenity) => amenity.entityCount)
      .reduce((total, count) => total + count, 0)} amenity entities.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
