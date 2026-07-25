import {
  Building2,
  Clock3,
  ExternalLink,
  LocateFixed,
  Search,
  Trees,
} from 'lucide-react'
import type { ChangeEvent } from 'react'
import type { CityConfig, CityId } from '../lib/cities'
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
import { CityComparison } from './CityComparison'
import { ParkResults } from './ParkResults'

interface InfoPanelProps {
  amenities: readonly AmenityKey[]
  cities: readonly CityConfig[]
  city: CityConfig
  loading: boolean
  locationMessage: string | null
  nearbyParks: NearbyPark[]
  origin: Coordinate | null
  query: string
  selectedParkId: string | null
  summary: ParkSummary
  warning: string | null
  onAmenityToggle: (key: AmenityKey) => void
  onCitySelect: (cityId: CityId) => void
  onQueryChange: (query: string) => void
  onParkSelect: (parkId: string) => void
}

export function InfoPanel({
  amenities,
  cities,
  city,
  loading,
  locationMessage,
  nearbyParks,
  origin,
  query,
  selectedParkId,
  summary,
  warning,
  onAmenityToggle,
  onCitySelect,
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
  const freshnessDate = summary.sourceUpdatedAt ?? summary.generatedAt

  const handleSearch = (event: ChangeEvent<HTMLInputElement>) => {
    onQueryChange(event.target.value)
  }

  return (
    <aside
      className="information-rail"
      data-testid="information-rail"
      aria-label="Parks und Stadtgrün"
    >
      <div className="sheet-handle" aria-hidden="true" />
      <header className="brand-header">
        <p>Parks &amp; Stadtgrün</p>
        <h1>Städte vergleichen</h1>
      </header>

      <CityComparison
        cities={cities}
        city={city}
        onCitySelect={onCitySelect}
      />

      <section
        className="inventory-summary"
        aria-labelledby="inventory-heading"
      >
        <h2 id="inventory-heading">Lokaler Kartenbestand</h2>
        <p className="area-stat">
          <strong>{areaHectares}</strong>
          <span> Hektar geladene Parkfläche</span>
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
              {hasSnapshot ? formatInteger(summary.districtCount) : '—'}{' '}
              {summary.districtCount === 1
                ? 'Stadtgebiet'
                : (city.districtLabel ?? 'Bezirke')}
            </span>
          </p>
          <p className="freshness">
            <Clock3 aria-hidden="true" />
            <span>
              {hasSnapshot
                ? `${summary.sourceUpdatedAt ? 'Stand' : 'Abruf'} ${formatSourceDate(freshnessDate)}`
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

      {city.availableAmenities.length > 0 ? (
        <AmenityFilters selected={amenities} onToggle={onAmenityToggle} />
      ) : null}

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
          <span>Daten: {city.dataSourceLabel}</span>
          <span aria-hidden="true">·</span>
          <span>Karte: {city.mapSourceLabel}</span>
          <ExternalLink aria-hidden="true" />
        </summary>
        <div>
          <p>
            Die Vergleichswerte oben verwenden harmonisierte Definitionen. Der
            lokale Kartenbestand für Karte, Suche und Filter stammt dagegen aus
            dem jeweiligen Stadt-Datensatz und kann davon abweichen.
          </p>
          <p>
            Parkflächen
            {city.availableAmenities.length > 0 && !city.amenitySourceLabel
              ? ' und Ausstattungen'
              : ''}
            :{' '}
            <a
              href={city.dataSourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              {city.dataSourceLabel}
            </a>
            ,{' '}
            <a
              href={city.licenseUrl}
              rel="noreferrer"
              target="_blank"
            >
              {city.licenseLabel}
            </a>
            . {city.dataAttribution}.{' '}
            {city.availableAmenities.length > 0 &&
            city.amenitySourceLabel &&
            city.amenitySourceUrl &&
            city.amenityLicenseLabel &&
            city.amenityLicenseUrl ? (
              <>
                Ausstattungen:{' '}
                <a
                  href={city.amenitySourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {city.amenitySourceLabel}
                </a>
                ,{' '}
                <a
                  href={city.amenityLicenseUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {city.amenityLicenseLabel}
                </a>
                . {city.amenityAttribution}.{' '}
              </>
            ) : null}
            Basiskarte:{' '}
            <a href={city.mapSourceUrl} rel="noreferrer" target="_blank">
              {city.mapSourceLabel}
            </a>
            .
          </p>
          <p>
            Die 5/10/15-Minuten-Ringe ab einem gewählten Kartenpunkt sind
            Luftlinien-Schätzungen bei 4,2 km/h.
            {city.availableAmenities.length > 0
              ? ' Ausstattungen zeigen in der Parkfläche oder bis zu 75 m entfernt gefundene Einträge; fehlende Einträge sind keine bestätigte Abwesenheit.'
              : ''}
          </p>
          {city.districtNote ? <p>{city.districtNote}</p> : null}
          {city.access ? (
            <p>
              Der harmonisierte 10-Minuten-Wert nutzt die modellierte
              Wohnbevölkerung aus GHSL {city.access.populationYear} als Nenner.
              Der Zähler umfasst modellierte Einwohner innerhalb von{' '}
              {city.access.thresholdMeters} m im Fußwegenetz zu einer
              mindestens 0,5 ha großen, nicht als privat gesperrt erfassten
              Grünfläche. Das gemeinsame OSM-Flächenmodell berücksichtigt
              Parks, Naturreservate, Waldflächen und explizit öffentliche
              Gärten. Waldflächen zählen für den Zugang nur mit explizitem
              öffentlichem Zugangs-Tag; als gebührenpflichtig markierte Flächen
              sind ausgeschlossen.
              Bevölkerungsraster:{' '}
              <a
                href="https://data.jrc.ec.europa.eu/dataset/2ff68a52-5b5b-4a22-8f40-c41da8332cfe"
                rel="noreferrer"
                target="_blank"
              >
                EC JRC
              </a>
              ; Fußwegenetz:{' '}
              <a
                href="https://www.openstreetmap.org/copyright"
                rel="noreferrer"
                target="_blank"
              >
                © OpenStreetMap-Mitwirkende
              </a>
              . Ergebnis ist eine Modellschätzung, keine adressgenaue
              Erreichbarkeitsgarantie.
            </p>
          ) : null}
          {city.greenSpace ? (
            <p>
              Grünanteil und Grünfläche pro Person nutzen für alle Städte
              dieselbe Flächendefinition ({city.greenSpace.definitionVersion})
              und administrative Bezugsfläche. Kartierter Wald zählt hier auch
              ohne bestätigten öffentlichen Zugang; die Werte sind weder die
              Summe des lokalen Kartenbestands noch öffentlich zugängliche
              Parkfläche.
            </p>
          ) : null}
          {city.treeCover ? (
            <p>
              Die modellierte Baumbedeckung nutzt CGLS-LC100 auf der Landfläche,
              Beobachtungsjahr {city.treeCover.observationYear}, Rasterweite{' '}
              {formatInteger(city.treeCover.resolutionMeters)} m. Baumbedeckung
              ist nicht automatisch öffentlich zugänglich; kleine
              Rangunterschiede sind nicht belastbar.
            </p>
          ) : null}
          <p>
            {hasSnapshot
              ? `Lokaler Kartenbestand: ${formatHectares(summary.totalAreaM2)} Hektar geladene Parkfläche.`
              : 'Zurzeit ist kein konsistenter Datensatz geladen.'}
          </p>
        </div>
      </details>
    </aside>
  )
}
