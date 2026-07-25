import { expect, test } from '@playwright/test'
import {
  amenityFilter,
  appHeading,
  expectSelected,
  informationRail,
  locationButton,
  parkMap,
  searchInput,
  selectedOrigin,
} from './locators'

test('initial load renders the Berlin overview', async ({ page }) => {
  const response = await page.goto('/')

  expect(response?.ok()).toBeTruthy()
  await expect(page).toHaveTitle(/Parkblick/)
  await expect(appHeading(page)).toBeVisible()
  await expect(page.getByText('Berlin im Überblick', { exact: true })).toBeVisible()
  await expect(page.getByText('Parks in der Nähe', { exact: true })).toBeVisible()
  await expect(page.getByText(/Daten:\s*Land Berlin/i)).toBeVisible()
})

test('desktop shows an information rail beside the map', async ({ page }) => {
  await page.goto('/')

  const rail = informationRail(page)
  const map = parkMap(page)
  await expect(rail).toBeVisible()
  await expect(map).toBeVisible()
  await expect(page.getByText(/Karte:\s*basemap\.de/i)).toBeVisible()

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
  await expect(canvas).toBeVisible()
  await canvas.click({ position: { x: 500, y: 400 } })
  await expect(selectedOrigin(page)).toBeVisible()
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
  await page.route('**/data/summary.json*', async (route) => {
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
