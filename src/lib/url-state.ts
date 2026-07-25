import type { AmenityKey, Coordinate } from './parks'

export interface UrlState {
  query: string
  amenities: AmenityKey[]
  origin: Coordinate | null
  selectedParkId: string | null
}

const AMENITIES = new Set<AmenityKey>([
  'playground',
  'drinkingFountain',
  'toilet',
  'dogRun',
])
const MAX_MERCATOR_LATITUDE = 85.051129

const isValidOrigin = (value: number[] | undefined): value is Coordinate =>
  value?.length === 2 &&
  value.every((part) => Number.isFinite(part)) &&
  value[0] >= -180 &&
  value[0] <= 180 &&
  value[1] >= -MAX_MERCATOR_LATITUDE &&
  value[1] <= MAX_MERCATOR_LATITUDE

export const readUrlState = (): UrlState => {
  const parameters = new URLSearchParams(window.location.search)
  const coordinateParts = parameters
    .get('origin')
    ?.split(',')
    .map((part) => (part.trim() ? Number(part) : Number.NaN))
  const origin = isValidOrigin(coordinateParts) ? coordinateParts : null

  const amenities = (parameters.get('amenities')?.split(',') ?? []).filter(
    (value): value is AmenityKey => AMENITIES.has(value as AmenityKey),
  )

  return {
    query: parameters.get('q') ?? '',
    amenities,
    origin,
    selectedParkId: parameters.get('park'),
  }
}

export const writeUrlState = ({
  query,
  amenities,
  selectedParkId,
}: UrlState) => {
  const url = new URL(window.location.href)
  if (query.trim()) url.searchParams.set('q', query.trim())
  else url.searchParams.delete('q')

  if (amenities.length > 0)
    url.searchParams.set('amenities', amenities.join(','))
  else url.searchParams.delete('amenities')

  // Origins may be exact device locations. Keep them ephemeral instead of
  // putting them in a query string that reaches browser history and CDN logs.
  url.searchParams.delete('origin')

  if (selectedParkId) url.searchParams.set('park', selectedParkId)
  else url.searchParams.delete('park')

  window.history.replaceState({}, '', url)
}
