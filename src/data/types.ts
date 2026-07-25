import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";

export type LngLat = [longitude: number, latitude: number];
export type Bounds = [
  west: number,
  south: number,
  east: number,
  north: number,
];

export type AmenityKind =
  | "playground"
  | "toilet"
  | "drinkingFountain"
  | "dogRun";

export type AmenityStatus = "observed-nearby" | "not-observed";

export type AmenityCoverage =
  | "official-observations"
  | "partial-official-observations";

/**
 * `not-observed` means the build-time spatial join found no published source
 * entity within 75 m. It is deliberately not an authoritative absence claim.
 */
export interface AmenityObservation {
  status: AmenityStatus;
  count: number;
  nearestMeters: number | null;
  coverage: AmenityCoverage;
}

export type ParkAmenities = Record<AmenityKind, AmenityObservation>;

export interface ParkProperties {
  id: string;
  name: string;
  nameAddon: string | null;
  objectNumber: string | null;
  district: string;
  locality: string | null;
  type: string;
  areaM2: number;
  areaHa: number;
  designation: string | null;
  dedicated: boolean | null;
  builtYear: number | null;
  renovatedYear: number | null;
  planningAreaId: string | null;
  planningAreaName: string | null;
  centroid: LngLat;
  bounds: Bounds;
  amenities: ParkAmenities;
  sourceId: "parks";
}

export type ParkFeature = Feature<
  Polygon | MultiPolygon,
  ParkProperties
> & {
  id: string;
};

export type ParksFeatureCollection = Omit<
  FeatureCollection<Polygon | MultiPolygon, ParkProperties>,
  "features"
> & {
  schemaVersion: 1;
  generatedAt: string;
  dataAsOf: string;
  sourceId: "parks";
  features: ParkFeature[];
};

export interface ParkIndexEntry {
  id: string;
  name: string;
  nameAddon: string | null;
  district: string;
  locality: string | null;
  type: string;
  areaM2: number;
  areaHa: number;
  centroid: LngLat;
  bounds: Bounds;
  amenities: ParkAmenities;
}

export interface ParksIndex {
  schemaVersion: 1;
  generatedAt: string;
  parks: ParkIndexEntry[];
}

export interface DistrictSummary {
  name: string;
  parkCount: number;
  totalAreaM2: number;
  totalAreaHa: number;
}

export interface AmenitySummary {
  sourceFeatureCount: number;
  entityCount: number;
  parksWithObservation: number;
  coverage: AmenityCoverage;
}

export interface ParksSummary {
  schemaVersion: 1;
  city: "Berlin";
  country: "DE";
  generatedAt: string;
  dataAsOf: string;
  parkCount: number;
  sourceParkFeatureCount: number;
  totalAreaM2: number;
  totalAreaHa: number;
  districtCount: number;
  districts: DistrictSummary[];
  amenities: Record<AmenityKind, AmenitySummary>;
}

export interface DataLicense {
  id: "dl-de-zero-2.0";
  name: string;
  url: string;
}

export interface DataSource {
  id: string;
  kind: "park" | AmenityKind;
  title: string;
  publisher: "Land Berlin";
  service: string;
  layer: string;
  requestUrl: string;
  metadataUrl: string;
  schemaUrl?: string;
  geometryTypes: string[];
  featureCount: number;
  normalizedEntityCount: number;
  contentFingerprint: string;
  responseTimestamp: string | null;
  retrievedAt: string;
  dataAsOf: string | null;
  license: DataLicense;
  coverage: AmenityCoverage;
  coverageNote: string;
}

export interface SourcesManifest {
  schemaVersion: 1;
  generatedAt: string;
  upstreamFingerprint: string;
  publisher: "Land Berlin";
  license: DataLicense;
  methodology: {
    canonicalParkId: "pitid";
    coordinateReferenceSystem: "EPSG:4326";
    coordinatePrecision: number;
    polygonSimplificationToleranceMeters: number;
    amenityJoinThresholdMeters: number;
    amenityJoin: string;
    duplicateHandling: string;
    areaCalculation: string;
    absenceSemantics: string;
  };
  sources: DataSource[];
}

export interface ParkData {
  parks: ParksFeatureCollection;
  index: ParksIndex;
  summary: ParksSummary;
  sources: SourcesManifest;
}
