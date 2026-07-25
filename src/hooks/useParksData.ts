import { useEffect, useState } from 'react'
import {
  emptyParkData,
  normalizeParkData,
  type ParkData,
} from '../lib/parks'

interface ParksDataState {
  data: ParkData
  loading: boolean
  warning: string | null
}

const SNAPSHOT_PATHS = [
  'data/parks-index.json',
  'data/parks.geojson',
  'data/summary.json',
] as const

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

const snapshotGeneration = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return null
  const document = value as Record<string, unknown>
  return document.schemaVersion === 1 &&
    typeof document.generatedAt === 'string' &&
    Number.isFinite(Date.parse(document.generatedAt))
    ? document.generatedAt
    : null
}

const fetchCoherentSnapshot = async (): Promise<[unknown, unknown, unknown]> => {
  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const retryToken =
        attempt === 0 ? undefined : `${Date.now().toString(36)}-${attempt}`
      const documents = await Promise.all(
        SNAPSHOT_PATHS.map((path) =>
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

export const useParksData = (): ParksDataState => {
  const [state, setState] = useState<ParksDataState>(() => ({
    data: emptyParkData(),
    loading: true,
    warning: null,
  }))

  useEffect(() => {
    let cancelled = false

    void fetchCoherentSnapshot()
      .then(([indexValue, geoJsonValue, summaryValue]) => {
        if (cancelled) return
        setState({
          data: normalizeParkData(indexValue, geoJsonValue, summaryValue),
          loading: false,
          warning: null,
        })
      })
      .catch(() => {
        if (cancelled) return
        setState({
          data: emptyParkData(),
          loading: false,
          warning:
            'Die Parkdaten konnten nicht konsistent geladen werden. Bitte lade die Seite neu.',
        })
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
