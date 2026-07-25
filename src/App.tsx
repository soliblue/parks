import {
  lazy,
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { InfoPanel } from './components/InfoPanel'
import { useParksData } from './hooks/useParksData'
import {
  filterParks,
  sortByDistance,
  type AmenityKey,
  type Coordinate,
} from './lib/parks'
import { readUrlState, writeUrlState } from './lib/url-state'

const ParkMap = lazy(async () => {
  const module = await import('./components/ParkMap')
  return { default: module.ParkMap }
})

export function App() {
  const initialState = useMemo(() => readUrlState(), [])
  const { data, loading, warning } = useParksData()
  const [query, setQuery] = useState(initialState.query)
  const deferredQuery = useDeferredValue(query)
  const [amenities, setAmenities] = useState<AmenityKey[]>(
    initialState.amenities,
  )
  const [origin, setOrigin] = useState<Coordinate | null>(initialState.origin)
  const [selectedParkId, setSelectedParkId] = useState<string | null>(
    initialState.selectedParkId,
  )
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(true)

  const filteredParks = useMemo(
    () => filterParks(data.parks, deferredQuery, amenities),
    [amenities, data.parks, deferredQuery],
  )
  const nearbyParks = useMemo(
    () => {
      if (origin) return sortByDistance(filteredParks, origin)
      if (!deferredQuery.trim()) {
        const selectedPark = selectedParkId
          ? filteredParks.find((park) => park.id === selectedParkId)
          : null
        return selectedPark
          ? [
              {
                ...selectedPark,
                distanceKm: null,
                estimatedMinutes: null,
                nearestCoordinate: selectedPark.centroid,
              },
            ]
          : []
      }
      return [...filteredParks]
        .sort((left, right) =>
          left.name.localeCompare(right.name, 'de-DE', {
            sensitivity: 'base',
          }),
        )
        .map((park) => ({
          ...park,
          distanceKm: null,
          estimatedMinutes: null,
          nearestCoordinate: park.centroid,
        }))
    },
    [deferredQuery, filteredParks, origin, selectedParkId],
  )
  const visibleParkIds = useMemo(
    () => filteredParks.map((park) => park.id),
    [filteredParks],
  )

  useEffect(() => {
    writeUrlState({
      query,
      amenities,
      origin,
      selectedParkId,
    })
  }, [amenities, origin, query, selectedParkId])

  useEffect(() => {
    if (
      selectedParkId &&
      data.parks.length > 0 &&
      !filteredParks.some((park) => park.id === selectedParkId)
    ) {
      setSelectedParkId(null)
    }
  }, [data.parks.length, filteredParks, selectedParkId])

  useEffect(() => {
    if (!selectedParkId) return
    document
      .getElementById(`park-result-${selectedParkId}`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedParkId])

  const toggleAmenity = (key: AmenityKey) => {
    setAmenities((current) =>
      current.includes(key)
        ? current.filter((amenity) => amenity !== key)
        : [...current, key],
    )
  }

  return (
    <main
      className={`app-shell${panelOpen ? '' : ' panel-collapsed'}`}
    >
      <div className="information-panel-shell" data-testid="bottom-sheet">
        <InfoPanel
          amenities={amenities}
          loading={loading}
          locationMessage={locationMessage}
          nearbyParks={nearbyParks}
          origin={origin}
          query={query}
          selectedParkId={selectedParkId}
          summary={data.summary}
          warning={warning}
          onAmenityToggle={toggleAmenity}
          onParkSelect={setSelectedParkId}
          onQueryChange={setQuery}
        />
      </div>
      <Suspense
        fallback={
          <section
            aria-label="Karte der Berliner Parks"
            className="map-shell map-loading"
            data-testid="park-map"
          >
            <p role="status">Karte wird geladen …</p>
          </section>
        }
      >
        <ParkMap
          geojson={data.geojson}
          origin={origin}
          panelOpen={panelOpen}
          parks={data.parks}
          selectedParkId={selectedParkId}
          visibleParkIds={visibleParkIds}
          onLocationMessage={setLocationMessage}
          onOriginChange={setOrigin}
          onPanelToggle={() => setPanelOpen((current) => !current)}
          onParkSelect={setSelectedParkId}
        />
      </Suspense>
    </main>
  )
}
