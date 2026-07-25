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

export const ODBL_LICENSE = {
  id: "odbl-1.0",
  name: "Open Data Commons Open Database License 1.0",
  url: "https://opendatacommons.org/licenses/odbl/1-0/",
};

export const COPENHAGEN_OPEN_DATA_TERMS = {
  id: "open-data-no-constraints-stated",
  name: "Open data (WFS states no fees or access constraints)",
  url: "https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=2.0.0&request=GetCapabilities",
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

function osmParkSource({
  title,
  downloadUrl,
  boundaryRelation,
  boundaryUrl,
  districtAdminLevels,
  districtPlaceFallback = false,
  baselineCount,
  minimumCount,
  metadataUrl = "https://www.openstreetmap.org/copyright",
}) {
  return {
    id: "parks",
    role: "park",
    kind: "park",
    fetchKind: "osm-pbf",
    title,
    publisher: "OpenStreetMap contributors",
    license: ODBL_LICENSE,
    downloadUrl,
    boundaryRelation,
    boundaryUrl,
    districtAdminLevels,
    districtPlaceFallback,
    geometryTypes: ["Polygon", "MultiPolygon"],
    requiredProperties: [
      "canonical_id",
      "name",
      "district",
      "type",
      "area_m2",
      "osm_type",
      "osm_id",
    ],
    idProperty: "canonical_id",
    baselineCount,
    minimumCount,
    maximumDropFraction: 0.35,
    metadataUrl,
    coverage: "community-mapped-observations",
    coverageNote:
      "OpenStreetMap leisure=park polygons clipped to the administrative boundary; features tagged access=no or access=private are excluded. Mapping completeness and access tags vary.",
  };
}

const OSM_AMENITY_TYPES = [
  {
    id: "playgrounds",
    kind: "playground",
    title: "playgrounds",
    note:
      "OpenStreetMap leisure=playground observations. Missing matches do not prove that no playground exists.",
  },
  {
    id: "toilets",
    kind: "toilet",
    title: "public toilets",
    note:
      "OpenStreetMap amenity=toilets observations. Access and opening information can be incomplete.",
  },
  {
    id: "drinking-fountains",
    kind: "drinkingFountain",
    title: "drinking-water points",
    note:
      "OpenStreetMap drinking-water observations. Potability and seasonal availability can change.",
  },
  {
    id: "dog-runs",
    kind: "dogRun",
    title: "dog parks",
    note:
      "OpenStreetMap leisure=dog_park observations. Missing matches do not define general dog-access rules.",
  },
];

function osmAmenitySources({
  cityName,
  downloadUrl,
  boundaryRelation,
  boundaryUrl,
  districtAdminLevels = [],
  districtPlaceFallback = false,
  allowEmptyKinds = [],
  amenityCountGuards = {},
  metadataUrl = "https://www.openstreetmap.org/copyright",
}) {
  return OSM_AMENITY_TYPES.map(({ id, kind, title, note }) => {
    const allowEmpty = allowEmptyKinds.includes(kind);
    const countGuard = amenityCountGuards[kind] ?? {};
    return {
      id,
      role: "amenity",
      kind,
      fetchKind: "osm-pbf",
      title: `OpenStreetMap ${title} — ${cityName}`,
      publisher: "OpenStreetMap contributors",
      license: ODBL_LICENSE,
      downloadUrl,
      boundaryRelation,
      boundaryUrl,
      districtAdminLevels,
      districtPlaceFallback,
      geometryTypes: ["Point", "Polygon", "MultiPolygon"],
      requiredProperties: [
        "canonical_id",
        "name",
        "type",
        "osm_type",
        "osm_id",
      ],
      idProperty: "canonical_id",
      baselineCount: countGuard.baselineCount ?? (allowEmpty ? 0 : 1),
      minimumCount: countGuard.minimumCount ?? (allowEmpty ? 0 : 1),
      maximumDropFraction: 0.5,
      metadataUrl,
      coverage: "community-mapped-observations",
      coverageNote: note,
    };
  });
}

function osmDistrictSource({
  cityName,
  downloadUrl,
  boundaryRelation,
  boundaryUrl,
  districtAdminLevels,
  districtPlaceFallback = false,
  districtCountGuard = { baselineCount: 2, minimumCount: 2 },
  metadataUrl = "https://www.openstreetmap.org/copyright",
}) {
  return {
    id: "districts",
    role: "district",
    kind: "district",
    fetchKind: "osm-pbf",
    title: districtPlaceFallback
      ? `OpenStreetMap district place labels — ${cityName}`
      : `OpenStreetMap administrative districts — ${cityName}`,
    publisher: "OpenStreetMap contributors",
    license: ODBL_LICENSE,
    downloadUrl,
    boundaryRelation,
    boundaryUrl,
    districtAdminLevels,
    districtPlaceFallback,
    geometryTypes: districtPlaceFallback
      ? ["Point", "Polygon", "MultiPolygon"]
      : ["Polygon", "MultiPolygon"],
    requiredProperties: [
      "canonical_id",
      "name",
      "admin_level",
      "osm_type",
      "osm_id",
    ],
    idProperty: "canonical_id",
    baselineCount: districtCountGuard.baselineCount,
    minimumCount: districtCountGuard.minimumCount,
    maximumDropFraction: 0.25,
    metadataUrl,
    coverage: districtPlaceFallback
      ? "community-mapped-place-labels"
      : "community-mapped-boundaries",
    coverageNote:
      districtPlaceFallback
        ? "Nearest named OpenStreetMap suburb or borough labels used because mapped administrative district polygons are unavailable."
        : "OpenStreetMap administrative boundaries used to assign each park to a meaningful city district.",
  };
}

const MUNICH_OSM = {
  cityName: "München",
  downloadUrl:
    "https://download.bbbike.org/osm/bbbike/Muenchen/Muenchen.osm.pbf",
  boundaryRelation: 62428,
  districtAdminLevels: [9, 10],
  amenityCountGuards: {
    playground: { baselineCount: 2288, minimumCount: 900 },
    toilet: { baselineCount: 426, minimumCount: 150 },
    drinkingFountain: { baselineCount: 172, minimumCount: 60 },
    dogRun: { baselineCount: 5, minimumCount: 2 },
  },
  districtCountGuard: { baselineCount: 25, minimumCount: 18 },
};
const MUNICH_SOURCES = [
  osmParkSource({
    title: "OpenStreetMap parks — München",
    ...MUNICH_OSM,
    baselineCount: 932,
    minimumCount: 600,
  }),
  ...osmAmenitySources(MUNICH_OSM),
  osmDistrictSource(MUNICH_OSM),
];

const STUTTGART_OSM = {
  cityName: "Stuttgart",
  downloadUrl:
    "https://download.bbbike.org/osm/bbbike/Stuttgart/Stuttgart.osm.pbf",
  boundaryRelation: 2793104,
  districtAdminLevels: [9, 10],
  amenityCountGuards: {
    playground: { baselineCount: 764, minimumCount: 300 },
    toilet: { baselineCount: 175, minimumCount: 60 },
    drinkingFountain: { baselineCount: 127, minimumCount: 40 },
    dogRun: { baselineCount: 9, minimumCount: 3 },
  },
  districtCountGuard: { baselineCount: 23, minimumCount: 17 },
};
const STUTTGART_SOURCES = [
  osmParkSource({
    title: "OpenStreetMap parks — Stuttgart",
    ...STUTTGART_OSM,
    baselineCount: 269,
    minimumCount: 180,
  }),
  ...osmAmenitySources(STUTTGART_OSM),
  osmDistrictSource(STUTTGART_OSM),
];

const MADRID_OSM = {
  cityName: "Madrid",
  downloadUrl:
    "https://download.bbbike.org/osm/bbbike/Madrid/Madrid.osm.pbf",
  boundaryRelation: 5326784,
  districtAdminLevels: [9, 10],
  amenityCountGuards: {
    playground: { baselineCount: 1960, minimumCount: 750 },
    toilet: { baselineCount: 303, minimumCount: 100 },
    drinkingFountain: { baselineCount: 2055, minimumCount: 750 },
    dogRun: { baselineCount: 153, minimumCount: 50 },
  },
  districtCountGuard: { baselineCount: 21, minimumCount: 15 },
};
const MADRID_SOURCES = [
  osmParkSource({
    title: "OpenStreetMap parks — Madrid",
    ...MADRID_OSM,
    baselineCount: 2114,
    minimumCount: 1300,
  }),
  ...osmAmenitySources(MADRID_OSM),
  osmDistrictSource(MADRID_OSM),
];

const BARCELONA_OSM = {
  cityName: "Barcelona",
  downloadUrl:
    "https://download.bbbike.org/osm/bbbike/Barcelona/Barcelona.osm.pbf",
  boundaryRelation: 347950,
  districtAdminLevels: [9, 10],
  amenityCountGuards: {
    playground: { baselineCount: 835, minimumCount: 300 },
    toilet: { baselineCount: 290, minimumCount: 100 },
    drinkingFountain: { baselineCount: 1838, minimumCount: 650 },
    dogRun: { baselineCount: 102, minimumCount: 30 },
  },
  districtCountGuard: { baselineCount: 10, minimumCount: 7 },
};
const BARCELONA_SOURCES = [
  osmParkSource({
    title: "OpenStreetMap parks — Barcelona",
    ...BARCELONA_OSM,
    baselineCount: 615,
    minimumCount: 375,
  }),
  ...osmAmenitySources(BARCELONA_OSM),
  osmDistrictSource(BARCELONA_OSM),
];

const CAIRO_OSM = {
  cityName: "Cairo",
  downloadUrl: "https://download.geofabrik.de/africa/egypt-latest.osm.pbf",
  boundaryRelation: 4103336,
  districtAdminLevels: [7, 8, 9, 6],
  districtPlaceFallback: true,
  allowEmptyKinds: ["dogRun"],
  amenityCountGuards: {
    playground: { baselineCount: 48, minimumCount: 15 },
    toilet: { baselineCount: 44, minimumCount: 15 },
    drinkingFountain: { baselineCount: 77, minimumCount: 25 },
    dogRun: { baselineCount: 0, minimumCount: 0 },
  },
  districtCountGuard: { baselineCount: 40, minimumCount: 30 },
  metadataUrl: "https://download.geofabrik.de/africa/egypt.html",
};
const CAIRO_SOURCES = [
  osmParkSource({
    title: "OpenStreetMap parks — Cairo",
    ...CAIRO_OSM,
    baselineCount: 395,
    minimumCount: 250,
  }),
  ...osmAmenitySources(CAIRO_OSM),
  osmDistrictSource(CAIRO_OSM),
];

const PARIS_OSM = {
  cityName: "Paris",
  downloadUrl:
    "https://download.bbbike.org/osm/bbbike/Paris/Paris.osm.pbf",
  boundaryRelation: 7444,
  amenityCountGuards: {
    playground: { baselineCount: 606, minimumCount: 200 },
    toilet: { baselineCount: 909, minimumCount: 300 },
    drinkingFountain: { baselineCount: 1079, minimumCount: 350 },
    dogRun: { baselineCount: 27, minimumCount: 8 },
  },
};
const PARIS_SOURCES = [
  {
    id: "parks",
    role: "park",
    kind: "park",
    fetchKind: "direct-geojson",
    title: "Espaces verts de Paris",
    downloadUrl:
      "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/espaces_verts/exports/geojson?lang=fr&timezone=Europe%2FParis&use_labels=false&epsg=4326&where=type_ev+%3D+%22Promenades+ouvertes%22+OR+type_ev+%3D+%22Bois%22",
    geometryTypes: ["Polygon", "MultiPolygon"],
    requiredProperties: [
      "nsq_espace_vert",
      "nom_ev",
      "type_ev",
      "categorie",
      "adresse_codepostal",
      "poly_area",
      "surface_totale_reelle",
      "id_eqpt",
    ],
    idProperty: "nsq_espace_vert",
    idProperties: ["nsq_espace_vert", "id_eqpt"],
    include: {
      property: "type_ev",
      values: ["Promenades ouvertes", "Bois"],
    },
    baselineCount: 600,
    minimumCount: 450,
    maximumDropFraction: 0.25,
    metadataUrl:
      "https://opendata.paris.fr/explore/dataset/espaces_verts/",
    coverage: "official-observations",
    coverageNote:
      "Official Ville de Paris polygons limited to open promenades and the two municipal woods.",
  },
  ...osmAmenitySources(PARIS_OSM),
];

const COPENHAGEN_OSM = {
  cityName: "København",
  downloadUrl:
    "https://download.geofabrik.de/europe/denmark-latest.osm.pbf",
  boundaryUrl:
    "https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=k101%3Akommunegraense&outputFormat=json&SRSNAME=EPSG%3A4326&CQL_FILTER=kommunekode%3D%270101%27",
  amenityCountGuards: {
    playground: { baselineCount: 524, minimumCount: 180 },
    toilet: { baselineCount: 243, minimumCount: 80 },
    drinkingFountain: { baselineCount: 95, minimumCount: 30 },
    dogRun: { baselineCount: 51, minimumCount: 15 },
  },
  metadataUrl: "https://download.geofabrik.de/europe/denmark.html",
};
const COPENHAGEN_SOURCES = [
  {
    id: "parks",
    role: "park",
    kind: "park",
    fetchKind: "direct-geojson",
    title: "Parkregister København",
    downloadUrl:
      "https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=k101:parkregister&outputFormat=json&SRSNAME=EPSG:4326",
    geometryTypes: ["Polygon", "MultiPolygon"],
    requiredProperties: [
      "areal_id",
      "navn_parker",
      "navn_arealer",
      "bydelsnavn",
      "parktype",
      "areal",
    ],
    idProperty: "areal_id",
    include: {
      property: "parktype",
      values: [
        "Andet grønt område",
        "Lokale parker",
        "Haveanlæg",
        "Regionale parker",
        "Naturområder",
      ],
    },
    baselineCount: 293,
    minimumCount: 220,
    maximumDropFraction: 0.25,
    metadataUrl:
      "https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=2.0.0&request=GetCapabilities",
    coverage: "official-observations",
    coverageNote:
      "Official Copenhagen park register, limited to the five mapped public green-space classes used by this explorer.",
  },
  ...osmAmenitySources(COPENHAGEN_OSM),
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
  {
    id: "munich",
    name: "München",
    country: "DE",
    publisher: "OpenStreetMap contributors",
    license: ODBL_LICENSE,
    attribution: "© OpenStreetMap contributors",
    center: [11.5754, 48.1371],
    bounds: [11.360777, 48.0616244, 11.7229099, 48.2481162],
    zoom: 10.7,
    coordinateBounds: [11.2, 47.9, 11.9, 48.4],
    canonicalParkId: "munich:osm:<way|relation>:<id>",
    parkFields: {
      idPrefix: "",
      idProperty: "canonical_id",
      nameProperties: ["name"],
      nameAddonProperties: [],
      districtProperties: ["district"],
      typeProperties: ["type"],
      areaProperties: ["area_m2"],
      defaultDistrict: "München",
      defaultType: "Park",
      fallbackName: "Unbenannter Park",
    },
    sources: MUNICH_SOURCES,
  },
  {
    id: "stuttgart",
    name: "Stuttgart",
    country: "DE",
    publisher: "OpenStreetMap contributors",
    license: ODBL_LICENSE,
    attribution: "© OpenStreetMap contributors",
    center: [9.18, 48.7784],
    bounds: [9.0386007, 48.6920188, 9.3160228, 48.8663994],
    zoom: 10.7,
    coordinateBounds: [8.8, 48.5, 9.6, 49.1],
    canonicalParkId: "stuttgart:osm:<way|relation>:<id>",
    parkFields: {
      idPrefix: "",
      idProperty: "canonical_id",
      nameProperties: ["name"],
      nameAddonProperties: [],
      districtProperties: ["district"],
      typeProperties: ["type"],
      areaProperties: ["area_m2"],
      defaultDistrict: "Stuttgart",
      defaultType: "Park",
      fallbackName: "Unbenannter Park",
    },
    sources: STUTTGART_SOURCES,
  },
  {
    id: "madrid",
    name: "Madrid",
    country: "ES",
    publisher: "OpenStreetMap contributors",
    license: ODBL_LICENSE,
    attribution: "© OpenStreetMap contributors",
    center: [-3.7038, 40.4168],
    bounds: [-3.889, 40.322, -3.551, 40.644],
    zoom: 10.4,
    coordinateBounds: [-4.1, 40.1, -3.3, 40.8],
    canonicalParkId: "madrid:osm:<way|relation>:<id>",
    parkFields: {
      idPrefix: "",
      idProperty: "canonical_id",
      nameProperties: ["name"],
      nameAddonProperties: [],
      districtProperties: ["district"],
      typeProperties: ["type"],
      areaProperties: ["area_m2"],
      defaultDistrict: "Madrid",
      defaultType: "Parque",
      fallbackName: "Parque sin nombre",
    },
    sources: MADRID_SOURCES,
  },
  {
    id: "barcelona",
    name: "Barcelona",
    country: "ES",
    publisher: "OpenStreetMap contributors",
    license: ODBL_LICENSE,
    attribution: "© OpenStreetMap contributors",
    center: [2.1734, 41.3851],
    bounds: [2.1018188, 41.3259342, 2.2288666, 41.466408],
    zoom: 11,
    coordinateBounds: [1.9, 41.2, 2.4, 41.6],
    canonicalParkId: "barcelona:osm:<way|relation>:<id>",
    parkFields: {
      idPrefix: "",
      idProperty: "canonical_id",
      nameProperties: ["name"],
      nameAddonProperties: [],
      districtProperties: ["district"],
      typeProperties: ["type"],
      areaProperties: ["area_m2"],
      defaultDistrict: "Barcelona",
      defaultType: "Parc",
      fallbackName: "Parc sense nom",
    },
    sources: BARCELONA_SOURCES,
  },
  {
    id: "cairo",
    name: "Kairo",
    country: "EG",
    publisher: "OpenStreetMap contributors",
    license: ODBL_LICENSE,
    attribution: "© OpenStreetMap contributors",
    center: [31.2357, 30.0444],
    bounds: [31.214555, 29.7483062, 31.9090054, 30.3209168],
    zoom: 9.6,
    coordinateBounds: [31, 29.5, 32.1, 30.55],
    canonicalParkId: "cairo:osm:<way|relation>:<id>",
    parkFields: {
      idPrefix: "",
      idProperty: "canonical_id",
      nameProperties: ["name"],
      nameAddonProperties: [],
      districtProperties: ["district"],
      typeProperties: ["type"],
      areaProperties: ["area_m2"],
      defaultDistrict: "Cairo",
      defaultType: "Park",
      fallbackName: "Unbenannter Park",
    },
    sources: CAIRO_SOURCES,
  },
  {
    id: "paris",
    name: "Paris",
    country: "FR",
    publisher: "Ville de Paris",
    license: ODBL_LICENSE,
    attribution: "Données : Ville de Paris",
    center: [2.3522, 48.8566],
    bounds: [2.2240866594, 48.8166532343, 2.4697628538, 48.9012965318],
    zoom: 10.8,
    coordinateBounds: [2.1, 48.7, 2.6, 49],
    canonicalParkId: "paris:<nsq_espace_vert|id_eqpt>",
    parkFields: {
      idPrefix: "paris:",
      idProperty: "nsq_espace_vert",
      nameProperties: ["nom_ev"],
      nameAddonProperties: ["categorie"],
      districtProperties: ["adresse_codepostal"],
      typeProperties: ["type_ev", "categorie"],
      areaProperties: ["surface_totale_reelle", "poly_area"],
      defaultDistrict: "Paris",
      defaultType: "Espace vert",
      fallbackName: "Espace vert sans nom",
    },
    sources: PARIS_SOURCES,
  },
  {
    id: "copenhagen",
    name: "Kopenhagen",
    country: "DK",
    publisher: "Københavns Kommune",
    license: COPENHAGEN_OPEN_DATA_TERMS,
    attribution: "Data: Københavns Kommune – Københavnerkort",
    center: [12.5683, 55.6761],
    bounds: [12.45304564, 55.61284311, 12.73425297, 55.73271153],
    zoom: 10.7,
    coordinateBounds: [12.3, 55.5, 12.9, 55.85],
    canonicalParkId: "copenhagen:<areal_id>",
    parkFields: {
      idPrefix: "copenhagen:",
      idProperty: "areal_id",
      nameProperties: ["navn_parker", "navn_arealer"],
      nameAddonProperties: [],
      districtProperties: ["bydelsnavn"],
      typeProperties: ["parktype"],
      areaProperties: ["areal"],
      defaultDistrict: "København",
      defaultType: "Grønt område",
      fallbackName: "Grønt område uden navn",
    },
    sources: COPENHAGEN_SOURCES,
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

export function buildSourceUrl(city, source) {
  if (source.fetchKind === "direct-geojson") {
    return source.downloadUrl;
  }
  if (source.fetchKind === "osm-pbf") {
    throw new Error(
      `${city.id}/${source.id}: OSM PBF sources must use the PBF extraction path`,
    );
  }
  return buildWfsUrl(city, source);
}
