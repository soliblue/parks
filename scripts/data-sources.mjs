export const DATA_SCHEMA_VERSION = 1;
export const JOIN_THRESHOLD_METERS = 75;
export const SIMPLIFY_TOLERANCE_METERS = 2.5;
export const COORDINATE_PRECISION = 8;

export const BERLIN_LICENSE = {
  id: "dl-de-zero-2.0",
  name: "Datenlizenz Deutschland – Zero – Version 2.0",
  url: "https://www.govdata.de/dl-de/zero-2-0",
};

export const VIENNA_LICENSE = {
  id: "cc-by-4.0",
  name: "Creative Commons Namensnennung 4.0 International",
  url: "https://creativecommons.org/licenses/by/4.0/",
  attribution: "Datenquelle: Stadt Wien – data.wien.gv.at",
};

const BERLIN_SOURCES = [
  {
    id: "parks",
    role: "park",
    kind: "park",
    title: "Grünanlagenbestand Berlin",
    service: "gruenanlagen",
    layer: "gruenanlagen:gruenanlagen",
    geometryTypes: ["Polygon", "MultiPolygon"],
    requiredProperties: [
      "pitid",
      "bezirkname",
      "objartname",
      "namenr",
      "katasterfl",
    ],
    idProperty: "pitid",
    baselineCount: 2563,
    minimumCount: 2050,
    maximumDropFraction: 0.2,
    dataAsOf: "2026-04-09",
    metadataUrl:
      "https://daten.berlin.de/datensaetze/grunanlagenbestand-berlin-einschliesslich-der-offentlichen-spielplatze-wfs-737fd0a4",
    schemaUrl:
      "https://gdi.berlin.de/data/gruenanlagen/docs/Datenformatbeschreibung_Gruenanlagen_Spielplaetze.pdf",
    coverage: "official-observations",
    coverageNote:
      "Official Berlin inventory, maintained by district offices and published by the State of Berlin.",
  },
  {
    id: "playgrounds",
    role: "amenity",
    kind: "playground",
    title: "Öffentliche Spielplätze",
    service: "gruenanlagen",
    layer: "gruenanlagen:spielplaetze",
    geometryTypes: ["Polygon", "MultiPolygon"],
    requiredProperties: ["pitid", "bezirkname", "objartname", "namenr"],
    idProperty: "pitid",
    baselineCount: 1886,
    minimumCount: 1500,
    maximumDropFraction: 0.2,
    dataAsOf: "2026-04-09",
    metadataUrl:
      "https://daten.berlin.de/datensaetze/grunanlagenbestand-berlin-einschliesslich-der-offentlichen-spielplatze-wfs-737fd0a4",
    schemaUrl:
      "https://gdi.berlin.de/data/gruenanlagen/docs/Datenformatbeschreibung_Gruenanlagen_Spielplaetze.pdf",
    coverage: "official-observations",
    coverageNote:
      "Official public-playground observations; a missing nearby match is not proof that no playground exists.",
  },
  {
    id: "toilets",
    role: "amenity",
    kind: "toilet",
    title: "Öffentliche Toiletten",
    service: "toiletten",
    layer: "toiletten:toiletten",
    geometryTypes: ["Point"],
    requiredProperties: ["fid", "bezirk", "standort"],
    idProperty: "fid",
    baselineCount: 509,
    minimumCount: 400,
    maximumDropFraction: 0.2,
    metadataUrl:
      "https://gdi.berlin.de/data/toiletten/docs/Oeffentliche_Toiletten.pdf",
    schemaUrl:
      "https://gdi.berlin.de/data/toiletten/docs/Datenformatbeschreibung_Oeffentliche_Toiletten.pdf",
    coverage: "official-observations",
    coverageNote:
      "Official published observations; a missing nearby match is not proof that no public toilet exists.",
  },
  {
    id: "drinking-fountains",
    role: "amenity",
    kind: "drinkingFountain",
    title: "Trinkwasserbrunnen",
    service: "trinkwasserbrunnen",
    layer: "trinkwasserbrunnen:trinkwasserbrunnen",
    geometryTypes: ["Point"],
    requiredProperties: ["nummer", "bezirk", "standort"],
    idProperty: "nummer",
    baselineCount: 242,
    minimumCount: 190,
    maximumDropFraction: 0.2,
    metadataUrl:
      "https://gdi.berlin.de/services/wfs/trinkwasserbrunnen?service=WFS&version=2.0.0&request=GetCapabilities",
    coverage: "official-observations",
    coverageNote:
      "Official published observations; fountains are generally seasonal and availability can change.",
  },
  {
    id: "dog-runs",
    role: "amenity",
    kind: "dogRun",
    title: "Hundefreilaufflächen",
    service: "hundefreilauf",
    layer: "hundefreilauf:hundefreilauf",
    geometryTypes: ["Polygon", "MultiPolygon"],
    requiredProperties: ["gisid", "bezirk", "typ"],
    idProperty: "gisid",
    baselineCount: 30,
    minimumCount: 22,
    maximumDropFraction: 0.25,
    metadataUrl:
      "https://gdi.berlin.de/services/wfs/hundefreilauf?service=WFS&version=2.0.0&request=GetCapabilities",
    coverage: "partial-official-observations",
    coverageNote:
      "Partial official coverage. No nearby match must never be presented as proof that dogs are not allowed or that no dog area exists.",
  },
];

const VIENNA_METADATA_URL = "https://data.wien.gv.at";
const VIENNA_SOURCES = [
  {
    id: "parks",
    role: "park",
    kind: "park",
    title: "Öffentlich zugängliche Grünflächen Wien",
    layer: "OEFFGRUENFLOGD",
    geometryTypes: ["Polygon", "MultiPolygon"],
    requiredProperties: ["OBJECTID", "T_LANG", "T_TEXT", "FLAECHE"],
    idProperty: "OBJECTID",
    baselineCount: 1936,
    minimumCount: 1500,
    maximumDropFraction: 0.2,
    metadataUrl: VIENNA_METADATA_URL,
    coverage: "official-observations",
    coverageNote:
      "Official mapped public-green-space polygons published by the City of Vienna.",
  },
  {
    id: "park-catalog",
    role: "context",
    kind: "parkCatalog",
    title: "Parkanlagen Wien",
    layer: "PARKINFOOGD",
    geometryTypes: ["Point"],
    requiredProperties: ["OBJECTID", "ANL_NAME", "BEZIRK"],
    idProperty: "OBJECTID",
    baselineCount: 1051,
    minimumCount: 800,
    maximumDropFraction: 0.2,
    metadataUrl: VIENNA_METADATA_URL,
    coverage: "official-observations",
    coverageNote:
      "Official park catalogue used as source context; it is not substituted for the public-green polygon map.",
  },
  {
    id: "playgrounds",
    role: "amenity",
    kind: "playground",
    title: "Spielplätze Wien",
    layer: "SPIELPLATZPUNKTOGD",
    geometryTypes: ["Point"],
    requiredProperties: ["OBJECTID", "ANL_NAME", "BEZIRK"],
    idProperty: "OBJECTID",
    baselineCount: 771,
    minimumCount: 600,
    maximumDropFraction: 0.2,
    metadataUrl: VIENNA_METADATA_URL,
    coverage: "official-observations",
    coverageNote:
      "Official playground locations; a missing nearby match is not proof that no playground exists.",
  },
  {
    id: "toilets",
    role: "amenity",
    kind: "toilet",
    title: "Öffentliche WC-Anlagen Wien",
    layer: "WCANLAGE2OGD",
    geometryTypes: ["Point"],
    requiredProperties: ["OBJECTID", "BEZIRK", "AKTIV"],
    idProperty: "OBJECTID",
    baselineCount: 269,
    minimumCount: 210,
    maximumDropFraction: 0.2,
    metadataUrl: VIENNA_METADATA_URL,
    coverage: "official-observations",
    coverageNote:
      "Official published WC locations; a missing nearby match is not proof that no public toilet exists.",
  },
  {
    id: "drinking-fountains",
    role: "amenity",
    kind: "drinkingFountain",
    title: "Trinkbrunnen Wien",
    layer: "TRINKBRUNNENOGD",
    geometryTypes: ["Point"],
    requiredProperties: ["OBJECTID", "BASIS_TYP_TXT"],
    idProperty: "OBJECTID",
    baselineCount: 2370,
    minimumCount: 1850,
    maximumDropFraction: 0.2,
    metadataUrl: VIENNA_METADATA_URL,
    coverage: "official-observations",
    coverageNote:
      "Official published drinking-fountain locations; availability can change seasonally.",
  },
  {
    id: "dog-runs",
    role: "amenity",
    kind: "dogRun",
    title: "Hundezonen Wien",
    layer: "HUNDEZONEOGD",
    geometryTypes: ["Point"],
    requiredProperties: ["OBJECTID", "PARK", "TYP"],
    idProperty: "OBJECTID",
    baselineCount: 438,
    minimumCount: 340,
    maximumDropFraction: 0.2,
    metadataUrl: VIENNA_METADATA_URL,
    coverage: "official-observations",
    coverageNote:
      "Official dog-zone locations; a missing nearby match is not proof that dogs are not allowed.",
  },
  {
    id: "districts",
    role: "district",
    kind: "district",
    title: "Bezirksgrenzen Wien",
    layer: "BEZIRKSGRENZEOGD",
    geometryTypes: ["Polygon", "MultiPolygon"],
    requiredProperties: ["BEZNR", "NAMEK", "FLAECHE"],
    idProperty: "BEZNR",
    baselineCount: 23,
    minimumCount: 23,
    maximumDropFraction: 0,
    metadataUrl: VIENNA_METADATA_URL,
    coverage: "official-boundaries",
    coverageNote:
      "Official district boundaries used to assign each mapped green-space centroid to a district.",
  },
];

export const CITY_CONFIG = [
  {
    id: "berlin",
    name: "Berlin",
    country: "DE",
    publisher: "Land Berlin",
    license: BERLIN_LICENSE,
    center: [13.405, 52.52],
    bounds: [13.0884, 52.3383, 13.7612, 52.6755],
    zoom: 10.4,
    coordinateBounds: [12, 51, 15, 54],
    canonicalParkId: "pitid",
    sources: BERLIN_SOURCES,
    wfs: {
      baseUrl: "https://gdi.berlin.de/services/wfs",
      version: "2.0.0",
      typeNameParameter: "typeNames",
      outputFormat: "application/json",
    },
  },
  {
    id: "vienna",
    name: "Wien",
    country: "AT",
    publisher: "Stadt Wien",
    license: VIENNA_LICENSE,
    attribution: VIENNA_LICENSE.attribution,
    center: [16.3738, 48.2082],
    bounds: [16.182, 48.117, 16.578, 48.323],
    zoom: 10.7,
    coordinateBounds: [15.8, 47.9, 16.8, 48.5],
    canonicalParkId: "wien:<OBJECTID>",
    sources: VIENNA_SOURCES,
    wfs: {
      baseUrl: "https://data.wien.gv.at/daten/geo",
      version: "1.1.0",
      typeNameParameter: "typeName",
      outputFormat: "json",
      namespace: "ogdwien:",
    },
  },
];

export function buildWfsUrl(city, source) {
  const url =
    city.id === "berlin"
      ? new URL(`${city.wfs.baseUrl}/${source.service}`)
      : new URL(city.wfs.baseUrl);
  const layer = `${city.wfs.namespace ?? ""}${source.layer}`;
  url.search = new URLSearchParams({
    service: "WFS",
    version: city.wfs.version,
    request: "GetFeature",
    [city.wfs.typeNameParameter]: layer,
    srsName: "EPSG:4326",
    outputFormat: city.wfs.outputFormat,
  }).toString();
  return url.toString();
}
