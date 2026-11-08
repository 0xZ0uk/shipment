import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

// Site search (#157): publishing a page indexes it in the background (SEO_D1, FTS5); the
// header's palette and `/search` find it, and deleting the page removes it.

const stamp = Date.now()
// A word no other page has: the stamp's digits as letters (the tokenizer splits digits off).
const word = `zq${[...String(stamp)].map((d) => 'abcdefghij'[Number(d)]).join('')}`
const slug = `e2e-search-${stamp}`
const title = `Search E2E ${stamp}`

const layout = [
  {
    blockType: 'richText',
    richText: {
      root: {
        type: 'root',
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'paragraph',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            textFormat: 0,
            children: [
              {
                type: 'text',
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: `Marmalade for quokkas, also known as ${word}.`,
                version: 1,
              },
            ],
          },
        ],
      },
    },
  },
]

const searchFor = async (api: APIRequestContext, q: string) => {
  const response = await api.get(`/api/search?q=${encodeURIComponent(q)}`)
  expect(response.ok()).toBe(true)
  expect(response.headers()['cache-control']).toBe('private, no-cache')
  return ((await response.json()) as { results: { path: string; title: string }[] }).results
}

test.describe('Site search', () => {
  let context: BrowserContext
  let api: APIRequestContext
  let pageId: number | undefined

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()
    context = await browser.newContext()
    api = context.request
    await login({ page: await context.newPage(), user: testUser })

    const created = await api.post('/api/pages', {
      data: { title, slug, _status: 'published', layout },
    })
    expect(created.ok(), await created.text()).toBe(true)
    pageId = (await created.json()).doc.id

    // The index is written after the save returns.
    await expect
      .poll(async () => (await searchFor(api, word)).map((r) => r.path), { timeout: 15_000 })
      .toEqual([`/${slug}`])
  })

  test.afterAll(async () => {
    if (pageId !== undefined) {
      const response = await api.delete(`/api/pages/${pageId}`)
      expect([200, 404]).toContain(response.status())
      await expect
        .poll(async () => (await searchFor(api, word)).length, { timeout: 15_000 })
        .toBe(0)
    }
    await context.close()
    await cleanupTestUser()
  })

  test('the header palette finds a page and opens it', async ({ page }) => {
    await page.goto('/')
    // Before hydration the button is a plain link to `/search`; the shortcut hint marks hydration.
    const button = page.getByRole('link', { name: /Search/ })
    await expect(button.locator('kbd')).toBeVisible()
    await button.click()

    const dialog = page.getByRole('dialog', { name: 'Search the site' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('combobox', { name: 'Search the site' }).fill(word.slice(0, -2))

    const result = dialog.getByRole('option', { name: new RegExp(title) })
    await expect(result).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: '1 result for' })).toBeAttached()
    await expect(result.locator('mark')).toHaveText(word)

    // The first result is selected: Enter opens it.
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(`/${slug}`)
    await expect(dialog).toBeHidden()
  })

  test('Ctrl+K opens the palette, and it links to the full results', async ({ page }) => {
    await page.goto('/')
    // The shortcut hint appears once the button has hydrated.
    await expect(page.getByRole('link', { name: /Search/ }).locator('kbd')).toBeVisible()
    await page.keyboard.press('Control+K')

    const dialog = page.getByRole('dialog', { name: 'Search the site' })
    await dialog.getByRole('combobox').fill(word)
    await dialog.getByRole('option', { name: /See all results/ }).click()

    await expect(page).toHaveURL(`/search?q=${word}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible()
  })

  test('/search?q= lists the results without JavaScript', async ({ browser }) => {
    const noJs = await browser.newContext({ javaScriptEnabled: false })
    const page = await noJs.newPage()

    const response = await page.goto(`/search?q=${word}`)
    expect(response?.headers()['cache-control']).toBe('private, no-cache')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    await expect(page.getByText('1 result for')).toBeVisible()

    await page.getByRole('link', { name: title }).click()
    await expect(page).toHaveURL(`/${slug}`)

    // The header's search button is a plain link to the search page, and its form submits.
    await page.getByRole('link', { name: 'Search' }).click()
    await expect(page).toHaveURL('/search')
    await page.getByRole('searchbox', { name: 'Search the site' }).fill('marmalade quokka')
    await page.getByRole('button', { name: 'Search' }).click()
    await expect(page).toHaveURL(/\/search\?q=marmalade\+quokka/)
    await expect(page.getByRole('link', { name: title })).toBeVisible()

    await noJs.close()
  })
})
