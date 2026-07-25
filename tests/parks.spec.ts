import { expect, test, type Page } from '@playwright/test'
import {
  buildWalkBands,
  findParkIdsIntersectingWalkBands,
} from '../src/lib/walk-bands'
import {
  normalizeParkData,
  type Park,
  type WalkBandMinutes,
} from '../src/lib/parks'
import {
  amenityFilter,
  appHeading,
  expectSelected,
  informationRail,
  locationButton,
  searchInput,
  selectedOrigin,
} from './locators'

const COMPARISON_METRICS = [
  'access',
  'green-share',
  'green-per-person',
  'tree-cover',
] as const

const parseDisplayedNumber = (value: string | null): number => {
  const normalized = (value ?? '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '')
  return normalized ? Number(normalized) : Number.NaN
}

const expectFiniteOverviewMetrics = async (page: Page) => {
  const overview = page.getByTestId('comparison-metrics')
  await expect(overview.locator('[data-metric]')).toHaveCount(4)

  for (const metric of COMPARISON_METRICS) {
    const tile = overview.locator(`[data-metric="${metric}"]`)
    await expect(tile).toBeVisible()
    const value = parseDisplayedNumber(
      await tile.locator('strong').textContent(),
    )
    expect(Number.isFinite(value), `${metric} overview value`).toBe(true)
  }
}

const expectCardsRankedDescending = async (page: Page) => {
  const cards = page.locator('.city-card')
  await expect(cards).toHaveCount(9)
  const entries = await cards.evaluateAll((items) =>
    items.map((item) => ({
      rank: Number(item.getAttribute('data-rank')),
      value: item
        .querySelector('[data-testid="city-card-value"]')
        ?.textContent?.trim(),
    })),
  )
  const values = entries.map((entry) => parseDisplayedNumber(entry.value ?? null))

  expect(entries.map((entry) => entry.rank)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9,
  ])
  expect(values.every(Number.isFinite)).toBe(true)
  for (let index = 1; index < values.length; index += 1) {
    expect(values[index - 1]).toBeGreaterThanOrEqual(values[index])
  }
}

const parkAtBandEdge = (
  id: string,
  minutes: WalkBandMinutes,
  origin: [number, number],
): Park => {
  const band = buildWalkBands(origin).features.find(
    (feature) => feature.properties.minutes === minutes,
  )
  if (!band) throw new Error(`Missing ${minutes}-minute band`)
  const edge = band.geometry.coordinates[0].reduce((eastmost, coordinate) =>
    coordinate[0] > eastmost[0] ? coordinate : eastmost,
  )
  const epsilon = 0.00001
  const bounds: [number, number, number, number] = [
    edge[0] - epsilon,
    edge[1] - epsilon,
    edge[0] + epsilon,
    edge[1] + epsilon,
  ]

  return {
    id,
    name: id,
    nameAddon: '',
    district: '',
    locality: '',
    type: '',
    areaM2: 1,
    centroid: [edge[0], edge[1]],
    bounds,
    dedicated: false,
    amenities: {
      playground: false,
      drinkingFountain: false,
      toilet: false,
      dogRun: false,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [bounds[0], bounds[1]],
          [bounds[2], bounds[1]],
          [bounds[2], bounds[3]],
          [bounds[0], bounds[3]],
          [bounds[0], bounds[1]],
        ],
      ],
    },
  }
}

test('walk bands highlight parks touched at each exact circle edge', () => {
  const origin: [number, number] = [13.405, 52.52]
  const parks = [
    parkAtBandEdge('five', 5, origin),
    parkAtBandEdge('ten', 10, origin),
    parkAtBandEdge('fifteen', 15, origin),
  ]
  const outerBand = buildWalkBands(origin).features.find(
    (feature) => feature.properties.minutes === 15,
  )
  if (!outerBand) throw new Error('Missing outer band')
  const outerEast = Math.max(
    ...outerBand.geometry.coordinates[0].map(([longitude]) => longitude),
  )
  const outside = parkAtBandEdge('outside', 15, origin)
  const shift = outerEast - outside.bounds[0] + 0.00001
  outside.bounds = outside.bounds.map((value, index) =>
    index % 2 === 0 ? value + shift : value,
  ) as Park['bounds']
  if (outside.geometry?.type === 'Polygon') {
    outside.geometry.coordinates = outside.geometry.coordinates.map((ring) =>
      ring.map(([longitude, latitude]) => [longitude + shift, latitude]),
    )
  }

  const ids = findParkIdsIntersectingWalkBands([...parks, outside], origin)

  expect(ids[5]).toEqual(['five'])
  expect(ids[10]).toEqual(['five', 'ten'])
  expect(ids[15]).toEqual(['five', 'ten', 'fifteen'])
})

test('park bounds come from exact geometry rather than rounded metadata', () => {
  const geometry = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [13.400004, 52.500004],
        [13.410006, 52.500004],
        [13.410006, 52.510006],
        [13.400004, 52.510006],
        [13.400004, 52.500004],
      ],
    ],
  }
  const data = normalizeParkData(
    { items: [{ id: 'precise', bounds: [13.4, 52.5, 13.41, 52.51] }] },
    {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            id: 'precise',
            bounds: [13.4, 52.5, 13.41, 52.51],
          },
          geometry,
        },
      ],
    },
    {},
  )

  expect(data.parks[0].bounds).toEqual([
    13.400004, 52.500004, 13.410006, 52.510006,
  ])
})

test('initial load renders the Berlin overview', async ({ page }) => {
  const response = await page.goto('/')

  expect(response?.ok()).toBeTruthy()
  await expect(page).toHaveTitle(/Berlin · Parks & Stadtgrün/)
  await expect(appHeading(page)).toBeVisible()
  await expect(page.getByText('Berlin im Überblick', { exact: true })).toBeVisible()
  await expect(page.getByText('Parks in der Nähe', { exact: true })).toBeVisible()
  await expect(page.getByText(/Daten:\s*Land Berlin/i)).toBeVisible()
  const switcher = page.getByTestId('metric-switcher')
  await expect(switcher.locator('button')).toHaveCount(4)
  for (const metric of COMPARISON_METRICS) {
    await expect(
      switcher.locator(`[data-comparison-metric="${metric}"]`),
    ).toBeVisible()
  }
  await expect(
    switcher.locator('[data-comparison-metric="access"]'),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    switcher.locator('[data-comparison-metric="green-share"]'),
  ).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-metric="access"]')).toContainText(
    /Zugang zu Grünflächen in 10 Gehminuten/,
  )
  await expectFiniteOverviewMetrics(page)
  await expectCardsRankedDescending(page)

  const disclosure = page.locator('.source-disclosure')
  await disclosure.locator('summary').click()
  await expect(disclosure).toContainText(/harmonisierte Definitionen/i)
  await expect(disclosure).toContainText(/gemeinsame OSM-Flächenmodell/i)
})

test('loads Vienna directly and keeps the selected city in the URL', async ({
  page,
}) => {
  await page.goto('/?city=vienna')

  await expect(page).toHaveTitle(/Wien · Parks & Stadtgrün/)
  await expect(page.getByText('Wien im Überblick', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Wien\b/ })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page).toHaveURL(/(?:\?|&)city=vienna(?:&|$)/)
  await expect(page.getByText(/Daten:\s*Stadt Wien/i)).toBeVisible()
  await expect(page.locator('[data-metric="access"]')).toContainText(
    /Zugang zu Grünflächen in 10 Gehminuten/,
  )
  await expectFiniteOverviewMetrics(page)
  await expect(page.getByTestId('park-map')).toHaveAttribute(
    'aria-label',
    'Karte der Parks in Wien',
  )
  await searchInput(page).fill('Kongreßpark')
  await expect(page.locator('.park-result').first()).toContainText(
    'Kongreßpark',
  )
})

test('loads every added city from the comparison rail', async ({ page }) => {
  test.setTimeout(90_000)
  const cities = [
    ['munich', 'München'],
    ['stuttgart', 'Stuttgart'],
    ['madrid', 'Madrid'],
    ['barcelona', 'Barcelona'],
    ['paris', 'Paris'],
    ['copenhagen', 'Kopenhagen'],
    ['cairo', 'Kairo'],
  ] as const
  const parkFiles: string[] = []
  page.on('request', (request) => {
    if (/\/data\/[^/]+\/parks\.geojson/.test(request.url())) {
      parkFiles.push(request.url())
    }
  })

  await page.goto('/?city=munich')
  for (const [cityId, cityName] of cities) {
    if (cityId !== 'munich') {
      await page.locator(`[data-city="${cityId}"]`).click()
    }
    await expect(
      page.getByText(`${cityName} im Überblick`, { exact: true }),
    ).toBeVisible()
    await expect(page).toHaveURL(
      new RegExp(`(?:\\?|&)city=${cityId}(?:&|$)`),
    )
    await expectFiniteOverviewMetrics(page)
    await expect(page.locator('.amenity-button')).toHaveCount(4)
    for (const amenity of [
      'Spielplatz',
      'Trinkbrunnen',
      'Toilette',
      'Hundeauslauf',
    ]) {
      await expect(amenityFilter(page, amenity)).toBeVisible()
    }
    await expect
      .poll(
        () =>
          parkFiles.filter((url) =>
            url.includes(`/data/${cityId}/parks.geojson`),
          ).length,
      )
      .toBe(1)
  }

  await expect(page.locator('.city-card')).toHaveCount(9)
  await expect(page.locator('.amenity-fieldset')).toBeVisible()
})

test('comparison metrics re-rank cities without changing the selected city', async ({
  page,
}) => {
  const parkFiles: string[] = []
  page.on('request', (request) => {
    if (/\/data\/[^/]+\/parks\.geojson/.test(request.url())) {
      parkFiles.push(request.url())
    }
  })

  await page.goto('/?city=vienna')
  await expect(page.getByText('Wien im Überblick', { exact: true })).toBeVisible()
  const selectedUrl = page.url()
  await expectCardsRankedDescending(page)
  const orders: string[][] = [
    await page
      .locator('.city-card')
      .evaluateAll((cards) =>
        cards.map((card) => card.getAttribute('data-city') ?? ''),
      ),
  ]

  for (const metric of COMPARISON_METRICS.slice(1)) {
    const control = page.locator(
      `[data-comparison-metric="${metric}"]`,
    )
    await control.click()
    await expect(control).toHaveAttribute('aria-pressed', 'true')
    await expectCardsRankedDescending(page)
    await expectFiniteOverviewMetrics(page)
    orders.push(
      await page
        .locator('.city-card')
        .evaluateAll((cards) =>
          cards.map((card) => card.getAttribute('data-city') ?? ''),
        ),
    )
    await expect(
      page.locator('.city-card[data-city="vienna"]'),
    ).toHaveAttribute('aria-current', 'page')
    await expect(page).toHaveURL(selectedUrl)
  }

  expect(new Set(orders.map((order) => order.join(','))).size).toBeGreaterThan(1)
  await expect
    .poll(
      () =>
        parkFiles.filter((url) => url.includes('/data/vienna/parks.geojson'))
          .length,
    )
    .toBe(1)
  expect(
    parkFiles.every((url) => url.includes('/data/vienna/parks.geojson')),
  ).toBe(true)
})

test('a Munich map click highlights parks after selecting a search result', async ({
  page,
}) => {
  await page.goto('/?city=munich')

  const map = page.getByTestId('park-map')
  const canvas = page.locator('.maplibregl-canvas')
  await expect(canvas).toBeVisible()
  await expect(map).toHaveAttribute('data-map-ready', 'true')

  await searchInput(page).fill('Westpark')
  const result = page.locator('.park-result').first()
  await expect(result).toContainText('Westpark')
  await result.click()

  await page.waitForTimeout(1_000)
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  await canvas.click({
    position: {
      x: Math.round(bounds!.width / 2),
      y: Math.round(bounds!.height / 2),
    },
  })

  await expect(selectedOrigin(page)).toBeVisible()
  await expect
    .poll(async () => Number(await map.getAttribute('data-highlighted-parks')))
    .toBeGreaterThan(0)
})

test('switches cities without downloading both park files up front', async ({
  page,
}) => {
  const parkFiles: string[] = []
  page.on('request', (request) => {
    if (/\/data\/[^/]+\/parks\.geojson/.test(request.url())) {
      parkFiles.push(request.url())
    }
  })

  await page.goto('/')
  await expect(page.getByText('Berlin im Überblick', { exact: true })).toBeVisible()
  await expect.poll(() => parkFiles.filter((url) => url.includes('/berlin/')).length).toBe(1)
  expect(parkFiles.some((url) => !url.includes('/berlin/'))).toBe(false)

  await page.getByRole('button', { name: /^Wien\b/ }).click()
  await expect(page.getByText('Wien im Überblick', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/(?:\?|&)city=vienna(?:&|$)/)
  await expect.poll(() => parkFiles.filter((url) => url.includes('/vienna/')).length).toBe(1)
})

test('desktop shows an information rail beside the map', async ({ page }) => {
  await page.goto('/')

  const rail = informationRail(page)
  const map = page.getByTestId('park-map')
  await expect(rail).toBeVisible()
  await expect(map).toBeVisible()
  await expect(
    page.getByText('Karte: basemap.de', { exact: true }),
  ).toBeVisible()

  const [railBox, mapBox] = await Promise.all([rail.boundingBox(), map.boundingBox()])
  expect(railBox).not.toBeNull()
  expect(mapBox).not.toBeNull()
  expect(mapBox!.x).toBeGreaterThan(railBox!.x)
  expect(mapBox!.width).toBeGreaterThan(railBox!.width)
})

test('search and amenity filters update their visible state', async ({ page }) => {
  await page.goto('/')

  const search = searchInput(page)
  await expect(search).toBeVisible()
  await search.fill('Tiergarten')
  await expect(page.getByText(/Tiergarten/i).first()).toBeVisible()

  const playground = amenityFilter(page, 'Spielplatz')
  await expect(playground).toBeVisible()
  await playground.click()
  await expectSelected(playground)
})

test('rejects unsafe URL origins without blanking the app', async ({ page }) => {
  for (const origin of ['13.4,95', ',']) {
    await page.goto(`/?origin=${encodeURIComponent(origin)}`)

    await expect(appHeading(page)).toBeVisible()
    await expect(page).not.toHaveURL(/(?:\?|&)origin=/)
  }
})

test('ranks a park by its boundary rather than its centroid', async ({
  page,
}) => {
  await page.goto('/?origin=13.33300,52.51300')

  await expect(page.locator('.park-result').first()).toContainText(
    'Großer Tiergarten',
  )
  await expect(page.locator('.park-result').first()).toContainText('vor Ort')
  await expect(page).not.toHaveURL(/(?:\?|&)origin=/)
})

test('a map click always chooses an origin', async ({ page }) => {
  await page.goto('/')

  const canvas = page.locator('.maplibregl-canvas')
  const map = page.getByTestId('park-map')
  await expect(canvas).toBeVisible()
  await canvas.click({ position: { x: 500, y: 400 } })
  await expect(selectedOrigin(page)).toBeVisible()
  await expect
    .poll(async () => Number(await map.getAttribute('data-highlighted-parks')))
    .toBeGreaterThan(0)

  const [fiveMinutes, tenMinutes, fifteenMinutes] = await Promise.all([
    map.getAttribute('data-highlighted-5-min'),
    map.getAttribute('data-highlighted-10-min'),
    map.getAttribute('data-highlighted-15-min'),
  ]).then((values) => values.map(Number))
  expect(fiveMinutes).toBeLessThanOrEqual(tenMinutes)
  expect(tenMinutes).toBeLessThanOrEqual(fifteenMinutes)

  const firstOrigin = await map.getAttribute('data-origin')
  expect(firstOrigin).toBeTruthy()
  await canvas.click({ position: { x: 620, y: 320 } })
  await expect
    .poll(async () => {
      const currentOrigin = await map.getAttribute('data-origin')
      return currentOrigin && currentOrigin !== firstOrigin
    })
    .toBeTruthy()
  await expect
    .poll(async () => {
      const [currentOrigin, renderedOrigin] = await Promise.all([
        map.getAttribute('data-origin'),
        map.getAttribute('data-rendered-origin'),
      ])
      return renderedOrigin === currentOrigin
    })
    .toBe(true)
})

test('a shared park selection remains visible without an origin', async ({
  page,
}) => {
  await page.goto('/?park=00008100%3A0014bc1d')

  await expect(page.locator('.park-result').first()).toContainText(
    'Großer Tiergarten',
  )
  await expect(page.locator('.park-result').first()).toHaveAttribute(
    'data-selected',
  )
})

test('rejects mixed data snapshot generations after one retry', async ({
  page,
}) => {
  let summaryRequests = 0
  await page.route('**/data/berlin/summary.json*', async (route) => {
    summaryRequests += 1
    const response = await route.fetch()
    const summary = (await response.json()) as Record<string, unknown>
    await route.fulfill({
      response,
      json: { ...summary, generatedAt: '2000-01-01T00:00:00.000Z' },
    })
  })

  await page.goto('/')

  await expect(page.locator('.inline-status')).toContainText(
    'nicht konsistent geladen',
  )
  expect(summaryRequests).toBe(2)
})

test.describe('selected origin', () => {
  test.use({
    geolocation: { latitude: 52.5208, longitude: 13.4095 },
    permissions: ['geolocation'],
  })

  test('uses opt-in geolocation and exposes the selected origin', async ({ page }) => {
    await page.goto('/')

    await locationButton(page).click()
    await expect(selectedOrigin(page)).toBeVisible()
    await expect(page.getByText('Parks in der Nähe', { exact: true })).toBeVisible()
    expect(new URL(page.url()).searchParams.has('origin')).toBe(false)
  })
})
