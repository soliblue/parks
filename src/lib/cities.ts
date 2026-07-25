import type { Coordinate } from './parks'
import type { StyleSpecification } from 'maplibre-gl'

export type CityId = 'berlin' | 'vienna'
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
  parkCount: number | null
  totalAreaM2: number | null
  districtCount: number | null
  access: ParkAccessMetric | null
}

const BKG_STYLE =
  'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json'
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
    parkCount: null,
    totalAreaM2: null,
    districtCount: null,
    access: null,
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
    parkCount: null,
    totalAreaM2: null,
    districtCount: null,
    access: null,
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
    const dataPath =
      typeof entry.dataPath === 'string'
        ? entry.dataPath.replace(/^\/+|\/+$/g, '')
        : fallback.dataPath
    const access =
      normalizeAccessMetric(metrics[fallback.id]) ??
      normalizeAccessMetric(entry.access) ??
      fallback.access

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
      parkCount: asFiniteNumber(
        entry.publicGreenSpaceCount ?? entry.parkCount,
      ),
      totalAreaM2: asFiniteNumber(entry.totalAreaM2),
      districtCount: asFiniteNumber(entry.districtCount),
      access,
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
