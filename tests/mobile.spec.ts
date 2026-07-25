import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { bottomSheet } from './locators'

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 390, height: 844 },
})

test('mobile presents the park controls as a bottom sheet', async ({ page }) => {
  await page.goto('/?origin=13.40950,52.52080')

  await expect(page.locator('[data-testid="selected-origin"]')).toBeVisible()
  const map = page.getByTestId('park-map')
  const sheet = bottomSheet(page)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await expect(map).toBeVisible()
  await expect(sheet).toBeVisible()
  await expect
    .poll(async () => (await map.boundingBox())?.height ?? 0)
    .toBeGreaterThan(300)

  const [mapBox, sheetBox] = await Promise.all([map.boundingBox(), sheet.boundingBox()])
  expect(mapBox).not.toBeNull()
  expect(sheetBox).not.toBeNull()
  expect(sheetBox!.y).toBeGreaterThan(0)
  expect(sheetBox!.width).toBeGreaterThanOrEqual(360)
  expect(mapBox!.height).toBeGreaterThan(300)
  expect(mapBox!.y + mapBox!.height).toBeLessThanOrEqual(sheetBox!.y + 1)

  const metricButtons = page.getByTestId('metric-switcher').locator('button')
  await expect(metricButtons).toHaveCount(4)
  await expect(
    page.locator('[data-comparison-metric="access"]'),
  ).toHaveAttribute('aria-pressed', 'true')
  const metricButtonSizes = await metricButtons.evaluateAll((buttons) =>
    buttons.map((button) => {
      const bounds = button.getBoundingClientRect()
      return { width: bounds.width, height: bounds.height }
    }),
  )
  for (const size of metricButtonSizes) {
    expect(size.width).toBeGreaterThanOrEqual(44)
    expect(size.height).toBeGreaterThanOrEqual(44)
  }

  const railOverflow = await page
    .getByTestId('information-rail')
    .evaluate((rail) => ({
      clientWidth: rail.clientWidth,
      scrollWidth: rail.scrollWidth,
    }))
  expect(railOverflow.scrollWidth).toBeLessThanOrEqual(
    railOverflow.clientWidth,
  )
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)

  const treeCover = page.locator(
    '[data-comparison-metric="tree-cover"]',
  )
  await treeCover.click()
  await expect(treeCover).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.locator('[data-metric="tree-cover"] strong'),
  ).not.toHaveText('—')

  await page.waitForTimeout(3_000)
  const mapScreenshot = await map.screenshot()
  const mapStats = await sharp(mapScreenshot).stats()
  expect(mapStats.entropy).toBeGreaterThan(3)

  await page.locator('[data-city="cairo"]').click()
  await expect(page).toHaveURL(/(?:\?|&)city=cairo(?:&|$)/)
  await expect(page.getByText('Kairo im Überblick', { exact: true })).toBeVisible()
  await page.waitForTimeout(3_000)
  const cairoMapStats = await sharp(await map.screenshot()).stats()
  expect(cairoMapStats.entropy).toBeGreaterThan(3)
})
