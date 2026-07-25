import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

export const appHeading = (page: Page) =>
  page
    .getByRole('heading', { name: 'Parkblick', exact: true })
    .or(page.getByText('Parkblick', { exact: true }))
    .first()

export const informationRail = (page: Page) =>
  page.getByTestId('information-rail').or(page.locator('aside')).first()

export const parkMap = (page: Page) =>
  page
    .getByTestId('park-map')
    .or(page.getByRole('region', { name: /karte/i }))
    .or(page.locator('.maplibregl-map'))
    .first()

export const searchInput = (page: Page) =>
  page
    .getByRole('searchbox', { name: /park oder bezirk/i })
    .or(page.getByRole('textbox', { name: /park oder bezirk/i }))
    .or(page.getByPlaceholder(/park oder bezirk/i))
    .first()

export const amenityFilter = (page: Page, name: string) =>
  page
    .getByRole('button', { name, exact: true })
    .first()

export const locationButton = (page: Page) =>
  page
    .getByRole('button', { name: /standort|position/i })
    .or(page.getByLabel(/standort|position/i))
    .first()

export const selectedOrigin = (page: Page) =>
  page
    .getByTestId('selected-origin')
    .or(page.locator('[aria-label*="Gewählter Standort" i]'))
    .or(page.locator('.selected-origin, .origin-marker'))
    .first()

export const bottomSheet = (page: Page) =>
  page
    .getByTestId('bottom-sheet')
    .or(page.locator('[aria-label*="Parkinformationen" i]'))
    .or(page.locator('.bottom-sheet'))
    .first()

export async function expectSelected(control: Locator) {
  const tagName = await control.evaluate((element) => element.tagName)

  if (tagName === 'INPUT') {
    await expect(control).toBeChecked()
    return
  }

  const ariaPressed = await control.getAttribute('aria-pressed')
  if (ariaPressed !== null) {
    expect(ariaPressed).toBe('true')
    return
  }

  const ariaChecked = await control.getAttribute('aria-checked')
  if (ariaChecked !== null) {
    expect(ariaChecked).toBe('true')
    return
  }

  await expect(control).toHaveClass(/active|selected|is-active/)
}
