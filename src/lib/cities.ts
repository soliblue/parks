import type { AmenityKey, Coordinate } from './parks'
import type { StyleSpecification } from 'maplibre-gl'

export type CityId =
  | 'berlin'
  | 'vienna'
  | 'munich'
  | 'stuttgart'
  | 'madrid'
  | 'barcelona'
  | 'paris'
  | 'copenhagen'
  | 'cairo'
export type CityBounds = [number, number, number, number]

export interface ParkAccessMetric {
  sharePercent: number
  populationWithinThreshold: number
  populationTotal: number
  populationYear: number
  thresholdMinutes: number
  thresholdMeters: number
  method: 'walking-network' | 'straight-line'
  generatedAt: string | null
  note: string
}

export interface GreenSpaceMetric {
  areaM2: number
  cityAreaM2: number
  sharePercent: number
  m2PerResident: number
  definitionVersion: string
}

export interface TreeCoverMetric {
  sharePercent: number
  observationYear: number
  resolutionMeters: number
  denominator: string
}

export interface CityConfig {
  id: CityId
  name: string
  country: string
  center: Coordinate
  bounds: CityBounds
  zoom: number
  dataPath: string
  basemapStyle: string | StyleSpecification
  mapSourceLabel: string
  mapSourceUrl: string
  mapAttribution: string
  dataSourceLabel: string
  dataSourceUrl: string
  licenseLabel: string
  licenseUrl: string
  dataAttribution: string
  amenitySourceLabel?: string
  amenitySourceUrl?: string
  amenityLicenseLabel?: string
  amenityLicenseUrl?: string
  amenityAttribution?: string
  districtLabel?: string
  districtNote?: string
  availableAmenities: AmenityKey[]
  parkCount: number | null
  totalAreaM2: number | null
  districtCount: number | null
  access: ParkAccessMetric | null
  greenSpace: GreenSpaceMetric | null
  treeCover: TreeCoverMetric | null
}

const BKG_STYLE =
  'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json'
const OPEN_FREE_MAP_STYLE =
  'https://tiles.openfreemap.org/styles/positron'
const ALL_AMENITIES: AmenityKey[] = [
  'playground',
  'drinkingFountain',
  'toilet',
  'dogRun',
]
const VIENNA_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'basemap-at': {
      type: 'raster',
      tiles: [
        'https://mapsneu.wien.gv.at/basemap/bmapgrau/normal/google3857/{z}/{y}/{x}.png',
      ],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution: '© basemap.at',
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#f6f7f6' },
    },
    {
      id: 'basemap-at',
      type: 'raster',
      source: 'basemap-at',
      paint: {
        'raster-opacity': 0.72,
        'raster-saturation': -0.22,
        'raster-contrast': -0.08,
      },
    },
  ],
}

export const DEFAULT_CITIES: readonly CityConfig[] = [
  {
    id: 'berlin',
    name: 'Berlin',
    country: 'Deutschland',
    center: [13.405, 52.52],
    bounds: [13.0884, 52.3383, 13.7612, 52.6755],
    zoom: 10.4,
    dataPath: 'data/berlin',
    basemapStyle: BKG_STYLE,
    mapSourceLabel: 'basemap.de',
    mapSourceUrl: 'https://basemap.de/',
    mapAttribution:
      '© GeoBasis-DE / BKG 2026 · CC BY 4.0 · Darstellung verändert',
    dataSourceLabel: 'Land Berlin',
    dataSourceUrl:
      'https://daten.berlin.de/datensaetze/grunanlagenbestand-berlin-einschliesslich-der-offentlichen-spielplatze-wfs-737fd0a4',
    licenseLabel: 'dl-de/zero-2.0',
    licenseUrl: 'https://www.govdata.de/dl-de/zero-2-0',
    dataAttribution: 'Datenquelle: Land Berlin',
    availableAmenities: [...ALL_AMENITIES],
    parkCount: null,
    totalAreaM2: null,
    districtCount: null,
    access: null,
    greenSpace: null,
    treeCover: null,
  },
  {
    id: 'vienna',
    name: 'Wien',
    country: 'Österreich',
    center: [16.3738, 48.2082],
    bounds: [16.182, 48.117, 16.578, 48.323],
    zoom: 10.7,
    dataPath: 'data/vienna',
    basemapStyle: VIENNA_STYLE,
    mapSourceLabel: 'basemap.at',
    mapSourceUrl: 'https://basemap.at/',
    mapAttribution: '© basemap.at · CC BY 4.0',
    dataSourceLabel: 'Stadt Wien',
    dataSourceUrl:
      'https://www.data.gv.at/datasets/d0145df8-7f6d-46e1-9bc6-ee7897054104?locale=de',
    licenseLabel: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    dataAttribution: 'Datenquelle: Stadt Wien – data.wien.gv.at',
    availableAmenities: [...ALL_AMENITIES],
    parkCount: null,
    totalAreaM2: null,
    districtCount: null,
    access: null,
    greenSpace: null,
    treeCover: null,
  },
  {
    id: 'munich',
    name: 'München',
    country: 'Deutschland',
    center: [11.5754, 48.1371],
    bounds: [11.360777, 48.0616244, 11.7229099, 48.2481162],
    zoom: 10.7,
    dataPath: 'data/munich',
    basemapStyle: BKG_STYLE,
    mapSourceLabel: 'basemap.de',
    mapSourceUrl: 'https://basemap.de/',
    mapAttribution:
      '© GeoBasis-DE / BKG 2026 · CC BY 4.0 · Darstellung verändert',
    dataSourceLabel: 'OpenStreetMap',
    dataSourceUrl: 'https://www.openstreetmap.org/copyright',
    licenseLabel: 'ODbL 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    dataAttribution: '© OpenStreetMap-Mitwirkende',
    availableAmenities: [...ALL_AMENITIES],
    parkCount: null,
    totalAreaM2: null,
    districtCount: null,
    access: null,
    greenSpace: null,
    treeCover: null,
  },
  {
    id: 'stuttgart',
    name: 'Stuttgart',
    country: 'Deutschland',
    center: [9.18, 48.7784],
    bounds: [9.0386007, 48.6920188, 9.3160228, 48.8663994],
    zoom: 10.7,
    dataPath: 'data/stuttgart',
    basemapStyle: BKG_STYLE,
    mapSourceLabel: 'basemap.de',
    mapSourceUrl: 'https://basemap.de/',
    mapAttribution:
      '© GeoBasis-DE / BKG 2026 · CC BY 4.0 · Darstellung verändert',
    dataSourceLabel: 'OpenStreetMap',
    dataSourceUrl: 'https://www.openstreetmap.org/copyright',
    licenseLabel: 'ODbL 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    dataAttribution: '© OpenStreetMap-Mitwirkende',
    availableAmenities: [...ALL_AMENITIES],
    parkCount: null,
    totalAreaM2: null,
    districtCount: null,
    access: null,
    greenSpace: null,
    treeCover: null,
  },
  {
    id: 'madrid',
    name: 'Madrid',
    country: 'Spanien',
    center: [-3.7038, 40.4168],
    bounds: [-3.889, 40.322, -3.551, 40.644],
    zoom: 10.4,
    dataPath: 'data/madrid',
    basemapStyle: OPEN_FREE_MAP_STYLE,
    mapSourceLabel: 'OpenFreeMap',
    mapSourceUrl: 'https://openfreemap.org/',
    mapAttribution:
      'OpenFreeMap · © OpenMapTiles · © OpenStreetMap-Mitwirkende',
    dataSourceLabel: 'OpenStreetMap',
    dataSourceUrl: 'https://www.openstreetmap.org/copyright',
    licenseLabel: 'ODbL 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    dataAttribution: '© OpenStreetMap-Mitwirkende',
    availableAmenities: [...ALL_AMENITIES],
    parkCount: null,
    totalAreaM2: null,
    districtCount: null,
    access: null,
    greenSpace: null,
    treeCover: null,
  },
  {
    id: 'barcelona',
    name: 'Barcelona',
    country: 'Spanien',
    center: [2.1734, 41.3851],
    bounds: [2.1018188, 41.3259342, 2.2288666, 41.466408],
    zoom: 10.7,
    dataPath: 'data/barcelona',
    basemapStyle: OPEN_FREE_MAP_STYLE,
    mapSourceLabel: 'OpenFreeMap',
    mapSourceUrl: 'https://openfreemap.org/',
    mapAttribution:
      'OpenFreeMap · © OpenMapTiles · © OpenStreetMap-Mitwirkende',
    dataSourceLabel: 'OpenStreetMap',
    dataSourceUrl: 'https://www.openstreetmap.org/copyright',
    licenseLabel: 'ODbL 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    dataAttribution: '© OpenStreetMap-Mitwirkende',
    availableAmenities: [...ALL_AMENITIES],
    parkCount: null,
    totalAreaM2: null,
    districtCount: null,
    access: null,
    greenSpace: null,
    treeCover: null,
  },
  {
    id: 'paris',
    name: 'Paris',
    country: 'Frankreich',
    center: [2.3522, 48.8566],
    bounds: [2.2240867, 48.8166532, 2.4697629, 48.9012965],
    zoom: 10.7,
    dataPath: 'data/paris',
    basemapStyle: OPEN_FREE_MAP_STYLE,
    mapSourceLabel: 'OpenFreeMap',
    mapSourceUrl: 'https://openfreemap.org/',
    mapAttribution:
      'OpenFreeMap · © OpenMapTiles · © OpenStreetMap-Mitwirkende',
    dataSourceLabel: 'Ville de Paris',
    dataSourceUrl:
      'https://opendata.paris.fr/explore/dataset/espaces_verts/',
    licenseLabel: 'ODbL 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    dataAttribution: 'Datenquelle: Ville de Paris – espaces_verts',
    amenitySourceLabel: 'OpenStreetMap',
    amenitySourceUrl: 'https://www.openstreetmap.org/copyright',
    amenityLicenseLabel: 'ODbL 1.0',
    amenityLicenseUrl:
      'https://opendatacommons.org/licenses/odbl/1-0/',
    amenityAttribution: '© OpenStreetMap-Mitwirkende',
    availableAmenities: [...ALL_AMENITIES],
    parkCount: null,
    totalAreaM2: null,
    districtCount: null,
    access: null,
    greenSpace: null,
    treeCover: null,
  },
  {
    id: 'copenhagen',
    name: 'Kopenhagen',
    country: 'Dänemark',
    center: [12.5683, 55.6761],
    bounds: [12.45304564, 55.61284311, 12.73425297, 55.73271153],
    zoom: 10.7,
    dataPath: 'data/copenhagen',
    basemapStyle: OPEN_FREE_MAP_STYLE,
    mapSourceLabel: 'OpenFreeMap',
    mapSourceUrl: 'https://openfreemap.org/',
    mapAttribution:
      'OpenFreeMap · © OpenMapTiles · © OpenStreetMap-Mitwirkende',
    dataSourceLabel: 'Københavns Kommune',
    dataSourceUrl:
      'https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=2.0.0&request=GetCapabilities',
    licenseLabel: 'Offene WFS-Nutzung',
    licenseUrl:
      'https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=2.0.0&request=GetCapabilities',
    dataAttribution:
      'Datenquelle: Københavns Kommune – Københavnerkort',
    amenitySourceLabel: 'OpenStreetMap',
    amenitySourceUrl: 'https://www.openstreetmap.org/copyright',
    amenityLicenseLabel: 'ODbL 1.0',
    amenityLicenseUrl:
      'https://opendatacommons.org/licenses/odbl/1-0/',
    amenityAttribution: '© OpenStreetMap-Mitwirkende',
    availableAmenities: [...ALL_AMENITIES],
    parkCount: null,
    totalAreaM2: null,
    districtCount: null,
    access: null,
    greenSpace: null,
    treeCover: null,
  },
  {
    id: 'cairo',
    name: 'Kairo',
    country: 'Ägypten',
    center: [31.2357, 30.0444],
    bounds: [31.214555, 29.7483062, 31.9090054, 30.3209168],
    zoom: 9.6,
    dataPath: 'data/cairo',
    basemapStyle: OPEN_FREE_MAP_STYLE,
    mapSourceLabel: 'OpenFreeMap',
    mapSourceUrl: 'https://openfreemap.org/',
    mapAttribution:
      'OpenFreeMap · © OpenMapTiles · © OpenStreetMap-Mitwirkende',
    dataSourceLabel: 'OpenStreetMap',
    dataSourceUrl: 'https://www.openstreetmap.org/copyright',
    licenseLabel: 'ODbL 1.0',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    dataAttribution: '© OpenStreetMap-Mitwirkende',
    districtLabel: 'Stadtteil-Gruppen',
    districtNote:
      'Die Kairo-Gruppen sind eine OSM-Näherung über die nächstgelegenen benannten Stadtteile, keine einheitlichen amtlichen Bezirke.',
    availableAmenities: [...ALL_AMENITIES],
    parkCount: null,
    totalAreaM2: null,
    districtCount: null,
    access: null,
    greenSpace: null,
    treeCover: null,
  },
] as const

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const asCoordinate = (
  value: unknown,
  fallback: Coordinate,
): Coordinate => {
  if (!Array.isArray(value) || value.length < 2) return fallback
  const longitude = asFiniteNumber(value[0])
  const latitude = asFiniteNumber(value[1])
  return longitude === null || latitude === null
    ? fallback
    : [longitude, latitude]
}

const asBounds = (value: unknown, fallback: CityBounds): CityBounds => {
  if (!Array.isArray(value) || value.length < 4) return fallback
  const parsed = value.slice(0, 4).map(asFiniteNumber)
  return parsed.every((item): item is number => item !== null)
    ? [parsed[0], parsed[1], parsed[2], parsed[3]]
    : fallback
}

const asAmenityKeys = (
  value: unknown,
  fallback: AmenityKey[],
): AmenityKey[] => {
  if (!Array.isArray(value)) return fallback
  return value.filter(
    (item): item is AmenityKey =>
      item === 'playground' ||
      item === 'drinkingFountain' ||
      item === 'toilet' ||
      item === 'dogRun',
  )
}

const normalizeAccessMetric = (value: unknown): ParkAccessMetric | null => {
  const metric = asRecord(value)
  const sharePercent = asFiniteNumber(
    metric.sharePercent ?? metric.percent ?? metric.populationSharePercent,
  )
  const populationWithinThreshold = asFiniteNumber(
    metric.populationWithinThreshold ?? metric.numeratorPopulation,
  )
  const populationTotal = asFiniteNumber(
    metric.populationTotal ?? metric.denominatorPopulation,
  )
  const populationYear = asFiniteNumber(metric.populationYear)
  const thresholdMinutes = asFiniteNumber(metric.thresholdMinutes) ?? 10
  const thresholdMeters = asFiniteNumber(metric.thresholdMeters) ?? 805
  if (
    sharePercent === null ||
    populationWithinThreshold === null ||
    populationTotal === null ||
    populationYear === null
  ) {
    return null
  }

  return {
    sharePercent,
    populationWithinThreshold,
    populationTotal,
    populationYear,
    thresholdMinutes,
    thresholdMeters,
    method:
      metric.method === 'straight-line'
        ? 'straight-line'
        : 'walking-network',
    generatedAt:
      typeof metric.generatedAt === 'string' ? metric.generatedAt : null,
    note: typeof metric.note === 'string' ? metric.note : '',
  }
}

const normalizeGreenSpaceMetric = (
  value: unknown,
): GreenSpaceMetric | null => {
  const metric = asRecord(value)
  const areaM2 = asFiniteNumber(metric.areaM2)
  const cityAreaM2 = asFiniteNumber(metric.cityAreaM2)
  const sharePercent = asFiniteNumber(metric.sharePercent)
  const m2PerResident = asFiniteNumber(metric.m2PerResident)
  const definitionVersion =
    typeof metric.definitionVersion === 'string'
      ? metric.definitionVersion.trim()
      : typeof metric.definitionVersion === 'number' &&
          Number.isInteger(metric.definitionVersion)
        ? String(metric.definitionVersion)
        : ''

  if (
    areaM2 === null ||
    areaM2 < 0 ||
    cityAreaM2 === null ||
    cityAreaM2 <= 0 ||
    areaM2 > cityAreaM2 ||
    sharePercent === null ||
    sharePercent < 0 ||
    sharePercent > 100 ||
    m2PerResident === null ||
    m2PerResident < 0 ||
    !definitionVersion
  ) {
    return null
  }

  return {
    areaM2,
    cityAreaM2,
    sharePercent,
    m2PerResident,
    definitionVersion,
  }
}

const normalizeTreeCoverMetric = (
  value: unknown,
): TreeCoverMetric | null => {
  const metric = asRecord(value)
  const sharePercent = asFiniteNumber(metric.sharePercent)
  const observationYear = asFiniteNumber(metric.observationYear)
  const resolutionMeters = asFiniteNumber(metric.resolutionMeters)
  const denominator =
    typeof metric.denominator === 'string' ? metric.denominator.trim() : ''

  if (
    sharePercent === null ||
    sharePercent < 0 ||
    sharePercent > 100 ||
    observationYear === null ||
    !Number.isInteger(observationYear) ||
    observationYear < 1900 ||
    observationYear > 3000 ||
    resolutionMeters === null ||
    resolutionMeters <= 0 ||
    !denominator
  ) {
    return null
  }

  return {
    sharePercent,
    observationYear,
    resolutionMeters,
    denominator,
  }
}

const accessByCity = (value: unknown): Record<string, unknown> => {
  const document = asRecord(value)
  const cities = asRecord(document.cities)
  return Object.keys(cities).length > 0 ? cities : document
}

export const normalizeCities = (
  manifestValue: unknown,
  accessValue?: unknown,
): CityConfig[] => {
  const manifest = asRecord(manifestValue)
  const entries = Array.isArray(manifest.cities) ? manifest.cities : []
  const manifestById = new Map(
    entries.map((entry) => {
      const record = asRecord(entry)
      return [String(record.id ?? ''), record] as const
    }),
  )
  const metrics = accessByCity(accessValue)

  return DEFAULT_CITIES.map((fallback) => {
    const entry = manifestById.get(fallback.id) ?? {}
    const cityMetrics = asRecord(metrics[fallback.id])
    const dataPath =
      typeof entry.dataPath === 'string'
        ? entry.dataPath.replace(/^\/+|\/+$/g, '')
        : fallback.dataPath
    const access =
      normalizeAccessMetric(cityMetrics) ??
      normalizeAccessMetric(entry.access) ??
      fallback.access
    const greenSpace =
      normalizeGreenSpaceMetric(cityMetrics.greenSpace) ??
      normalizeGreenSpaceMetric(entry.greenSpace) ??
      fallback.greenSpace
    const treeCover =
      normalizeTreeCoverMetric(cityMetrics.treeCover) ??
      normalizeTreeCoverMetric(entry.treeCover) ??
      fallback.treeCover

    return {
      ...fallback,
      name:
        typeof entry.name === 'string' && entry.name.trim()
          ? entry.name.trim()
          : fallback.name,
      country:
        typeof entry.countryName === 'string' && entry.countryName.trim()
          ? entry.countryName.trim()
          : fallback.country,
      center: asCoordinate(entry.center, fallback.center),
      bounds: asBounds(entry.bounds, fallback.bounds),
      zoom: asFiniteNumber(entry.zoom) ?? fallback.zoom,
      dataPath,
      availableAmenities: asAmenityKeys(
        entry.availableAmenities,
        fallback.availableAmenities,
      ),
      parkCount: asFiniteNumber(
        entry.publicGreenSpaceCount ?? entry.parkCount,
      ),
      totalAreaM2: asFiniteNumber(entry.totalAreaM2),
      districtCount: asFiniteNumber(entry.districtCount),
      access,
      greenSpace,
      treeCover,
    }
  })
}

export const isCityId = (value: unknown): value is CityId =>
  DEFAULT_CITIES.some((city) => city.id === value)

export const cityById = (
  cities: readonly CityConfig[],
  cityId: CityId,
): CityConfig =>
  cities.find((city) => city.id === cityId) ??
  DEFAULT_CITIES.find((city) => city.id === cityId) ??
  DEFAULT_CITIES[0]
