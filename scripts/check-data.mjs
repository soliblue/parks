import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import jsts from "jsts";
import {
  CITY_CONFIG,
  DATA_SCHEMA_VERSION,
  JOIN_THRESHOLD_METERS,
} from "./data-sources.mjs";
import { geometryBounds } from "./geo.mjs";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIRECTORY = join(PROJECT_ROOT, "public", "data");
const OUTPUT_NAMES = {
  parks: "parks.geojson",
  index: "parks-index.json",
  summary: "summary.json",
  sources: "sources.json",
};

function cityPaths(cityId) {
  return Object.fromEntries(
    Object.entries(OUTPUT_NAMES).map(([key, name]) => [
      key,
      join(DATA_DIRECTORY, cityId, name),
    ]),
  );
}

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

async function fileSha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function checkSchemaVersion(document, label) {
  invariant(
    document.schemaVersion === DATA_SCHEMA_VERSION,
    `${label}: expected schemaVersion ${DATA_SCHEMA_VERSION}`,
  );
}

function checkDate(value, label) {
  invariant(
    typeof value === "string" && Number.isFinite(Date.parse(value)),
    `${label}: invalid timestamp`,
  );
}

function checkRing(ring, parkId, coordinateBounds) {
  invariant(Array.isArray(ring) && ring.length >= 4, `${parkId}: short ring`);
  const first = ring[0];
  const last = ring[ring.length - 1];
  invariant(
    first[0] === last[0] && first[1] === last[1],
    `${parkId}: unclosed ring`,
  );
  const [west, south, east, north] = coordinateBounds;
  for (const position of ring) {
    invariant(
      Array.isArray(position) &&
        position.length >= 2 &&
        Number.isFinite(position[0]) &&
        Number.isFinite(position[1]),
      `${parkId}: invalid coordinate`,
    );
    invariant(
      position[0] >= west &&
        position[0] <= east &&
        position[1] >= south &&
        position[1] <= north,
      `${parkId}: coordinate outside city region`,
    );
  }
}

function checkGeometry(geometry, parkId, city) {
  invariant(
    geometry?.type === "Polygon" || geometry?.type === "MultiPolygon",
    `${parkId}: unsupported park geometry`,
  );
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  invariant(polygons.length > 0, `${parkId}: geometry has no polygons`);
  for (const polygon of polygons) {
    invariant(polygon.length > 0, `${parkId}: polygon has no rings`);
    polygon.forEach((ring) =>
      checkRing(ring, parkId, city.coordinateBounds),
    );
  }
  const validity = new jsts.operation.valid.IsValidOp(
    new jsts.io.GeoJSONReader().read(geometry),
  );
  invariant(
    validity.isValid(),
    `${parkId}: invalid polygon topology (${validity.getValidationError()})`,
  );
}

function checkObservation(observation, source, parkId) {
  const { kind, coverage } = source;
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
    observation.coverage === coverage,
    `${parkId}: ${kind} coverage mismatch`,
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

function checkParkFeature(feature, ids, city, amenitySources) {
  invariant(feature?.type === "Feature", `${city.id}: non-Feature item`);
  const idIsValid =
    city.id === "berlin"
      ? /^\d{8}:[0-9a-f]{8}$/i.test(feature.id)
      : city.id === "vienna"
        ? /^wien:\d+$/.test(feature.id)
        : feature.id.startsWith(
            city.parkFields.idPrefix || `${city.id}:osm:`,
          ) &&
          feature.id.length >
            (city.parkFields.idPrefix || `${city.id}:osm:`).length;
  invariant(idIsValid, `${city.id}: invalid park id ${feature.id}`);
  invariant(!ids.has(feature.id), `${city.id}: duplicate id ${feature.id}`);
  ids.add(feature.id);
  checkGeometry(feature.geometry, feature.id, city);

  const properties = feature.properties;
  invariant(properties?.id === feature.id, `${feature.id}: property id mismatch`);
  invariant(
    typeof properties.name === "string" && properties.name.trim().length > 0,
    `${feature.id}: empty name`,
  );
  invariant(
    typeof properties.district === "string" &&
      properties.district.trim().length > 0 &&
      properties.district !== "Unbekannter Bezirk",
    `${feature.id}: missing district assignment`,
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
  for (const source of amenitySources) {
    checkObservation(properties.amenities?.[source.kind], source, feature.id);
  }
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

function checkSources(document, city) {
  invariant(
    document.publisher === city.publisher,
    `${city.id}/sources: unexpected publisher`,
  );
  invariant(
    document.license?.id === city.license.id &&
      document.license?.url === city.license.url,
    `${city.id}/sources: unexpected license`,
  );
  invariant(
    Number.isInteger(document.excludedOutsideCityCount) &&
      document.excludedOutsideCityCount >= 0,
    `${city.id}/sources: invalid outside-city exclusion count`,
  );
  if (city.attribution) {
    invariant(
      document.attribution === city.attribution,
      `${city.id}/sources: required attribution missing`,
    );
  }
  invariant(
    /^[0-9a-f]{64}$/.test(document.upstreamFingerprint),
    `${city.id}/sources: invalid upstream fingerprint`,
  );
  invariant(
    document.methodology?.canonicalParkId === city.canonicalParkId,
    `${city.id}/sources: canonical id methodology mismatch`,
  );
  invariant(
    document.methodology?.amenityJoinThresholdMeters ===
      JOIN_THRESHOLD_METERS,
    `${city.id}/sources: join threshold mismatch`,
  );
  invariant(
    typeof document.methodology?.absenceSemantics === "string" &&
      document.methodology.absenceSemantics.includes("not-observed") &&
      document.methodology.absenceSemantics.includes("authoritative"),
    `${city.id}/sources: absence semantics missing`,
  );
  if (city.id === "vienna") {
    invariant(
      document.methodology?.districtAssignment.includes(
        "BEZIRKSGRENZEOGD",
      ) &&
        document.methodology?.inventoryDistinction.includes(
          "PARKINFOOGD",
        ),
      "vienna/sources: inventory or district methodology missing",
    );
  }

  for (const config of city.sources) {
    const source = document.sources.find(
      (candidate) => candidate.id === config.id,
    );
    invariant(source, `${city.id}/sources: missing ${config.id}`);
    invariant(
      source.featureCount >= config.minimumCount,
      `${city.id}/sources: ${config.id} below minimum count`,
    );
    invariant(
      Number.isInteger(source.normalizedEntityCount) &&
        source.normalizedEntityCount >= config.minimumCount &&
        source.normalizedEntityCount <= source.featureCount,
      `${city.id}/sources: ${config.id} invalid normalized count`,
    );
    invariant(
      source.role === config.role &&
        source.kind === config.kind &&
        source.coverage === config.coverage,
      `${city.id}/sources: ${config.id} metadata mismatch`,
    );
    invariant(
      source.publisher === (config.publisher ?? city.publisher) &&
        source.license?.id === (config.license ?? city.license).id,
      `${city.id}/sources: ${config.id} publisher or license mismatch`,
    );
    invariant(
      /^[0-9a-f]{64}$/.test(source.contentFingerprint),
      `${city.id}/sources: ${config.id} invalid fingerprint`,
    );
    checkDate(source.retrievedAt, `${city.id}/sources: ${config.id}`);
    const requestUrl = new URL(source.requestUrl);
    if (config.fetchKind === "osm-pbf") {
      invariant(
        requestUrl.protocol === "https:" &&
          requestUrl.toString() === new URL(config.downloadUrl).toString(),
        `${city.id}/sources: ${config.id} invalid OSM extract URL`,
      );
      if (config.boundaryUrl) {
        invariant(
          source.boundaryUrl === config.boundaryUrl &&
            new URL(source.boundaryUrl).protocol === "https:",
          `${city.id}/sources: ${config.id} invalid boundary URL`,
        );
      }
      if (config.role === "district") {
        if (config.districtPlaceFallback) {
          invariant(
            source.districtAssignmentKind === "nearest-place-label" &&
              source.districtAdminLevel === undefined,
            `${city.id}/sources: ${config.id} invalid place-label fallback`,
          );
        } else {
          invariant(
            source.districtAssignmentKind === "administrative-boundary" &&
              Number.isInteger(source.districtAdminLevel) &&
              config.districtAdminLevels.includes(source.districtAdminLevel),
            `${city.id}/sources: ${config.id} invalid admin level`,
          );
        }
      }
    } else if (config.fetchKind === "direct-geojson") {
      invariant(
        requestUrl.protocol === "https:" &&
          requestUrl.toString() === new URL(config.downloadUrl).toString(),
        `${city.id}/sources: ${config.id} invalid GeoJSON URL`,
      );
    } else {
      const expectedLayer = `${city.wfs.namespace ?? ""}${config.layer}`;
      invariant(
        requestUrl.protocol === "https:" &&
          requestUrl.hostname === new URL(city.wfs.baseUrl).hostname &&
          requestUrl.searchParams.get("request") === "GetFeature" &&
          requestUrl.searchParams.get(city.wfs.typeNameParameter) ===
            expectedLayer &&
          requestUrl.searchParams.get("srsName") === "EPSG:4326",
        `${city.id}/sources: ${config.id} invalid WFS request URL`,
      );
    }
  }
  invariant(
    document.sources.length === city.sources.length,
    `${city.id}/sources: unexpected extra sources`,
  );
}

async function checkCity(city) {
  const paths = cityPaths(city.id);
  const [parks, index, summary, sources] = await Promise.all(
    Object.values(paths).map(readJson),
  );
  for (const [name, document] of Object.entries({
    parks,
    index,
    summary,
    sources,
  })) {
    checkSchemaVersion(document, `${city.id}/${name}`);
    checkDate(document.generatedAt, `${city.id}/${name}/generatedAt`);
  }
  invariant(
    new Set([
      parks.generatedAt,
      index.generatedAt,
      summary.generatedAt,
      sources.generatedAt,
    ]).size === 1,
    `${city.id}: generatedAt must match across snapshots`,
  );
  invariant(
    parks?.type === "FeatureCollection" && Array.isArray(parks.features),
    `${city.id}/parks: invalid FeatureCollection`,
  );
  invariant(Array.isArray(index.parks), `${city.id}/index: invalid parks`);
  invariant(
    parks.features.length === index.parks.length &&
      parks.features.length === summary.parkCount,
    `${city.id}: park counts disagree across snapshots`,
  );
  invariant(
    summary.city === city.name && summary.country === city.country,
    `${city.id}/summary: city identity mismatch`,
  );
  invariant(
    summary.publicGreenSpaceCount === summary.parkCount,
    `${city.id}/summary: normalized public-green count mismatch`,
  );
  if (city.id === "vienna") {
    invariant(
      summary.sourceParkFeatureCount ===
        sources.sources.find((source) => source.id === "parks").featureCount,
      "vienna/summary: source polygon count mismatch",
    );
    invariant(
      summary.catalogParkCount ===
        sources.sources.find((source) => source.id === "park-catalog")
          .featureCount,
      "vienna/summary: park catalogue count mismatch",
    );
    invariant(
      Number.isInteger(summary.excludedOutsideCityCount) &&
        summary.excludedOutsideCityCount > 0 &&
        summary.sourceParkFeatureCount - summary.parkCount ===
          summary.excludedOutsideCityCount,
      "vienna/summary: outside-city exclusion mismatch",
    );
  } else {
    invariant(
      summary.catalogParkCount === null &&
        summary.excludedOutsideCityCount === 0,
      `${city.id}/summary: unexpected catalogue or exclusion count`,
    );
  }

  const amenitySources = city.sources.filter(
    (source) => source.role === "amenity",
  );
  const ids = new Set();
  parks.features.forEach((feature) =>
    checkParkFeature(feature, ids, city, amenitySources),
  );
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
  invariant(summary.totalAreaM2 === areaM2, `${city.id}: area mismatch`);
  invariant(
    summary.totalAreaHa === round(areaM2 / 10_000, 1),
    `${city.id}: hectare mismatch`,
  );
  const districts = new Set(
    parks.features.map((feature) => feature.properties.district),
  );
  invariant(
    summary.districtCount === districts.size &&
      summary.districts.length === districts.size,
    `${city.id}: district count mismatch`,
  );
  if (city.id === "vienna") {
    invariant(
      summary.districtCount ===
        sources.sources.find((source) => source.id === "districts")
          .featureCount,
      "vienna: district metric must match 23 official boundaries",
    );
  }
  const osmDistrictSource = city.sources.find(
    (source) =>
      source.role === "district" && source.fetchKind === "osm-pbf",
  );
  if (osmDistrictSource) {
    const districtSource = sources.sources.find(
      (source) => source.id === "districts",
    );
    const assignmentKind = districtSource?.districtAssignmentKind;
    const expectedMethodology =
      assignmentKind === "nearest-place-label"
        ? "nearest named OpenStreetMap suburb or borough"
        : "OpenStreetMap administrative boundaries";
    invariant(
      summary.districtCount > 1 &&
        !districts.has(city.name) &&
        districtSource?.featureCount >= summary.districtCount &&
        (assignmentKind === "administrative-boundary" ||
          (osmDistrictSource.districtPlaceFallback &&
            assignmentKind === "nearest-place-label")) &&
        sources.methodology?.districtAssignment?.includes(
          expectedMethodology,
        ),
      `${city.id}: OSM district assignment is incomplete`,
    );
  }
  for (const source of amenitySources) {
    const observedCount = parks.features.filter(
      (feature) =>
        feature.properties.amenities[source.kind].status ===
        "observed-nearby",
    ).length;
    invariant(
      summary.amenities[source.kind].parksWithObservation === observedCount &&
        summary.amenities[source.kind].coverage === source.coverage &&
        summary.amenities[source.kind].entityCount >= source.minimumCount,
      `${city.id}/summary: ${source.kind} mismatch`,
    );
  }
  checkSources(sources, city);
  invariant(
    sources.excludedOutsideCityCount === summary.excludedOutsideCityCount,
    `${city.id}: source/summary outside-city exclusion mismatch`,
  );

  const fileSizes = Object.fromEntries(
    await Promise.all(
      Object.entries(paths).map(async ([name, path]) => [
        name,
        (await stat(path)).size,
      ]),
    ),
  );
  invariant(
    fileSizes.parks < 20_000_000,
    `${city.id}/parks.geojson is unexpectedly large`,
  );
  invariant(
    fileSizes.index < 6_000_000,
    `${city.id}/parks-index.json is unexpectedly large`,
  );
  return { summary, fileSizes };
}

function checkManifestEntry(entry, city, summary) {
  const expected = {
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
    availableAmenities: city.sources
      .filter((source) => source.role === "amenity")
      .map((source) => source.kind),
    access: null,
  };
  invariant(
    sameJson(entry, expected),
    `cities.json: ${city.id} diverges from summary/config`,
  );
}

async function checkAccess(checked) {
  const path = join(DATA_DIRECTORY, "access.json");
  const access = await readJson(path);
  checkSchemaVersion(access, "access.json");
  checkDate(access.generatedAt, "access.json/generatedAt");
  invariant(
    access.methodology &&
      typeof access.methodology.numerator === "string" &&
      typeof access.methodology.denominator === "string" &&
      typeof access.methodology.uncertainty === "string",
    "access.json: metric definition or uncertainty missing",
  );
  invariant(
    Array.isArray(access.sources) &&
      access.sources.length >= CITY_CONFIG.length * 3 + 7,
    "access.json: source provenance missing",
  );
  const populationSources = access.sources.filter(
    (source) => source.role === "population",
  );
  invariant(
    populationSources.length === 7 &&
      populationSources.every(
        (source) =>
          /^ghsl-population-2020-100m-r\d+_c\d+$/.test(source.id) &&
          /^[0-9a-f]{64}$/.test(source.sha256),
      ),
    "access.json: complete GHSL population-tile provenance missing",
  );

  for (const { id: requiredCityId } of CITY_CONFIG) {
    invariant(
      access.cities?.[requiredCityId],
      `access.json: missing ${requiredCityId}`,
    );
  }

  for (const city of CITY_CONFIG) {
    const result = access.cities?.[city.id];
    checkDate(result.generatedAt, `access.json/${city.id}/generatedAt`);
    invariant(
      result.generatedAt === access.generatedAt,
      `access.json/${city.id}: generatedAt mismatch`,
    );
    invariant(
      result.method === "walking-network" &&
        result.populationYear === 2020 &&
        result.thresholdMinutes === 10 &&
        result.thresholdMeters === 805,
      `access.json/${city.id}: method contract mismatch`,
    );
    invariant(
      Number.isInteger(result.populationTotal) &&
        result.populationTotal > 400_000 &&
        Number.isInteger(result.populationWithinThreshold) &&
        result.populationWithinThreshold >= 0 &&
        result.populationWithinThreshold <= result.populationTotal,
      `access.json/${city.id}: invalid population numerator or denominator`,
    );
    invariant(
      result.sharePercent ===
        round(
          (result.populationWithinThreshold / result.populationTotal) * 100,
          1,
        ),
      `access.json/${city.id}: percentage does not match population totals`,
    );
    invariant(
      result.guardrails?.populationGridResolutionMeters === 100 &&
        result.guardrails?.populationModel?.includes("GHSL") &&
        Array.isArray(result.guardrails?.populationTileIds) &&
        result.guardrails.populationTileIds.length > 0 &&
        /^EPSG:326\d{2}$/.test(result.guardrails?.metricProjection ?? "") &&
        result.guardrails?.minimumEligibleParkAreaHa === 0.5 &&
        result.guardrails?.parkInputFeatureCount ===
          checked[city.id].summary.parkCount &&
        result.guardrails?.eligibleParkCount > 0 &&
        result.guardrails?.parksWithoutNetworkAccess >= 0 &&
        result.guardrails?.populationBoundaryUncoveredM2 === 0 &&
        Number.isInteger(result.guardrails?.populationBeyondSnapLimit) &&
        result.guardrails.populationBeyondSnapLimit >= 0 &&
        result.guardrails.populationBeyondSnapLimit / result.populationTotal <=
          0.05 &&
        result.guardrails.parksWithoutNetworkAccess /
          result.guardrails.eligibleParkCount <=
          0.1 &&
        !Object.hasOwn(result.guardrails, "networkSourceWasCached"),
      `access.json/${city.id}: guardrails are incomplete or operationally unstable`,
    );

    const parkSource = access.sources.find(
      (source) => source.id === `${city.id}-parks`,
    );
    const networkSource = access.sources.find(
      (source) => source.id === `${city.id}-pedestrian-network`,
    );
    invariant(
      parkSource?.sha256 ===
        (await fileSha256(cityPaths(city.id).parks)),
      `access.json/${city.id}: park snapshot hash is stale`,
    );
    invariant(
      /^[0-9a-f]{64}$/.test(networkSource?.sha256 ?? ""),
      `access.json/${city.id}: OSM network source missing`,
    );
  }
}

async function checkBrandRemoval() {
  const legacyBrandPattern = new RegExp(["park", "blick"].join(""), "i");
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: PROJECT_ROOT,
    encoding: "buffer",
    maxBuffer: 20_000_000,
  });
  const paths = stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const offenders = [];
  for (const path of paths) {
    let buffer;
    try {
      buffer = await readFile(join(PROJECT_ROOT, path));
    } catch {
      continue;
    }
    if (buffer.includes(0)) continue;
    if (legacyBrandPattern.test(buffer.toString("utf8"))) offenders.push(path);
  }
  invariant(
    offenders.length === 0,
    `legacy brand remains in tracked text: ${offenders.join(", ")}`,
  );
}

async function checkHostingConfig() {
  const headers = await readFile(
    join(PROJECT_ROOT, "public", "_headers"),
    "utf8",
  );
  for (const basemapHost of [
    "https://sgx.geodatenzentrum.de",
    "https://mapsneu.wien.gv.at",
    "https://tiles.openfreemap.org",
  ]) {
    invariant(
      headers.includes(basemapHost),
      `public/_headers: CSP does not allow ${basemapHost}`,
    );
  }
}

async function main() {
  const checked = {};
  for (const city of CITY_CONFIG) {
    checked[city.id] = await checkCity(city);
  }

  const manifest = await readJson(join(DATA_DIRECTORY, "cities.json"));
  checkSchemaVersion(manifest, "cities.json");
  checkDate(manifest.generatedAt, "cities.json/generatedAt");
  invariant(
    Array.isArray(manifest.cities) &&
      manifest.cities.length === CITY_CONFIG.length,
    "cities.json: city count mismatch",
  );
  for (const city of CITY_CONFIG) {
    const entry = manifest.cities.find((candidate) => candidate.id === city.id);
    invariant(entry, `cities.json: missing ${city.id}`);
    checkManifestEntry(entry, city, checked[city.id].summary);
  }
  invariant(
    manifest.generatedAt ===
      manifest.cities
        .map((city) => city.sourceDates.snapshotGeneratedAt)
        .sort()
        .at(-1),
    "cities.json: generatedAt must be the latest city snapshot",
  );
  await checkAccess(checked);
  await checkHostingConfig();
  await checkBrandRemoval();

  const result = CITY_CONFIG.map((city) => {
    const { summary, fileSizes } = checked[city.id];
    return `${city.name}: ${summary.parkCount} Flächen, ${summary.totalAreaHa.toLocaleString("de-DE")} ha, ${summary.districtCount} Bezirke, ${(fileSizes.parks / 1_000_000).toFixed(2)} MB`;
  }).join("; ");
  console.log(`Data check passed (schema v${DATA_SCHEMA_VERSION}): ${result}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
