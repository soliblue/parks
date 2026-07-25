import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CITY_CONFIG,
  COORDINATE_PRECISION,
  DATA_SCHEMA_VERSION,
  JOIN_THRESHOLD_METERS,
  SIMPLIFY_TOLERANCE_METERS,
  buildWfsUrl,
} from "./data-sources.mjs";
import {
  boundsCouldBeWithin,
  canonicalizeGeometry,
  combinePolygonGeometries,
  geometryBounds,
  geometryCentroid,
  geometryDistanceMeters,
  normalizeGeometry,
  pointInGeometry,
} from "./geo.mjs";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIRECTORY = join(PROJECT_ROOT, "public", "data");
const OUTPUT_NAMES = {
  parks: "parks.geojson",
  index: "parks-index.json",
  summary: "summary.json",
  sources: "sources.json",
};
const VOLATILE_KEYS = new Set([
  "generatedAt",
  "retrievedAt",
  "responseTimestamp",
]);
const VOLATILE_SOURCE_PROPERTY_KEYS = new Set(["SE_ANNO_CAD_DATA"]);

function outputFiles(cityId, rootFallback = false) {
  const directory = rootFallback
    ? OUTPUT_DIRECTORY
    : join(OUTPUT_DIRECTORY, cityId);
  return Object.fromEntries(
    Object.entries(OUTPUT_NAMES).map(([key, name]) => [
      key,
      join(directory, name),
    ]),
  );
}

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
        geometry: canonicalizeGeometry(feature.geometry),
        properties: Object.fromEntries(
          Object.entries(feature.properties).filter(
            ([key]) => !VOLATILE_SOURCE_PROPERTY_KEYS.has(key),
          ),
        ),
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

function validateCoordinates(value, sourceId, coordinateBounds) {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    const [longitude, latitude] = value;
    const [west, south, east, north] = coordinateBounds;
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < west ||
      longitude > east ||
      latitude < south ||
      latitude > north
    ) {
      throw new Error(
        `${sourceId}: coordinate is outside the expected city region: ${longitude},${latitude}`,
      );
    }
    return;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${sourceId}: malformed coordinate array`);
  }
  value.forEach((nested) =>
    validateCoordinates(nested, sourceId, coordinateBounds),
  );
}

function validateFeature(city, source, feature, index) {
  if (feature?.type !== "Feature") {
    throw new Error(`${city.id}/${source.id}: item ${index} is not a Feature`);
  }
  if (!source.geometryTypes.includes(feature.geometry?.type)) {
    throw new Error(
      `${city.id}/${source.id}: item ${index} has unexpected geometry ${feature.geometry?.type}`,
    );
  }
  if (!feature.properties || typeof feature.properties !== "object") {
    throw new Error(
      `${city.id}/${source.id}: item ${index} has no properties object`,
    );
  }
  for (const property of source.requiredProperties) {
    if (!Object.hasOwn(feature.properties, property)) {
      throw new Error(
        `${city.id}/${source.id}: item ${index} is missing required property ${property}`,
      );
    }
  }
  sourceFeatureId(source, feature);
  validateCoordinates(
    feature.geometry.coordinates,
    `${city.id}/${source.id}`,
    city.coordinateBounds,
  );
}

function previousSourceCount(previousSources, sourceId) {
  const previous = previousSources?.sources?.find(
    (source) => source.id === sourceId,
  );
  return Number.isFinite(previous?.featureCount)
    ? previous.featureCount
    : null;
}

function validateFeatureCount(source, count, previousSources, cityId) {
  if (count < source.minimumCount) {
    throw new Error(
      `${cityId}/${source.id}: received ${count} features, below hard minimum ${source.minimumCount}`,
    );
  }
  const comparisonCount =
    previousSourceCount(previousSources, source.id) ?? source.baselineCount;
  const minimumFromComparison = Math.floor(
    comparisonCount * (1 - source.maximumDropFraction),
  );
  if (count < minimumFromComparison) {
    throw new Error(
      `${cityId}/${source.id}: implausible count drop from ${comparisonCount} to ${count} (guard ${Math.round(source.maximumDropFraction * 100)}%)`,
    );
  }
}

async function fetchJsonWithRetries(url, label) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/geo+json, application/json",
          "User-Agent": "parks.soli.blue data refresh",
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
  throw new Error(`${label}: WFS fetch failed after 3 attempts: ${lastError}`);
}

async function fetchSource(city, source, previousSources) {
  const requestUrl = buildWfsUrl(city, source);
  const retrievedAt = new Date().toISOString();
  const data = await fetchJsonWithRetries(
    requestUrl,
    `${city.id}/${source.id}`,
  );
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error(
      `${city.id}/${source.id}: response is not a FeatureCollection`,
    );
  }
  const reportedCount = Number(
    data.numberMatched ?? data.totalFeatures ?? data.features.length,
  );
  if (Number.isFinite(reportedCount) && reportedCount !== data.features.length) {
    throw new Error(
      `${city.id}/${source.id}: response is truncated (${data.features.length} of ${reportedCount})`,
    );
  }
  validateFeatureCount(
    source,
    data.features.length,
    previousSources,
    city.id,
  );
  data.features.forEach((feature, index) =>
    validateFeature(city, source, feature, index),
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

function normalizeBerlinParkGroup(features, id) {
  const properties = features[0].properties;
  const geometry = combinePolygonGeometries(
    features.map((feature) =>
      normalizeGeometry(
        feature.geometry,
        SIMPLIFY_TOLERANCE_METERS,
        COORDINATE_PRECISION,
      ),
    ),
  );
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

function normalizeBerlinParks(sourceResult) {
  const groups = new Map();
  for (const feature of sourceResult.data.features) {
    const id = sourceFeatureId(sourceResult.source, feature);
    const group = groups.get(id) ?? [];
    group.push(feature);
    groups.set(id, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, features]) => normalizeBerlinParkGroup(features, id));
}

function normalizeViennaDistricts(sourceResult) {
  return sourceResult.data.features
    .map((feature) => ({
      number: Number(feature.properties.BEZNR),
      name:
        cleanText(feature.properties.NAMEK) ??
        `Bezirk ${feature.properties.BEZNR}`,
      geometry: feature.geometry,
      bounds: geometryBounds(feature.geometry),
    }))
    .sort((left, right) => left.number - right.number);
}

function districtForPoint(point, districts) {
  return (
    districts.find(
      (district) =>
        point[0] >= district.bounds[0] &&
        point[0] <= district.bounds[2] &&
        point[1] >= district.bounds[1] &&
        point[1] <= district.bounds[3] &&
        pointInGeometry(point, district.geometry),
    ) ?? null
  );
}

function normalizeViennaParks(sourceResult, districtResult) {
  const districts = normalizeViennaDistricts(districtResult);
  return sourceResult.data.features
    .map((feature) => {
      const properties = feature.properties;
      const sourceId = sourceFeatureId(sourceResult.source, feature);
      const id = `wien:${sourceId}`;
      const geometry = canonicalizeGeometry(
        normalizeGeometry(
          feature.geometry,
          SIMPLIFY_TOLERANCE_METERS,
          COORDINATE_PRECISION,
        ),
      );
      const area = Number(properties.FLAECHE);
      const areaM2 =
        Number.isFinite(area) && area >= 0 ? round(area, 1) : null;
      const centroid = geometryCentroid(geometry);
      const district = districtForPoint(centroid, districts);
      if (!district) return null;
      return {
        type: "Feature",
        id,
        geometry,
        properties: {
          id,
          name:
            cleanText(properties.T_LANG) ??
            cleanText(properties.T_TEXT) ??
            `Grünfläche ${sourceId}`,
          nameAddon: null,
          objectNumber: sourceId,
          district: district.name,
          locality: null,
          type: "Öffentliche Grünfläche",
          areaM2,
          areaHa: areaM2 === null ? null : round(areaM2 / 10_000, 2),
          designation: null,
          dedicated: null,
          builtYear: null,
          renovatedYear: null,
          planningAreaId: null,
          planningAreaName: null,
          centroid,
          bounds: geometryBounds(geometry),
          amenities: null,
          sourceId: "parks",
        },
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id));
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
  for (const amenity of amenities) {
    if (
      !boundsCouldBeWithin(
        park.properties.bounds,
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

function attachAmenities(parks, amenityResults) {
  const amenitiesByKind = Object.fromEntries(
    amenityResults.map((result) => [
      result.source.kind,
      normalizeAmenitySource(result),
    ]),
  );
  for (const park of parks) {
    park.properties.amenities = Object.fromEntries(
      amenityResults.map((result) => [
        result.source.kind,
        amenityObservation(
          park,
          amenitiesByKind[result.source.kind],
          result.source.coverage,
        ),
      ]),
    );
  }
  return amenitiesByKind;
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

function normalizedEntityCount(result, parks, amenitiesByKind) {
  if (result.source.role === "park") return parks.length;
  if (result.source.role === "amenity") {
    return amenitiesByKind[result.source.kind].length;
  }
  return new Set(
    result.data.features.map((feature) =>
      sourceFeatureId(result.source, feature),
    ),
  ).size;
}

function buildAmenitySummary(parks, result, normalizedAmenities) {
  const { kind } = result.source;
  return {
    sourceFeatureCount: result.data.features.length,
    entityCount: normalizedAmenities.length,
    parksWithObservation: parks.filter(
      (park) =>
        park.properties.amenities[kind].status === "observed-nearby",
    ).length,
    coverage: result.source.coverage,
  };
}

function buildOutputs(city, sourceResults, generatedAt) {
  const sourceById = Object.fromEntries(
    sourceResults.map((result) => [result.source.id, result]),
  );
  const parkResult = sourceById.parks;
  const parks =
    city.id === "berlin"
      ? normalizeBerlinParks(parkResult)
      : normalizeViennaParks(parkResult, sourceById.districts);
  const amenityResults = sourceResults.filter(
    (result) => result.source.role === "amenity",
  );
  const amenitiesByKind = attachAmenities(parks, amenityResults);
  const sourceRecords = sourceResults.map((result) => ({
    id: result.source.id,
    kind: result.source.kind,
    role: result.source.role,
    title: result.source.title,
    publisher: city.publisher,
    ...(result.source.service ? { service: result.source.service } : {}),
    layer: result.source.layer,
    requestUrl: result.requestUrl,
    metadataUrl: result.source.metadataUrl,
    ...(result.source.schemaUrl
      ? { schemaUrl: result.source.schemaUrl }
      : {}),
    geometryTypes: result.source.geometryTypes,
    featureCount: result.data.features.length,
    normalizedEntityCount: normalizedEntityCount(
      result,
      parks,
      amenitiesByKind,
    ),
    contentFingerprint: result.fingerprint,
    responseTimestamp: result.data.timeStamp ?? null,
    retrievedAt: result.retrievedAt,
    dataAsOf: result.source.dataAsOf ?? null,
    license: city.license,
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
  const excludedOutsideCityCount =
    city.id === "vienna"
      ? parkResult.data.features.length - parks.length
      : 0;
  const catalogParkCount =
    sourceById["park-catalog"]?.data.features.length ?? null;
  const publicGreenSpaceCount = parks.length;

  const geojson = {
    type: "FeatureCollection",
    schemaVersion: DATA_SCHEMA_VERSION,
    generatedAt,
    dataAsOf: parkResult.source.dataAsOf ?? null,
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
    city: city.name,
    country: city.country,
    generatedAt,
    dataAsOf: parkResult.source.dataAsOf ?? null,
    parkCount: parks.length,
    publicGreenSpaceCount,
    catalogParkCount,
    sourceParkFeatureCount: parkResult.data.features.length,
    totalAreaM2: round(totalAreaM2, 1),
    totalAreaHa: round(totalAreaM2 / 10_000, 1),
    districtCount: districts.length,
    excludedOutsideCityCount,
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
    publisher: city.publisher,
    excludedOutsideCityCount,
    ...(city.attribution ? { attribution: city.attribution } : {}),
    license: city.license,
    methodology: {
      canonicalParkId: city.canonicalParkId,
      coordinateReferenceSystem: "EPSG:4326",
      coordinatePrecision: COORDINATE_PRECISION,
      polygonSimplificationToleranceMeters: SIMPLIFY_TOLERANCE_METERS,
      amenityJoinThresholdMeters: JOIN_THRESHOLD_METERS,
      amenityJoin:
        "Polygon-aware intersection or nearest-boundary distance. One official entity may match more than one adjacent green space.",
      duplicateHandling:
        "Features sharing a source identifier are treated as one entity; polygon fragments are combined before matching.",
      areaCalculation:
        city.id === "berlin"
          ? "Park and district totals sum the official katasterfl field, not the simplified browser geometry."
          : "Green-space and district totals sum the official FLAECHE field, not the simplified browser geometry.",
      ...(city.id === "vienna"
        ? {
            districtAssignment:
              "Each mapped green-space centroid is assigned by point-in-polygon against the official BEZIRKSGRENZEOGD boundaries. Source polygons whose centroid is outside all 23 boundaries are excluded from city metrics and reported as excludedOutsideCityCount.",
            inventoryDistinction:
              "OEFFGRUENFLOGD polygons are the mapped public-green inventory. PARKINFOOGD is a separate park catalogue and is reported as context, not substituted for polygon features.",
          }
        : {}),
      absenceSemantics:
        "not-observed means no source entity was matched within the threshold. It is not an authoritative claim of absence; source coverage notes remain controlling.",
    },
    sources: sourceRecords,
  };
  return { parks: geojson, index, summary, sources };
}

async function readOutputSet(paths) {
  try {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(paths).map(async ([key, path]) => [
          key,
          JSON.parse(await readFile(path, "utf8")),
        ]),
      ),
    );
  } catch {
    return null;
  }
}

async function readExistingOutputs(city) {
  const current = await readOutputSet(outputFiles(city.id));
  if (current) return { outputs: current, migrated: true };
  if (city.id === "berlin") {
    const legacy = await readOutputSet(outputFiles(city.id, true));
    if (legacy) return { outputs: legacy, migrated: false };
  }
  return { outputs: null, migrated: false };
}

function outputsAreEquivalent(previous, next) {
  if (!previous) return false;
  return Object.keys(OUTPUT_NAMES).every(
    (key) =>
      canonicalJson(stripVolatile(previous[key])) ===
      canonicalJson(stripVolatile(next[key])),
  );
}

async function writeJsonAtomically(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value)}\n`, "utf8");
  await rename(temporaryPath, path);
}

async function writeOutputSet(cityId, outputs) {
  for (const [key, path] of Object.entries(outputFiles(cityId))) {
    await writeJsonAtomically(path, outputs[key]);
  }
}

function buildCitiesManifest(effectiveOutputs) {
  const cities = CITY_CONFIG.map((city) => {
    const summary = effectiveOutputs[city.id].summary;
    return {
      id: city.id,
      name: city.name,
      country: city.country,
      center: city.center,
      bounds: city.bounds,
      zoom: city.zoom,
      dataPath: `/data/${city.id}`,
      parkCount: summary.parkCount,
      publicGreenSpaceCount: summary.publicGreenSpaceCount,
      catalogParkCount: summary.catalogParkCount,
      totalAreaM2: summary.totalAreaM2,
      totalAreaHa: summary.totalAreaHa,
      districtCount: summary.districtCount,
      sourceDates: {
        dataAsOf: summary.dataAsOf,
        snapshotGeneratedAt: summary.generatedAt,
      },
      access: null,
    };
  });
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    generatedAt: cities
      .map((city) => city.sourceDates.snapshotGeneratedAt)
      .sort()
      .at(-1),
    cities,
  };
}

async function removeLegacyRootSnapshots() {
  await Promise.all(
    Object.values(outputFiles("berlin", true)).map((path) =>
      unlink(path).catch((error) => {
        if (error?.code !== "ENOENT") throw error;
      }),
    ),
  );
}

async function main() {
  const effectiveOutputs = {};
  for (const city of CITY_CONFIG) {
    const existing = await readExistingOutputs(city);
    const previousSources = existing.outputs?.sources ?? null;
    const sourceResults = [];
    for (const source of city.sources) {
      process.stdout.write(`Fetching ${city.id}/${source.id}… `);
      const result = await fetchSource(city, source, previousSources);
      sourceResults.push(result);
      process.stdout.write(
        `${result.data.features.length} features (${result.fingerprint.slice(0, 12)})\n`,
      );
    }
    process.stdout.write(`Normalizing ${city.name} and joining amenities… `);
    const outputs = buildOutputs(
      city,
      sourceResults,
      new Date().toISOString(),
    );
    process.stdout.write("done\n");
    const unchanged =
      existing.migrated &&
      outputsAreEquivalent(existing.outputs, outputs);
    if (unchanged) {
      effectiveOutputs[city.id] = existing.outputs;
      console.log(
        `${city.name}: no canonical content change (${outputs.sources.upstreamFingerprint.slice(0, 12)}); snapshots left untouched.`,
      );
    } else {
      await writeOutputSet(city.id, outputs);
      effectiveOutputs[city.id] = outputs;
      console.log(
        `${city.name}: wrote ${outputs.summary.parkCount} mapped green spaces.`,
      );
    }
  }

  const manifestPath = join(OUTPUT_DIRECTORY, "cities.json");
  const manifest = buildCitiesManifest(effectiveOutputs);
  const previousManifest = await readOutputSet({ manifest: manifestPath });
  if (
    !previousManifest ||
    canonicalJson(previousManifest.manifest) !== canonicalJson(manifest)
  ) {
    await writeJsonAtomically(manifestPath, manifest);
    console.log(`Wrote city manifest with ${manifest.cities.length} cities.`);
  } else {
    console.log("City manifest unchanged.");
  }
  await removeLegacyRootSnapshots();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
