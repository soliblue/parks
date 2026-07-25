import {
  Building2,
  Clock3,
  ExternalLink,
  LocateFixed,
  Search,
  Trees,
} from 'lucide-react'
import type { ChangeEvent } from 'react'
import {
  formatHectares,
  formatInteger,
  formatSourceDate,
  type AmenityKey,
  type Coordinate,
  type NearbyPark,
  type ParkSummary,
} from '../lib/parks'
import { AmenityFilters } from './AmenityFilters'
import { ParkResults } from './ParkResults'

interface InfoPanelProps {
  amenities: readonly AmenityKey[]
  loading: boolean
  locationMessage: string | null
  nearbyParks: NearbyPark[]
  origin: Coordinate | null
  query: string
  selectedParkId: string | null
  summary: ParkSummary
  warning: string | null
  onAmenityToggle: (key: AmenityKey) => void
  onQueryChange: (query: string) => void
  onParkSelect: (parkId: string) => void
}

export function InfoPanel({
  amenities,
  loading,
  locationMessage,
  nearbyParks,
  origin,
  query,
  selectedParkId,
  summary,
  warning,
  onAmenityToggle,
  onQueryChange,
  onParkSelect,
}: InfoPanelProps) {
  const hasSnapshot = summary.generatedAt !== null
  const areaHectares = hasSnapshot
    ? formatInteger(Math.round(summary.totalAreaM2 / 10_000))
    : loading
      ? '…'
      : '—'
  const statusMessage = warning ?? locationMessage

  const handleSearch = (event: ChangeEvent<HTMLInputElement>) => {
    onQueryChange(event.target.value)
  }

  return (
    <aside
      className="information-rail"
      data-testid="information-rail"
      aria-label="Parkblick Informationen"
    >
      <div className="sheet-handle" aria-hidden="true" />
      <header className="brand-header">
        <h1>Parkblick</h1>
      </header>

      <section className="overview" aria-labelledby="overview-heading">
        <h2 id="overview-heading">Berlin im Überblick</h2>
        <p className="area-stat">
          <strong>{areaHectares}</strong>
          <span> Hektar öffentliches Grün</span>
        </p>
        <div className="overview-facts">
          <p>
            <Trees aria-hidden="true" />
            <span>
              {hasSnapshot ? formatInteger(summary.parkCount) : '—'} Grünanlagen
            </span>
          </p>
          <p>
            <Building2 aria-hidden="true" />
            <span>
              {hasSnapshot ? formatInteger(summary.districtCount) : '—'} Bezirke
            </span>
          </p>
          <p className="freshness">
            <Clock3 aria-hidden="true" />
            <span>
              {hasSnapshot
                ? `Stand ${formatSourceDate(summary.sourceUpdatedAt)}`
                : loading
                  ? 'Daten werden geladen'
                  : 'Stand unbekannt'}
            </span>
          </p>
        </div>
      </section>

      <div className="search-field">
        <Search aria-hidden="true" />
        <label className="visually-hidden" htmlFor="park-search">
          Park oder Bezirk
        </label>
        <input
          autoComplete="off"
          id="park-search"
          name="Park oder Bezirk"
          onChange={handleSearch}
          placeholder="Park oder Bezirk"
          type="search"
          value={query}
        />
      </div>

      <AmenityFilters selected={amenities} onToggle={onAmenityToggle} />

      <div className="origin-hint">
        <LocateFixed aria-hidden="true" />
        <p>Klicke in die Karte oder nutze deinen Standort.</p>
      </div>

      <div className="distance-legend" aria-label="Geschätzte Gehzeit">
        <span>
          <i className="band band-five" />
          5 Min
        </span>
        <span>
          <i className="band band-ten" />
          10 Min
        </span>
        <span>
          <i className="band band-fifteen" />
          15 Min
        </span>
      </div>

      {statusMessage ? (
        <p className="inline-status" role="status">
          {statusMessage}
        </p>
      ) : null}

      <ParkResults
        loading={loading}
        origin={origin}
        parks={nearbyParks}
        selectedParkId={selectedParkId}
        onSelect={onParkSelect}
      />

      <details className="source-disclosure">
        <summary>
          <span>Daten: Land Berlin</span>
          <span aria-hidden="true">·</span>
          <span>Karte: basemap.de</span>
          <ExternalLink aria-hidden="true" />
        </summary>
        <div>
          <p>
            Parkflächen und Ausstattungen:{' '}
            <a
              href="https://daten.berlin.de/datensaetze/grunanlagenbestand-berlin-einschliesslich-der-offentlichen-spielplatze-wfs-737fd0a4"
              rel="noreferrer"
              target="_blank"
            >
              Land Berlin
            </a>
            ,{' '}
            <a
              href="https://www.govdata.de/dl-de/zero-2-0"
              rel="noreferrer"
              target="_blank"
            >
              dl-de/zero-2.0
            </a>
            . Basiskarte: GeoBasis-DE / BKG (
            <a href="https://basemap.de/" rel="noreferrer" target="_blank">
              basemap.de
            </a>
            ).
          </p>
          <p>
            Gehzeiten sind Luftlinien-Schätzungen bei 4,2 km/h, keine gerouteten
            Isochronen. Ausstattungen zeigen in der Parkfläche oder bis zu 75 m
            entfernt gefundene Einträge; fehlende Einträge sind keine
            bestätigte Abwesenheit.
          </p>
          <p>
            {hasSnapshot
              ? `Geladene Parkfläche: ${formatHectares(summary.totalAreaM2)} Hektar.`
              : 'Zurzeit ist kein konsistenter Datensatz geladen.'}
          </p>
        </div>
      </details>
    </aside>
  )
}
