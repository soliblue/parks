export const DATA_SCHEMA_VERSION = 1;
export const JOIN_THRESHOLD_METERS = 75;
export const SIMPLIFY_TOLERANCE_METERS = 2.5;
export const COORDINATE_PRECISION = 8;

export const LICENSE = {
  id: "dl-de-zero-2.0",
  name: "Datenlizenz Deutschland – Zero – Version 2.0",
  url: "https://www.govdata.de/dl-de/zero-2-0",
};

export const SOURCE_CONFIG = [
  {
    id: "parks",
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

export function buildWfsUrl(source) {
  const url = new URL(
    `https://gdi.berlin.de/services/wfs/${source.service}`,
  );
  url.search = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeNames: source.layer,
    srsName: "EPSG:4326",
    outputFormat: "application/json",
  }).toString();
  return url.toString();
}
