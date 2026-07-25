import type {
  ParkData,
  ParksFeatureCollection,
  ParksIndex,
  ParksSummary,
  SourcesManifest,
} from "./types";

const dataBaseUrl = "/data/";

async function loadJson<T>(filename: string): Promise<T> {
  const response = await fetch(`${dataBaseUrl}${filename}`);
  if (!response.ok) {
    throw new Error(
      `Could not load ${filename}: ${response.status} ${response.statusText}`,
    );
  }
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("schemaVersion" in data) ||
    data.schemaVersion !== 1
  ) {
    throw new Error(`${filename} has an unsupported data schema`);
  }
  return data as T;
}

export function loadParks(): Promise<ParksFeatureCollection> {
  return loadJson("parks.geojson");
}

export function loadParksIndex(): Promise<ParksIndex> {
  return loadJson("parks-index.json");
}

export function loadParksSummary(): Promise<ParksSummary> {
  return loadJson("summary.json");
}

export function loadSources(): Promise<SourcesManifest> {
  return loadJson("sources.json");
}

let parkDataPromise: Promise<ParkData> | undefined;

export function loadParkData(): Promise<ParkData> {
  parkDataPromise ??= Promise.all([
    loadParks(),
    loadParksIndex(),
    loadParksSummary(),
    loadSources(),
  ]).then(([parks, index, summary, sources]) => ({
    parks,
    index,
    summary,
    sources,
  }));
  return parkDataPromise;
}
