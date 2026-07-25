import booleanIntersects from '@turf/boolean-intersects'
import buffer from '@turf/buffer'
import { point } from '@turf/helpers'
import type { Feature, Geometry, Polygon } from 'geojson'
import {
  WALK_BANDS,
  type Coordinate,
  type Park,
  type ParkIdsByWalkBand,
  type WalkBandMinutes,
} from './parks'

export type WalkBandsGeoJson = {
  type: 'FeatureCollection'
  features: Feature<Polygon, { minutes: WalkBandMinutes }>[]
}

export const buildWalkBands = (origin: Coordinate): WalkBandsGeoJson => {
  const features = [...WALK_BANDS]
    .reverse()
    .flatMap(({ minutes, distanceKm }) => {
      const polygon = buffer(point(origin), distanceKm, {
        units: 'kilometers',
        steps: 64,
      })
      if (!polygon || polygon.geometry.type !== 'Polygon') return []
      return [
        {
          ...polygon,
          properties: { minutes },
        } as Feature<Polygon, { minutes: WalkBandMinutes }>,
      ]
    })

  return { type: 'FeatureCollection', features }
}

const polygonBounds = (
  polygon: Feature<Polygon>,
): [number, number, number, number] => {
  let west = Number.POSITIVE_INFINITY
  let south = Number.POSITIVE_INFINITY
  let east = Number.NEGATIVE_INFINITY
  let north = Number.NEGATIVE_INFINITY

  for (const ring of polygon.geometry.coordinates) {
    for (const [longitude, latitude] of ring) {
      west = Math.min(west, longitude)
      south = Math.min(south, latitude)
      east = Math.max(east, longitude)
      north = Math.max(north, latitude)
    }
  }

  return [west, south, east, north]
}

const boundsOverlap = (
  left: [number, number, number, number],
  right: [number, number, number, number],
): boolean =>
  left[0] <= right[2] &&
  left[2] >= right[0] &&
  left[1] <= right[3] &&
  left[3] >= right[1]

export const findParkIdsIntersectingWalkBands = (
  parks: Park[],
  origin: Coordinate,
): ParkIdsByWalkBand => {
  const ids: ParkIdsByWalkBand = { 5: [], 10: [], 15: [] }
  const bands = buildWalkBands(origin).features.map((feature) => ({
    bounds: polygonBounds(feature),
    feature,
  }))

  for (const park of parks) {
    if (!park.geometry) continue
    const parkFeature: Feature<Geometry> = {
      type: 'Feature',
      properties: {},
      geometry: park.geometry,
    }
    for (const band of bands) {
      if (
        boundsOverlap(park.bounds, band.bounds) &&
        booleanIntersects(parkFeature, band.feature)
      ) {
        ids[band.feature.properties.minutes].push(park.id)
      }
    }
  }

  return ids
}
