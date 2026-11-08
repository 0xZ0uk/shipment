import { expect, test, type Page } from '@playwright/test'

// Cookie consent (Basic mode): nothing from Google loads until the visitor accepts. The dev
// server runs with a fake GA id (`GA_MEASUREMENT_ID` in playwright.config.ts), and every request
// to Google is answered here, so nothing leaves the machine.

// Start without the refused-consent cookie the other specs get.
test.use({ storageState: { cookies: [], origins: [] } })

const GOOGLE = /googletagmanager\.com|google-analytics\.com/

/** Answers every request to Google locally, and returns the list of their URLs. */
const interceptGoogle = async (page: Page) => {
  const requests: string[] = []
  await page.context().route(GOOGLE, (route) => {
    requests.push(route.request().url())
    return route.fulfill({ body: '', contentType: 'application/javascript', status: 200 })
  })
  return requests
}

const banner = (page: Page) => page.getByRole('dialog', { name: 'Cookies' })

const consentCookie = async (page: Page) =>
  (await page.context().cookies()).find((cookie) => cookie.name === 'cookie_consent')

test.describe('Cookie consent', () => {
  test('loads nothing from Google before accepting, then gtag.js once', async ({ page }) => {
    const requests = await interceptGoogle(page)

    await page.goto('/')
    await expect(banner(page)).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(requests).toEqual([])
    await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0)

    await banner(page).getByRole('button', { name: 'Accept' }).click()
    await expect(banner(page)).toBeHidden()
    await expect.poll(() => requests.length).toBe(1)
    expect(requests[0]).toContain('googletagmanager.com/gtag/js?id=G-TESTE2E0000')

    const cookie = await consentCookie(page)
    expect(cookie?.value).toBe('granted')
    expect(cookie?.path).toBe('/')
    expect(cookie?.sameSite).toBe('Lax')
    expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000 + 170 * 24 * 60 * 60)

    // A returning visitor gets gtag.js without the banner.
    await page.reload()
    await expect.poll(() => requests.length).toBe(2)
    await expect(banner(page)).toBeHidden()
  })

  test('reject persists across reloads and navigation', async ({ page }) => {
    const requests = await interceptGoogle(page)

    await page.goto('/')
    await banner(page).getByRole('button', { name: 'Reject' }).click()
    await expect(banner(page)).toBeHidden()
    expect((await consentCookie(page))?.value).toBe('denied')

    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(banner(page)).toBeHidden()

    // A page without GA (a 404), then client-side navigation back to one with it.
    await page.goto('/this-page-does-not-exist')
    await expect(page.locator('h1').first()).toHaveText('404')
    await page.locator('header').getByRole('link').first().click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('h1').first()).toHaveText('Shipment')
    await page.waitForLoadState('networkidle')
    await expect(banner(page)).toBeHidden()

    expect(requests).toEqual([])
  })

  test('the footer link reopens the banner', async ({ page }) => {
    const requests = await interceptGoogle(page)

    await page.goto('/')
    await banner(page).getByRole('button', { name: 'Reject' }).click()
    await expect(banner(page)).toBeHidden()

    const settings = page.locator('footer').getByRole('button', { name: 'Cookie settings' })
    await settings.click()
    await expect(banner(page)).toBeVisible()
    await expect(banner(page)).toBeFocused()

    // Escape closes it without changing the choice, and focus goes back to the link.
    await page.keyboard.press('Escape')
    await expect(banner(page)).toBeHidden()
    await expect(settings).toBeFocused()
    expect((await consentCookie(page))?.value).toBe('denied')

    // Changing the choice from there loads gtag.js.
    await settings.click()
    await banner(page).getByRole('button', { name: 'Accept' }).click()
    await expect.poll(() => requests.length).toBe(1)
  })
})
