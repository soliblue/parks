import { useEffect, useState } from 'react'
import {
  cityById,
  DEFAULT_CITIES,
  normalizeCities,
  type CityConfig,
  type CityId,
} from '../lib/cities'
import {
  emptyParkData,
  normalizeParkData,
  type ParkData,
} from '../lib/parks'

interface ParksDataState {
  cities: CityConfig[]
  city: CityConfig
  data: ParkData
  loading: boolean
  warning: string | null
}

const fetchJson = async (
  path: string,
  cache: RequestCache,
  retryToken?: string,
): Promise<unknown> => {
  const url = new URL(path, document.baseURI)
  if (retryToken) url.searchParams.set('snapshot-retry', retryToken)
  const response = await fetch(url, { cache })
  if (!response.ok) {
    throw new Error(`${path}: HTTP ${response.status}`)
  }
  return response.json() as Promise<unknown>
}

const fetchOptionalJson = async (path: string): Promise<unknown> => {
  try {
    return await fetchJson(path, 'default')
  } catch {
    return null
  }
}

const snapshotGeneration = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null
  const document = value as Record<string, unknown>
  return document.schemaVersion === 1 &&
    typeof document.generatedAt === 'string' &&
    Number.isFinite(Date.parse(document.generatedAt))
    ? document.generatedAt
    : null
}

const snapshotPaths = (dataPath: string) =>
  ['parks-index.json', 'parks.geojson', 'summary.json'].map(
    (filename) => `${dataPath}/${filename}`,
  )

const fetchCoherentSnapshot = async (
  dataPath: string,
): Promise<[unknown, unknown, unknown]> => {
  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const retryToken =
        attempt === 0 ? undefined : `${Date.now().toString(36)}-${attempt}`
      const documents = await Promise.all(
        snapshotPaths(dataPath).map((path) =>
          fetchJson(path, attempt === 0 ? 'default' : 'reload', retryToken),
        ),
      )
      const generations = documents.map(snapshotGeneration)
      if (
        generations.some((generation) => generation === null) ||
        new Set(generations).size !== 1
      ) {
        throw new Error('Park snapshot generations do not match')
      }
      return documents as [unknown, unknown, unknown]
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

let catalogPromise: Promise<CityConfig[]> | null = null
const snapshotPromises = new Map<string, Promise<ParkData>>()

const loadCities = (): Promise<CityConfig[]> => {
  catalogPromise ??= Promise.all([
    fetchJson('data/cities.json', 'default'),
    fetchOptionalJson('data/access.json'),
  ])
    .then(([manifest, access]) => normalizeCities(manifest, access))
    .catch(() => [...DEFAULT_CITIES])
  return catalogPromise
}

const loadSnapshot = (dataPath: string): Promise<ParkData> => {
  let promise = snapshotPromises.get(dataPath)
  if (!promise) {
    promise = fetchCoherentSnapshot(dataPath)
      .then(([indexValue, geoJsonValue, summaryValue]) =>
        normalizeParkData(indexValue, geoJsonValue, summaryValue),
      )
      .catch((error) => {
        snapshotPromises.delete(dataPath)
        throw error
      })
    snapshotPromises.set(dataPath, promise)
  }
  return promise
}

export const useParksData = (cityId: CityId): ParksDataState => {
  const fallbackCity = cityById(DEFAULT_CITIES, cityId)
  const [state, setState] = useState<ParksDataState>(() => ({
    cities: [...DEFAULT_CITIES],
    city: fallbackCity,
    data: emptyParkData(),
    loading: true,
    warning: null,
  }))

  useEffect(() => {
    let cancelled = false
    const immediateCity = cityById(state.cities, cityId)

    setState((current) => ({
      ...current,
      city: cityById(current.cities, cityId),
      data: emptyParkData(),
      loading: true,
      warning: null,
    }))

    void loadCities()
      .then(async (cities) => {
        const city = cityById(cities, cityId)
        const data = await loadSnapshot(city.dataPath)
        if (cancelled) return
        setState({
          cities,
          city,
          data,
          loading: false,
          warning: null,
        })
      })
      .catch(() => {
        if (cancelled) return
        setState((current) => ({
          ...current,
          city: immediateCity,
          data: emptyParkData(),
          loading: false,
          warning:
            `Die Parkdaten für ${immediateCity.name} konnten nicht konsistent geladen werden. Bitte lade die Seite neu.`,
        }))
      })

    return () => {
      cancelled = true
    }
    // `state.cities` deliberately stays out: the selected city is the trigger,
    // while the cached catalog supplies fresh metadata inside the effect.
  }, [cityId])

  return state
}
