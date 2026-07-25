import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import centroid from '@turf/centroid'
import distance from '@turf/distance'
import { point } from '@turf/helpers'
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
  Position,
} from 'geojson'

export type Coordinate = [number, number]

export const WALK_BANDS = [
  { minutes: 5, distanceKm: 0.35 },
  { minutes: 10, distanceKm: 0.7 },
  { minutes: 15, distanceKm: 1.05 },
] as const

export type WalkBandMinutes = (typeof WALK_BANDS)[number]['minutes']
export type ParkIdsByWalkBand = Record<WalkBandMinutes, string[]>

export type AmenityKey =
  | 'playground'
  | 'drinkingFountain'
  | 'toilet'
  | 'dogRun'

export interface ParkAmenities {
  playground: boolean
  drinkingFountain: boolean
  toilet: boolean
  dogRun: boolean
}

export interface Park {
  id: string
  name: string
  nameAddon: string
  district: string
  locality: string
  type: string
  areaM2: number
  centroid: Coordinate
  bounds: [number, number, number, number]
  dedicated: boolean
  amenities: ParkAmenities
  geometry: Geometry | null
}

export interface ParkSummary {
  parkCount: number
  totalAreaM2: number
  districtCount: number
  generatedAt: string | null
  sourceUpdatedAt: string | null
}

export interface NearbyPark extends Park {
  distanceKm: number | null
  estimatedMinutes: number | null
  nearestCoordinate: Coordinate
}

export type ParksGeoJson = FeatureCollection<Geometry, GeoJsonProperties>

export interface ParkData {
  parks: Park[]
  geojson: ParksGeoJson
  summary: ParkSummary
}

const FALLBACK_SUMMARY: ParkSummary = {
  parkCount: 0,
  totalAreaM2: 0,
  districtCount: 0,
  generatedAt: null,
  sourceUpdatedAt: null,
}

const EMPTY_AMENITIES: ParkAmenities = {
  playground: false,
  drinkingFountain: false,
  toilet: false,
  dogRun: false,
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}

const asString = (...values: unknown[]): string => {
  const found = values.find(
    (value) => typeof value === 'string' && value.trim().length > 0,
  )
  return typeof found === 'string' ? found.trim() : ''
}

const asFiniteNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Number(value.replace(',', '.'))
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

const asCoordinate = (value: unknown): Coordinate | null => {
  if (!Array.isArray(value) || value.length < 2) return null
  const longitude = asFiniteNumber(value[0])
  const latitude = asFiniteNumber(value[1])
  if (longitude === null || latitude === null) return null
  return [longitude, latitude]
}

const asBounds = (
  value: unknown,
  fallback: Coordinate,
): [number, number, number, number] => {
  if (Array.isArray(value) && value.length >= 4) {
    const parsed = value.slice(0, 4).map((item) => asFiniteNumber(item))
    if (parsed.every((item): item is number => item !== null)) {
      return [parsed[0], parsed[1], parsed[2], parsed[3]]
    }
  }
  return [fallback[0], fallback[1], fallback[0], fallback[1]]
}

const asOptionalBounds = (
  value: unknown,
): [number, number, number, number] | null => {
  if (!Array.isArray(value) || value.length < 4) return null
  const parsed = value.slice(0, 4).map((item) => asFiniteNumber(item))
  if (!parsed.every((item): item is number => item !== null)) return null
  return [parsed[0], parsed[1], parsed[2], parsed[3]]
}

const amenityObserved = (value: unknown): boolean => {
  if (value === true) return true
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') {
    return ['true', 'yes', 'inside', 'nearby', 'vorhanden'].includes(
      value.toLocaleLowerCase('de-DE'),
    )
  }

  const record = asRecord(value)
  const status =
    typeof record.status === 'string'
      ? record.status.toLocaleLowerCase('de-DE')
      : ''
  return (
    record.observed === true ||
    (typeof record.count === 'number' && record.count > 0) ||
    record.inside === true ||
    record.nearby === true ||
    status === 'inside' ||
    status === 'nearby' ||
    status.startsWith('observed-')
  )
}

const normalizeAmenities = (value: unknown): ParkAmenities => {
  if (Array.isArray(value)) {
    const names = new Set(value.map((item) => String(item)))
    return {
      playground: names.has('playground'),
      drinkingFountain:
        names.has('drinkingFountain') ||
        names.has('drinkingWater') ||
        names.has('drinking_water'),
      toilet: names.has('toilet'),
      dogRun:
        names.has('dogRun') ||
        names.has('dogArea') ||
        names.has('dog_area'),
    }
  }

  const amenities = asRecord(value)
  return {
    playground: amenityObserved(
      amenities.playground ?? amenities.playgrounds ?? amenities.spielplatz,
    ),
    drinkingFountain: amenityObserved(
      amenities.drinkingFountain ??
        amenities.drinkingWater ??
        amenities.drinking_water ??
        amenities.trinkbrunnen,
    ),
    toilet: amenityObserved(
      amenities.toilet ?? amenities.toilets ?? amenities.wc,
    ),
    dogRun: amenityObserved(
      amenities.dogRun ??
        amenities.dogArea ??
        amenities.dog_area ??
        amenities.hundeauslauf,
    ),
  }
}

const coordinatesFromGeometry = (geometry: Geometry): Coordinate => {
  try {
    const center = centroid({
      type: 'Feature',
      properties: {},
      geometry,
    }).geometry.coordinates
    return [center[0], center[1]]
  } catch {
    return [13.405, 52.52]
  }
}

const extendBounds = (
  coordinates: Position | Position[] | Position[][] | Position[][][],
  bounds: [number, number, number, number],
) => {
  if (
    Array.isArray(coordinates) &&
    typeof coordinates[0] === 'number' &&
    typeof coordinates[1] === 'number'
  ) {
    const coordinate = coordinates as Position
    bounds[0] = Math.min(bounds[0], coordinate[0])
    bounds[1] = Math.min(bounds[1], coordinate[1])
    bounds[2] = Math.max(bounds[2], coordinate[0])
    bounds[3] = Math.max(bounds[3], coordinate[1])
    return
  }

  for (const child of coordinates as Position[][] | Position[][][]) {
    extendBounds(child, bounds)
  }
}

const boundsFromGeometry = (
  geometry: Geometry,
  fallback: Coordinate,
): [number, number, number, number] => {
  if (geometry.type === 'GeometryCollection') {
    const bounds: [number, number, number, number] = [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]
    for (const child of geometry.geometries) {
      const childBounds = boundsFromGeometry(child, fallback)
      bounds[0] = Math.min(bounds[0], childBounds[0])
      bounds[1] = Math.min(bounds[1], childBounds[1])
      bounds[2] = Math.max(bounds[2], childBounds[2])
      bounds[3] = Math.max(bounds[3], childBounds[3])
    }
    return Number.isFinite(bounds[0])
      ? bounds
      : [fallback[0], fallback[1], fallback[0], fallback[1]]
  }

  const bounds: [number, number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]
  extendBounds(geometry.coordinates, bounds)
  return Number.isFinite(bounds[0])
    ? bounds
    : [fallback[0], fallback[1], fallback[0], fallback[1]]
}

const normalizePark = (
  value: unknown,
  feature?: Feature<Geometry, GeoJsonProperties>,
): Park | null => {
  const record = asRecord(value)
  const properties = asRecord(feature?.properties)
  const id = asString(
    record.id,
    record.PITID,
    record.pitid,
    properties.id,
    properties.PITID,
    properties.pitid,
    feature?.id,
  )
  if (!id) return null

  const center =
    asCoordinate(record.centroid) ??
    asCoordinate(properties.centroid) ??
    (feature
      ? coordinatesFromGeometry(feature.geometry)
      : ([13.405, 52.52] as Coordinate))
  const explicitBounds =
    asOptionalBounds(record.bounds) ?? asOptionalBounds(properties.bounds)
  const rawArea =
    asFiniteNumber(
      record.areaM2,
      record.areaSqm,
      record.area_sqm,
      properties.areaM2,
      properties.areaSqm,
      properties.FLAECHE,
    ) ?? 0

  return {
    id,
    name:
      asString(
        record.name,
        record.parkName,
        properties.name,
        properties.ANL_NAME,
        properties.OBJEKTNAME,
      ) || 'Unbenannte Grünanlage',
    nameAddon: asString(
      record.nameAddon,
      record.name_addon,
      properties.nameAddon,
    ),
    district: asString(
      record.district,
      record.bezirk,
      properties.district,
      properties.BEZIRKSNAME,
      properties.BEZIRK,
    ),
    locality: asString(
      record.locality,
      record.ortsteil,
      properties.locality,
      properties.ORTSTEIL,
    ),
    type: asString(record.type, record.kind, properties.type, properties.ART),
    areaM2: rawArea,
    centroid: center,
    bounds:
      explicitBounds ??
      (feature
        ? boundsFromGeometry(feature.geometry, center)
        : asBounds(record.bounds, center)),
    dedicated:
      record.dedicated === true ||
      properties.dedicated === true ||
      record.dedicated === 'true',
    amenities: normalizeAmenities(
      record.amenities ?? properties.amenities ?? EMPTY_AMENITIES,
    ),
    geometry: feature?.geometry ?? null,
  }
}

const featureCollectionFrom = (value: unknown): ParksGeoJson => {
  const record = asRecord(value)
  const rawFeatures = Array.isArray(record.features) ? record.features : []
  const features = rawFeatures.flatMap((rawFeature) => {
    const feature = asRecord(rawFeature) as unknown as Feature<
      Geometry,
      GeoJsonProperties
    >
    if (feature.type !== 'Feature' || !feature.geometry) return []
    const park = normalizePark(feature.properties, feature)
    if (!park) return []
    return [
      {
        ...feature,
        id: park.id,
        properties: {
          ...asRecord(feature.properties),
          id: park.id,
          name: park.name,
          district: park.district,
        },
      } satisfies Feature<Geometry, GeoJsonProperties>,
    ]
  })
  return { type: 'FeatureCollection', features }
}

const indexItemsFrom = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value
  const record = asRecord(value)
  if (Array.isArray(record.parks)) return record.parks
  if (Array.isArray(record.items)) return record.items
  if (Array.isArray(record.features)) {
    return record.features.map((feature) => asRecord(feature).properties)
  }
  return []
}

export const normalizeParkData = (
  indexValue: unknown,
  geoJsonValue: unknown,
  summaryValue: unknown,
): ParkData => {
  const geojson = featureCollectionFrom(geoJsonValue)
  const featureById = new Map(
    geojson.features.map((feature) => [String(feature.id), feature]),
  )
  const indexedParks = indexItemsFrom(indexValue).flatMap((item) => {
    const record = asRecord(item)
    const id = asString(record.id, record.PITID, record.pitid)
    const park = normalizePark(item, id ? featureById.get(id) : undefined)
    return park ? [park] : []
  })

  const parkById = new Map(indexedParks.map((park) => [park.id, park]))
  for (const feature of geojson.features) {
    const park = normalizePark(feature.properties, feature)
    if (!park) continue
    const indexed = parkById.get(park.id)
    const preciseBounds = boundsFromGeometry(feature.geometry, park.centroid)
    parkById.set(
      park.id,
      indexed
        ? {
            ...park,
            ...indexed,
            bounds: preciseBounds,
            centroid: indexed.centroid ?? park.centroid,
            amenities: indexed.amenities,
          }
        : { ...park, bounds: preciseBounds },
    )
  }

  return {
    parks: [...parkById.values()],
    geojson,
    summary: normalizeSummary(summaryValue),
  }
}

export const normalizeSummary = (value: unknown): ParkSummary => {
  const summary = asRecord(value)
  const counts = asRecord(summary.counts)
  const areas = asRecord(summary.area)
  return {
    parkCount:
      asFiniteNumber(
        summary.parkCount,
        summary.totalParks,
        counts.parks,
        counts.total,
      ) ?? FALLBACK_SUMMARY.parkCount,
    totalAreaM2:
      asFiniteNumber(
        summary.totalAreaM2,
        summary.totalAreaSqm,
        summary.areaM2,
        areas.totalM2,
        areas.totalSqm,
      ) ?? FALLBACK_SUMMARY.totalAreaM2,
    districtCount:
      asFiniteNumber(
        summary.districtCount,
        summary.boroughCount,
        counts.districts,
      ) ?? FALLBACK_SUMMARY.districtCount,
    generatedAt:
      asString(summary.generatedAt, summary.generated_at) ||
      FALLBACK_SUMMARY.generatedAt,
    sourceUpdatedAt:
      asString(
        summary.sourceUpdatedAt,
        summary.dataAsOf,
        summary.source_updated_at,
      ) || FALLBACK_SUMMARY.sourceUpdatedAt,
  }
}

export const emptyParkData = (): ParkData => ({
  parks: [],
  geojson: { type: 'FeatureCollection', features: [] },
  summary: { ...FALLBACK_SUMMARY },
})

export const filterParks = (
  parks: Park[],
  query: string,
  amenities: readonly AmenityKey[],
): Park[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase('de-DE')
  return parks.filter((park) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      `${park.name} ${park.nameAddon} ${park.district} ${park.locality}`
        .toLocaleLowerCase('de-DE')
        .includes(normalizedQuery)
    return (
      matchesQuery &&
      amenities.every((amenity) => park.amenities[amenity] === true)
    )
  })
}

const nearestPointOnSegment = (
  origin: Coordinate,
  start: Position,
  end: Position,
): { coordinate: Coordinate; distanceKm: number } => {
  const longitudeScale = 111.32 * Math.cos((origin[1] * Math.PI) / 180)
  const latitudeScale = 110.574
  const ax = (start[0] - origin[0]) * longitudeScale
  const ay = (start[1] - origin[1]) * latitudeScale
  const bx = (end[0] - origin[0]) * longitudeScale
  const by = (end[1] - origin[1]) * latitudeScale
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared))
  const x = ax + t * dx
  const y = ay + t * dy

  return {
    coordinate: [
      start[0] + t * (end[0] - start[0]),
      start[1] + t * (end[1] - start[1]),
    ],
    distanceKm: Math.hypot(x, y),
  }
}

const nearestPointOnPark = (
  origin: Coordinate,
  park: Park,
): { coordinate: Coordinate; distanceKm: number } => {
  if (
    park.geometry?.type !== 'Polygon' &&
    park.geometry?.type !== 'MultiPolygon'
  ) {
    return {
      coordinate: park.centroid,
      distanceKm: distance(point(origin), point(park.centroid), {
        units: 'kilometers',
      }),
    }
  }

  const parkFeature = {
    type: 'Feature' as const,
    properties: {},
    geometry: park.geometry,
  }
  if (booleanPointInPolygon(point(origin), parkFeature)) {
    return { coordinate: origin, distanceKm: 0 }
  }

  const polygons =
    park.geometry.type === 'Polygon'
      ? [park.geometry.coordinates]
      : park.geometry.coordinates
  let nearest = {
    coordinate: park.centroid,
    distanceKm: Number.POSITIVE_INFINITY,
  }

  for (const rings of polygons) {
    for (const ring of rings) {
      for (let index = 1; index < ring.length; index += 1) {
        const candidate = nearestPointOnSegment(
          origin,
          ring[index - 1],
          ring[index],
        )
        if (candidate.distanceKm < nearest.distanceKm) nearest = candidate
      }
    }
  }

  return Number.isFinite(nearest.distanceKm)
    ? nearest
    : {
        coordinate: park.centroid,
        distanceKm: distance(point(origin), point(park.centroid), {
          units: 'kilometers',
        }),
      }
}

export const sortByDistance = (
  parks: Park[],
  origin: Coordinate,
): NearbyPark[] =>
  parks
    .map((park) => {
      const { coordinate: nearestCoordinate, distanceKm } =
        nearestPointOnPark(origin, park)
      return {
        ...park,
        distanceKm,
        estimatedMinutes:
          distanceKm < 0.025
            ? 0
            : Math.max(1, Math.round((distanceKm / 4.2) * 60)),
        nearestCoordinate,
      }
    })
    .sort((left, right) => left.distanceKm - right.distanceKm)

export const formatInteger = (value: number): string =>
  new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(value)

export const formatHectares = (areaM2: number, detailed = false): string =>
  new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: detailed && areaM2 < 100_000 ? 1 : 0,
  }).format(areaM2 / 10_000)

export const formatDistance = (distanceKm: number): string =>
  distanceKm < 0.025
    ? 'vor Ort'
    : distanceKm < 1
      ? `${Math.round((distanceKm * 1_000) / 10) * 10} m`
      : `${new Intl.NumberFormat('de-DE', {
          minimumFractionDigits: distanceKm < 10 ? 1 : 0,
          maximumFractionDigits: 1,
        }).format(distanceKm)} km`

export const formatSourceDate = (value: string | null): string => {
  if (!value) return 'unbekannt'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return value
  return new Intl.DateTimeFormat('de-DE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export const buildOsmDirectionsUrl = (
  origin: Coordinate,
  destination: Coordinate,
): string => {
  const route = `${origin[1]},${origin[0]};${destination[1]},${destination[0]}`
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${encodeURIComponent(route)}`
}
