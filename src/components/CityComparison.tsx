import { useEffect, useMemo, useRef, useState } from 'react'
import type { CityConfig, CityId } from '../lib/cities'

type ComparisonMetricKey =
  | 'access'
  | 'green-share'
  | 'green-per-person'
  | 'tree-cover'

interface ComparisonMetricDefinition {
  key: ComparisonMetricKey
  shortLabel: string
  accessibleLabel: string
  cardLabel: string
}

interface CityComparisonProps {
  cities: readonly CityConfig[]
  city: CityConfig
  onCitySelect: (cityId: CityId) => void
}

const COMPARISON_METRICS: readonly ComparisonMetricDefinition[] = [
  {
    key: 'access',
    shortLabel: '10 Min.',
    accessibleLabel: 'Zugang zu Grünflächen in 10 Gehminuten',
    cardLabel: 'mit Grünzugang in 10 Min.',
  },
  {
    key: 'green-share',
    shortLabel: 'Grünanteil',
    accessibleLabel: 'Harmonisierter Anteil kartierter Grünflächen',
    cardLabel: 'kartierter Grünanteil',
  },
  {
    key: 'green-per-person',
    shortLabel: 'm² / Person',
    accessibleLabel: 'Kartierte Grünfläche pro Person',
    cardLabel: 'kartiertes Grün pro Person',
  },
  {
    key: 'tree-cover',
    shortLabel: 'Bäume',
    accessibleLabel: 'Modellierter Baumbedeckungsanteil',
    cardLabel: 'modellierte Baumbedeckung',
  },
]

const DECIMAL_FORMATTER = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 1,
})

const metricValue = (
  city: CityConfig,
  metric: ComparisonMetricKey,
): number | null => {
  if (metric === 'access') return city.access?.sharePercent ?? null
  if (metric === 'green-share') {
    return city.greenSpace?.sharePercent ?? null
  }
  if (metric === 'green-per-person') {
    return city.greenSpace?.m2PerResident ?? null
  }
  return city.treeCover?.sharePercent ?? null
}

const formatMetricValue = (
  city: CityConfig,
  metric: ComparisonMetricKey,
): string => {
  const value = metricValue(city, metric)
  if (value === null) return '—'
  const unit = metric === 'green-per-person' ? 'm²' : '%'
  return `${DECIMAL_FORMATTER.format(value)}\u202f${unit}`
}

const metricNote = (
  city: CityConfig,
  metric: ComparisonMetricKey,
): string => {
  if (metric === 'access') {
    return city.access
      ? `GHSL ${city.access.populationYear} · Fußwegenetz`
      : 'Noch keine Vergleichsdaten'
  }
  if (metric === 'green-share') {
    return city.greenSpace
      ? `Gemeinsame Definition ${city.greenSpace.definitionVersion}`
      : 'Noch keine Vergleichsdaten'
  }
  if (metric === 'green-per-person') {
    return city.access
      ? `Bevölkerung: GHSL ${city.access.populationYear}`
      : 'Noch keine Vergleichsdaten'
  }
  return city.treeCover
    ? `${city.treeCover.observationYear} · ${DECIMAL_FORMATTER.format(
        city.treeCover.resolutionMeters,
      )}\u202fm Raster`
    : 'Noch keine Vergleichsdaten'
}

export function CityComparison({
  cities,
  city,
  onCitySelect,
}: CityComparisonProps) {
  const [selectedMetric, setSelectedMetric] =
    useState<ComparisonMetricKey>('access')
  const cityNavigationRef = useRef<HTMLElement>(null)
  const selectedDefinition =
    COMPARISON_METRICS.find((metric) => metric.key === selectedMetric) ??
    COMPARISON_METRICS[0]

  const rankedCities = useMemo(() => {
    const originalOrder = new Map(
      cities.map((candidate, index) => [candidate.id, index]),
    )
    return [...cities]
      .sort((left, right) => {
        const leftValue = metricValue(left, selectedMetric)
        const rightValue = metricValue(right, selectedMetric)
        if (leftValue === null && rightValue === null) {
          return (
            (originalOrder.get(left.id) ?? 0) -
            (originalOrder.get(right.id) ?? 0)
          )
        }
        if (leftValue === null) return 1
        if (rightValue === null) return -1
        if (rightValue !== leftValue) return rightValue - leftValue
        return (
          (originalOrder.get(left.id) ?? 0) -
          (originalOrder.get(right.id) ?? 0)
        )
      })
      .map((candidate, index) => ({
        city: candidate,
        rank:
          metricValue(candidate, selectedMetric) === null ? null : index + 1,
      }))
  }, [cities, selectedMetric])

  useEffect(() => {
    cityNavigationRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'center',
      })
  }, [city.id, selectedMetric])

  return (
    <>
      <div
        aria-label="Vergleichsmetrik"
        className="comparison-metric-switcher"
        data-testid="metric-switcher"
        role="group"
      >
        {COMPARISON_METRICS.map((metric) => (
          <button
            aria-label={metric.accessibleLabel}
            aria-pressed={selectedMetric === metric.key}
            data-comparison-metric={metric.key}
            key={metric.key}
            onClick={() => setSelectedMetric(metric.key)}
            type="button"
          >
            {metric.shortLabel}
          </button>
        ))}
      </div>

      <nav
        aria-label={`Städte nach ${selectedDefinition.accessibleLabel} vergleichen`}
        className="city-comparison"
        ref={cityNavigationRef}
      >
        {rankedCities.map(({ city: candidate, rank }) => {
          const selected = candidate.id === city.id
          return (
            <button
              aria-current={selected ? 'page' : undefined}
              className="city-card"
              data-city={candidate.id}
              data-rank={rank ?? undefined}
              key={candidate.id}
              onClick={() => onCitySelect(candidate.id)}
              type="button"
            >
              <span className="city-card-topline">
                <span className="city-card-heading">{candidate.name}</span>
                <span
                  aria-label={rank === null ? 'Ohne Rang' : `Rang ${rank}`}
                  className="city-card-rank"
                >
                  {rank === null ? '—' : `#${rank}`}
                </span>
              </span>
              <strong data-testid="city-card-value">
                {formatMetricValue(candidate, selectedMetric)}
              </strong>
              <small>{selectedDefinition.cardLabel}</small>
            </button>
          )
        })}
      </nav>

      <section
        aria-labelledby="overview-heading"
        className="comparison-overview"
      >
        <div className="comparison-overview-heading">
          <h2 id="overview-heading">{city.name} im Überblick</h2>
          <span>harmonisiert</span>
        </div>
        <dl
          className="comparison-metrics"
          data-testid="comparison-metrics"
        >
          {COMPARISON_METRICS.map((metric) => (
            <div
              className={`comparison-metric${
                metric.key === 'access' ? ' access-stat' : ''
              }`}
              data-metric={metric.key}
              data-selected={
                selectedMetric === metric.key ? 'true' : undefined
              }
              key={metric.key}
            >
              <dt>{metric.accessibleLabel}</dt>
              <dd>
                <strong>{formatMetricValue(city, metric.key)}</strong>
                <small>{metricNote(city, metric.key)}</small>
              </dd>
            </div>
          ))}
        </dl>
        <p className="comparison-context">
          Gemeinsame Definition innerhalb der jeweiligen Stadtgrenze. Der lokale
          Kartenbestand kann abweichen; Ränge sind Näherungen.
        </p>
      </section>
    </>
  )
}
