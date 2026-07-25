import { ChevronLeft, Crosshair, Minus, Plus } from 'lucide-react'
import {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker,
  type FilterSpecification,
  type MapMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  WALK_BANDS,
  type Coordinate,
  type Park,
  type ParkIdsByWalkBand,
  type ParksGeoJson,
} from '../lib/parks'
import {
  buildWalkBands,
  findParkIdsIntersectingWalkBands,
  type WalkBandsGeoJson,
} from '../lib/walk-bands'

const MAP_WALK_BANDS = [...WALK_BANDS].reverse()
const EMPTY_PARK_IDS_BY_WALK_BAND: ParkIdsByWalkBand = {
  5: [],
  10: [],
  15: [],
}
const PARK_HIGHLIGHT_STYLES = [
  {
    minutes: 15,
    color: '#69d184',
    fillOpacity: 0.22,
    lineOpacity: 0.46,
    lineWidth: 1,
  },
  {
    minutes: 10,
    color: '#34c759',
    fillOpacity: 0.18,
    lineOpacity: 0.62,
    lineWidth: 1.25,
  },
  {
    minutes: 5,
    color: '#168f3b',
    fillOpacity: 0.18,
    lineOpacity: 0.82,
    lineWidth: 1.6,
  },
] as const

const softenOfficialBasemap = (map: MapLibreMap) => {
  const layers = map.getStyle().layers ?? []
  const setPaint = (layerId: string, property: string, value: unknown) => {
    try {
      map.setPaintProperty(layerId, property, value)
    } catch {
      // Some upstream layers intentionally omit optional paint capabilities.
    }
  }

  for (const layer of layers) {
    const sourceLayer =
      (layer as { 'source-layer'?: string })['source-layer'] ?? ''
    const signature = `${layer.id} ${sourceLayer}`.toLocaleLowerCase('de-DE')
    const isWater =
      /gewaesser|wasser|meer|see|hafen|fluss|kanal/.test(signature)
    const isVegetation =
      /vegetation|wald|forst|gehoelz|gruenland|garten|friedhof|sportfreizeit|erholung/.test(
        signature,
      )
    const isBuilding = /gebaeude|bauwerk|building/.test(signature)
    const isSettlement = /siedlung|industrie|gewerbe/.test(signature)
    const isRoad =
      /verkehr|strasse|autobahn|bundesstr|landesstr|kreisstr|gemeindestr|fahrbahn|fussweg|wirtschaftsweg/.test(
        signature,
      )
    const isRoadDeck = /decker/.test(signature)
    const isRail = /bahn|gleis|schiene/.test(signature)

    switch (layer.type) {
      case 'background':
        setPaint(layer.id, 'background-color', '#ffffff')
        setPaint(layer.id, 'background-opacity', 1)
        break
      case 'fill':
        if (/hintergrund/.test(signature)) {
          setPaint(layer.id, 'fill-color', '#ffffff')
          setPaint(layer.id, 'fill-opacity', 1)
        } else if (isWater) {
          setPaint(layer.id, 'fill-color', '#e7eff2')
          setPaint(layer.id, 'fill-outline-color', '#d8e4e8')
          setPaint(layer.id, 'fill-opacity', 0.84)
        } else if (isVegetation) {
          setPaint(layer.id, 'fill-color', '#e7f1e5')
          setPaint(layer.id, 'fill-outline-color', '#d9e7d6')
          setPaint(layer.id, 'fill-opacity', 0.68)
        } else if (isBuilding) {
          setPaint(layer.id, 'fill-color', '#ecefed')
          setPaint(layer.id, 'fill-outline-color', '#dde2df')
          setPaint(layer.id, 'fill-opacity', 0.48)
        } else if (isSettlement) {
          setPaint(layer.id, 'fill-color', '#f3f5f3')
          setPaint(layer.id, 'fill-outline-color', '#e7eae8')
          setPaint(layer.id, 'fill-opacity', 0.72)
        } else {
          setPaint(layer.id, 'fill-color', '#f8f9f8')
          setPaint(layer.id, 'fill-outline-color', '#e8ebe9')
          setPaint(layer.id, 'fill-opacity', 0.62)
        }
        break
      case 'line':
        if (isWater) {
          setPaint(layer.id, 'line-color', '#cbdde3')
          setPaint(layer.id, 'line-opacity', 0.52)
        } else if (isRoadDeck) {
          setPaint(layer.id, 'line-color', '#ffffff')
          setPaint(layer.id, 'line-opacity', 0.82)
        } else if (isRoad) {
          setPaint(layer.id, 'line-color', '#d8dedb')
          setPaint(layer.id, 'line-opacity', 0.42)
        } else if (isRail) {
          setPaint(layer.id, 'line-color', '#c8cfcb')
          setPaint(layer.id, 'line-opacity', 0.4)
        } else if (isVegetation) {
          setPaint(layer.id, 'line-color', '#cfdfcc')
          setPaint(layer.id, 'line-opacity', 0.4)
        } else {
          setPaint(layer.id, 'line-color', '#d8ddda')
          setPaint(layer.id, 'line-opacity', 0.34)
        }
        break
      case 'symbol':
        setPaint(layer.id, 'text-color', '#66706b')
        setPaint(layer.id, 'text-halo-color', '#ffffff')
        setPaint(layer.id, 'text-halo-width', 1.4)
        setPaint(layer.id, 'text-halo-blur', 0.25)
        setPaint(layer.id, 'text-opacity', isRoad ? 0.48 : 0.66)
        setPaint(layer.id, 'icon-opacity', 0.46)
        break
      case 'circle':
        setPaint(layer.id, 'circle-color', '#aeb7b2')
        setPaint(layer.id, 'circle-stroke-color', '#ffffff')
        setPaint(layer.id, 'circle-opacity', 0.5)
        setPaint(layer.id, 'circle-stroke-opacity', 0.72)
        break
      case 'raster':
        setPaint(layer.id, 'raster-opacity', 0.35)
        break
    }
  }
}

interface HandlerRefs {
  onOriginChange: (coordinate: Coordinate) => void
  onParkSelect: (parkId: string) => void
  onLocationMessage: (message: string | null) => void
}

interface ParkMapProps {
  basemapStyle: string | StyleSpecification
  center: Coordinate
  cityName: string
  geojson: ParksGeoJson
  mapCredit: ReactNode
  origin: Coordinate | null
  parks: Park[]
  panelOpen: boolean
  selectedParkId: string | null
  visibleParkIds: readonly string[]
  zoom: number
  onOriginChange: (coordinate: Coordinate) => void
  onParkSelect: (parkId: string) => void
  onPanelToggle: () => void
  onLocationMessage: (message: string | null) => void
}

const parkIdsFilter = (ids: readonly string[]): FilterSpecification =>
  ids.length > 0
    ? ['in', ['get', 'id'], ['literal', ids]]
    : ['==', ['get', 'id'], '__none__']

const syncHighlightedParks = (
  map: MapLibreMap,
  highlightedParkIds: ParkIdsByWalkBand,
) => {
  for (const { minutes } of PARK_HIGHLIGHT_STYLES) {
    const filter = parkIdsFilter(highlightedParkIds[minutes])
    map.setFilter(`park-highlight-${minutes}`, filter)
    map.setFilter(`park-highlight-${minutes}-outline`, filter)
  }
}

const syncMapData = (
  map: MapLibreMap,
  geojson: ParksGeoJson,
  origin: Coordinate | null,
  highlightedParkIds: ParkIdsByWalkBand,
  updateParkSource: boolean,
) => {
  const parkSource = map.getSource('parks') as GeoJSONSource | undefined
  if (parkSource) {
    if (updateParkSource) parkSource.setData(geojson)
  } else {
    map.addSource('parks', { type: 'geojson', data: geojson })
    map.addLayer({
      id: 'park-fill',
      type: 'fill',
      source: 'parks',
      paint: {
        'fill-color': '#34c759',
        'fill-opacity': 0.07,
      },
    })
    map.addLayer({
      id: 'park-outline',
      type: 'line',
      source: 'parks',
      paint: {
        'line-color': '#34c759',
        'line-opacity': 0.2,
        'line-width': 0.7,
      },
    })
    for (const {
      minutes,
      color,
      fillOpacity,
      lineOpacity,
      lineWidth,
    } of PARK_HIGHLIGHT_STYLES) {
      const filter = parkIdsFilter(highlightedParkIds[minutes])
      map.addLayer({
        id: `park-highlight-${minutes}`,
        type: 'fill',
        source: 'parks',
        filter,
        paint: {
          'fill-color': color,
          'fill-opacity': fillOpacity,
        },
      })
      map.addLayer({
        id: `park-highlight-${minutes}-outline`,
        type: 'line',
        source: 'parks',
        filter,
        paint: {
          'line-color': color,
          'line-opacity': lineOpacity,
          'line-width': lineWidth,
        },
      })
    }
    map.addLayer({
      id: 'park-selected',
      type: 'line',
      source: 'parks',
      filter: ['==', ['get', 'id'], '__none__'],
      paint: {
        'line-color': '#0a0a0a',
        'line-width': 3,
      },
    })
  }
  syncHighlightedParks(map, highlightedParkIds)

  const bandData: WalkBandsGeoJson = origin
    ? buildWalkBands(origin)
    : { type: 'FeatureCollection', features: [] }
  const bandSource = map.getSource('distance-bands') as
    | GeoJSONSource
    | undefined
  if (bandSource) {
    bandSource.setData(bandData)
  } else {
    map.addSource('distance-bands', { type: 'geojson', data: bandData })
    map.addLayer(
      {
        id: 'distance-band-fill',
        type: 'fill',
        source: 'distance-bands',
        paint: {
          'fill-color': [
            'match',
            ['get', 'minutes'],
            5,
            '#dff5e4',
            10,
            '#bce9c5',
            '#8bd89c',
          ],
          'fill-opacity': 0.24,
        },
      },
      'park-fill',
    )
    map.addLayer(
      {
        id: 'distance-band-outline',
        type: 'line',
        source: 'distance-bands',
        paint: {
          'line-color': '#34c759',
          'line-opacity': 0.58,
          'line-width': 1.6,
        },
      },
      'park-fill',
    )
  }

  const mapShell = map.getContainer().parentElement
  if (mapShell) mapShell.dataset.renderedOrigin = origin?.join(',') ?? ''
}

export function ParkMap({
  basemapStyle,
  center,
  cityName,
  geojson,
  mapCredit,
  origin,
  parks,
  panelOpen,
  selectedParkId,
  visibleParkIds,
  zoom,
  onOriginChange,
  onParkSelect,
  onPanelToggle,
  onLocationMessage,
}: ParkMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const readyMapRef = useRef<MapLibreMap | null>(null)
  const syncedGeojsonRef = useRef<ParksGeoJson | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const bandLabelMarkersRef = useRef<Marker[]>([])
  const handlersRef = useRef<HandlerRefs>({
    onOriginChange,
    onParkSelect,
    onLocationMessage,
  })
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [centerLongitude, centerLatitude] = center
  const visibleParks = useMemo(() => {
    const visibleIds = new Set(visibleParkIds)
    return parks.filter((park) => visibleIds.has(park.id))
  }, [parks, visibleParkIds])
  const highlightedParkIds = useMemo<ParkIdsByWalkBand>(
    () =>
      origin
        ? findParkIdsIntersectingWalkBands(visibleParks, origin)
        : EMPTY_PARK_IDS_BY_WALK_BAND,
    [origin, visibleParks],
  )
  const latestDataRef = useRef({ geojson, highlightedParkIds, origin })

  latestDataRef.current = { geojson, highlightedParkIds, origin }
  handlersRef.current = {
    onOriginChange,
    onParkSelect,
    onLocationMessage,
  }

  useEffect(() => {
    if (!containerRef.current) return

    setMapReady(false)
    setMapError(null)
    const map = new MapLibreMap({
      container: containerRef.current,
      style: basemapStyle,
      center: [centerLongitude, centerLatitude],
      zoom,
      minZoom: 8,
      maxZoom: 19,
      attributionControl: false,
      cooperativeGestures: true,
    })
    mapRef.current = map
    let active = true

    const handleLoad = () => {
      if (!active) return
      if (
        cityName === 'Berlin' ||
        cityName === 'München' ||
        cityName === 'Stuttgart'
      ) {
        softenOfficialBasemap(map)
      }
      syncMapData(
        map,
        latestDataRef.current.geojson,
        latestDataRef.current.origin,
        latestDataRef.current.highlightedParkIds,
        true,
      )
      syncedGeojsonRef.current = latestDataRef.current.geojson
      readyMapRef.current = map
      setMapReady(true)
      setMapError(null)
    }

    const handleClick = (event: MapMouseEvent) => {
      const parkFeatures = map.getLayer('park-fill')
        ? map.queryRenderedFeatures(event.point, { layers: ['park-fill'] })
        : []
      const parkId = parkFeatures[0]?.properties?.id
      handlersRef.current.onOriginChange([
        event.lngLat.lng,
        event.lngLat.lat,
      ])
      handlersRef.current.onLocationMessage(null)
      if (parkId) handlersRef.current.onParkSelect(String(parkId))
    }

    const handleMouseMove = (event: MapMouseEvent) => {
      const hasPark =
        map.getLayer('park-fill') &&
        map.queryRenderedFeatures(event.point, { layers: ['park-fill'] })
          .length > 0
      map.getCanvas().style.cursor = hasPark ? 'pointer' : ''
    }

    const handleError = () => {
      if (active && readyMapRef.current !== map) {
        setMapError('Die Basiskarte konnte nicht geladen werden.')
      }
    }

    map.on('load', handleLoad)
    map.on('click', handleClick)
    map.on('mousemove', handleMouseMove)
    map.on('error', handleError)

    return () => {
      active = false
      bandLabelMarkersRef.current.forEach((marker) => marker.remove())
      bandLabelMarkersRef.current = []
      markerRef.current?.remove()
      markerRef.current = null
      map.remove()
      if (mapRef.current === map) mapRef.current = null
      if (readyMapRef.current === map) readyMapRef.current = null
      syncedGeojsonRef.current = null
    }
  }, [basemapStyle, centerLatitude, centerLongitude, cityName, zoom])

  useEffect(() => {
    const map = mapRef.current
    if (!map || readyMapRef.current !== map) return
    syncMapData(
      map,
      geojson,
      origin,
      highlightedParkIds,
      syncedGeojsonRef.current !== geojson,
    )
    syncedGeojsonRef.current = geojson
  }, [geojson, highlightedParkIds, mapReady, origin])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || readyMapRef.current !== map) return

    const filter: FilterSpecification =
      visibleParkIds.length > 0
        ? ['in', ['get', 'id'], ['literal', visibleParkIds]]
        : ['==', ['get', 'id'], '__none__']
    map.setFilter('park-fill', filter)
    map.setFilter('park-outline', filter)
  }, [mapReady, visibleParkIds])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || readyMapRef.current !== map) return
    map.setFilter('park-selected', [
      '==',
      ['get', 'id'],
      selectedParkId ?? '__none__',
    ])

    if (!selectedParkId) return
    const park = parks.find((item) => item.id === selectedParkId)
    if (!park) return
    const [west, south, east, north] = park.bounds
    if (west !== east && south !== north) {
      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        {
          padding: {
            top: 90,
            right: 72,
            bottom: window.innerWidth <= 760 ? window.innerHeight * 0.52 : 90,
            left: 72,
          },
          maxZoom: 15.5,
          duration: 700,
        },
      )
    } else {
      map.flyTo({ center: park.centroid, zoom: 14.5, duration: 700 })
    }
  }, [mapReady, parks, selectedParkId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || readyMapRef.current !== map) return

    bandLabelMarkersRef.current.forEach((marker) => marker.remove())
    bandLabelMarkersRef.current = []

    if (!origin) {
      markerRef.current?.remove()
      markerRef.current = null
      return
    }

    if (!markerRef.current) {
      const markerElement = document.createElement('div')
      markerElement.className = 'origin-marker'
      markerElement.dataset.testid = 'selected-origin'
      markerElement.setAttribute('aria-label', 'Gewählter Ausgangspunkt')
      markerElement.setAttribute('role', 'img')
      markerRef.current = new Marker({
        element: markerElement,
        draggable: true,
        anchor: 'center',
      })
        .setLngLat(origin)
        .addTo(map)
      markerRef.current.on('dragend', () => {
        const coordinate = markerRef.current?.getLngLat()
        if (!coordinate) return
        handlersRef.current.onOriginChange([coordinate.lng, coordinate.lat])
        handlersRef.current.onLocationMessage(null)
      })
    } else {
      markerRef.current.setLngLat(origin)
    }

    if (map.getZoom() < 12.25) {
      map.easeTo({
        center: origin,
        zoom: 12.75,
        duration: 600,
      })
    }

    bandLabelMarkersRef.current = MAP_WALK_BANDS.map(
      ({ minutes, distanceKm }) => {
        const element = document.createElement('span')
        element.className = 'distance-band-label'
        element.textContent = `${minutes} min`
        return new Marker({ element, anchor: 'bottom' })
          .setLngLat([
            origin[0] - distanceKm / 150,
            origin[1] + distanceKm / 111,
          ])
          .addTo(map)
      },
    )
  }, [mapReady, origin])

  const zoomBy = (delta: number) => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ zoom: map.getZoom() + delta, duration: 220 })
  }

  const useLocation = () => {
    if (!navigator.geolocation) {
      onLocationMessage('Dein Browser unterstützt keine Standortabfrage.')
      return
    }
    onLocationMessage('Standort wird ermittelt …')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinate: Coordinate = [
          position.coords.longitude,
          position.coords.latitude,
        ]
        onOriginChange(coordinate)
        onLocationMessage(null)
      },
      () => {
        onLocationMessage(
          'Der Standort war nicht verfügbar. Klicke stattdessen in die Karte.',
        )
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
    )
  }

  return (
    <section
      className="map-shell"
      data-testid="park-map"
      data-map-city={cityName}
      data-map-ready={mapReady ? 'true' : 'false'}
      data-highlighted-5-min={highlightedParkIds[5].length}
      data-highlighted-10-min={highlightedParkIds[10].length}
      data-highlighted-15-min={highlightedParkIds[15].length}
      data-highlighted-parks={highlightedParkIds[15].length}
      data-origin={origin?.join(',') ?? ''}
      aria-label={`Karte der Parks in ${cityName}`}
    >
      <div className="map-canvas" ref={containerRef} />
      <button
        aria-label={panelOpen ? 'Informationen ausblenden' : 'Informationen einblenden'}
        className="panel-toggle map-control"
        onClick={onPanelToggle}
        type="button"
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <div className="zoom-controls">
        <button
          aria-label="Karte vergrößern"
          className="map-control"
          onClick={() => zoomBy(1)}
          type="button"
        >
          <Plus aria-hidden="true" />
        </button>
        <button
          aria-label="Karte verkleinern"
          className="map-control"
          onClick={() => zoomBy(-1)}
          type="button"
        >
          <Minus aria-hidden="true" />
        </button>
      </div>
      <button
        aria-label="Meinen Standort verwenden"
        className="location-control map-control"
        onClick={useLocation}
        type="button"
      >
        <Crosshair aria-hidden="true" />
      </button>
      <div className="map-credit">{mapCredit}</div>
      {mapError ? (
        <p className="map-error" role="status">
          {mapError}
        </p>
      ) : null}
    </section>
  )
}
