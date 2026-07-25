import { ChevronRight, ExternalLink } from 'lucide-react'
import {
  buildOsmDirectionsUrl,
  formatDistance,
  formatHectares,
  type Coordinate,
  type NearbyPark,
} from '../lib/parks'

interface ParkResultsProps {
  loading: boolean
  origin: Coordinate | null
  parks: NearbyPark[]
  selectedParkId: string | null
  onSelect: (parkId: string) => void
}

export function ParkResults({
  loading,
  origin,
  parks,
  selectedParkId,
  onSelect,
}: ParkResultsProps) {
  return (
    <section className="nearby-section" aria-labelledby="nearby-heading">
      <h2 id="nearby-heading">Parks in der Nähe</h2>
      <div className="results-rule" />
      {loading ? (
        <p className="results-status" role="status">
          Parkdaten werden geladen …
        </p>
      ) : !origin && parks.length === 0 ? (
        <p className="results-status">
          Wähle einen Ausgangspunkt in der Karte oder nutze deinen Standort.
        </p>
      ) : parks.length === 0 ? (
        <p className="results-status">
          Keine passenden Parks in den geladenen Daten.
        </p>
      ) : (
        <ol className="park-results">
          {parks.slice(0, 20).map((park, index) => {
            const selected = park.id === selectedParkId
            return (
              <li
                className="park-result"
                data-selected={selected || undefined}
                id={`park-result-${park.id}`}
                key={park.id}
              >
                <button
                  aria-current={selected ? 'true' : undefined}
                  className="park-result-main"
                  onClick={() => onSelect(park.id)}
                  type="button"
                >
                  <span className="result-rank">{index + 1}</span>
                  <span className="result-copy">
                    <strong>{park.name}</strong>
                    <small>
                      {formatHectares(park.areaM2, true)} Hektar
                      {park.district ? ` · ${park.district}` : ''}
                    </small>
                  </span>
                  {park.distanceKm !== null &&
                  park.estimatedMinutes !== null ? (
                    <span className="result-distance">
                      <span>{formatDistance(park.distanceKm)}</span>
                      <small>{park.estimatedMinutes} Min</small>
                    </span>
                  ) : null}
                </button>
                {origin &&
                park.distanceKm !== null &&
                park.distanceKm >= 0.025 ? (
                  <a
                    aria-label={`Fußweg zu ${park.name} in OpenStreetMap öffnen`}
                    className="directions-link"
                    href={buildOsmDirectionsUrl(
                      origin,
                      park.nearestCoordinate,
                    )}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ChevronRight aria-hidden="true" />
                    <ExternalLink aria-hidden="true" />
                  </a>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
