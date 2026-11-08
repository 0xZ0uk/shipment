import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

// A second locale end to end (#158), on a dev server with `LOCALES=en,pt`
// (playwright.locales.config.ts): prefixed routes, hreflang in the head and the sitemap, the
// language menu, fallback views, posts, search, and on-page editing in Portuguese.

const stamp = Date.now()
const slug = `e2e-locale-${stamp}`
const fallbackSlug = `e2e-locale-fallback-${stamp}`
const postSlug = `e2e-locale-post-${stamp}`

const EN = 'Kayak tours along the coast'
const PT = 'Passeios de caiaque pela costa'
const EN_ONLY = 'Ferry timetables for the islands'
const EN_POST = 'Packing for a paddle'
const PT_POST = 'Preparar a mochila para remar'
const PT_EDIT = 'Ao nascer do sol. '

const paragraph = (text: string) => ({
  type: 'paragraph',
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
  textFormat: 0,
  children: [{ type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text, version: 1 }],
})
const richText = (text: string) => ({
  root: { type: 'root', direction: 'ltr', format: '', indent: 0, version: 1, children: [paragraph(text)] },
})
const layout = (text: string) => [{ blockType: 'richText', richText: richText(text) }]

const headOf = async (page: Page) =>
  page.evaluate(() => ({
    lang: document.documentElement.lang,
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
    robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null,
    ogLocale: document.querySelector('meta[property="og:locale"]')?.getAttribute('content') ?? null,
    alternates: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((link) => [
      link.getAttribute('hreflang'),
      link.getAttribute('href'),
    ]),
  }))

test.describe('A second locale', () => {
  let context: BrowserContext
  let admin: Page
  let api: APIRequestContext
  let baseURL: string
  const ids: { collection: string; id: number }[] = []

  const create = async (collection: string, data: Record<string, unknown>) => {
    const response = await api.post(`/api/${collection}`, { data })
    expect(response.ok(), await response.text()).toBe(true)
    const id = (await response.json()).doc.id as number
    ids.push({ collection, id })
    return id
  }

  const translate = async (collection: string, id: number, data: Record<string, unknown>) => {
    const response = await api.patch(`/api/${collection}/${id}?locale=pt`, { data })
    expect(response.ok(), await response.text()).toBe(true)
  }

  test.beforeAll(async ({ browser }) => {
    baseURL = test.info().project.use.baseURL!
    await seedTestUser()
    context = await browser.newContext()
    admin = await context.newPage()
    api = context.request
    await login({ page: admin, user: testUser })

    // Through the REST API as the admin, so the dev server does every write itself.
    const pageId = await create('pages', {
      title: 'Kayak tours',
      slug,
      _status: 'published',
      layout: layout(EN),
    })
    // Published in Portuguese too: Payload keeps `_status` per locale.
    await translate('pages', pageId, {
      title: 'Passeios de caiaque',
      _status: 'published',
      layout: layout(PT),
    })
    await create('pages', {
      title: 'Ferries',
      slug: fallbackSlug,
      _status: 'published',
      layout: layout(EN_ONLY),
    })
    const postId = await create('posts', {
      title: EN_POST,
      slug: postSlug,
      _status: 'published',
      content: richText('Bring water.'),
    })
    await translate('posts', postId, {
      title: PT_POST,
      _status: 'published',
      content: richText('Leve água.'),
    })
  })

  test.afterAll(async () => {
    for (const { collection, id } of ids.reverse()) {
      const response = await api.delete(`/api/${collection}/${id}`)
      expect([200, 404]).toContain(response.status())
    }
    await context.close()
    await cleanupTestUser()
  })

  test('serves a page in both locales, with hreflang and x-default', async ({ page }) => {
    await page.goto(`/${slug}`)
    await expect(page.getByText(EN)).toBeVisible()
    expect(await headOf(page)).toEqual({
      lang: 'en',
      canonical: `${baseURL}/${slug}`,
      robots: null,
      ogLocale: 'en',
      alternates: [
        ['en', `${baseURL}/${slug}`],
        ['pt', `${baseURL}/pt/${slug}`],
        ['x-default', `${baseURL}/${slug}`],
      ],
    })

    await page.goto(`/pt/${slug}`)
    await expect(page.getByText(PT)).toBeVisible()
    await expect(page.getByText(EN)).toHaveCount(0)
    const pt = await headOf(page)
    expect(pt).toMatchObject({ lang: 'pt', canonical: `${baseURL}/pt/${slug}`, robots: null })
    expect(pt.ogLocale).toBe('pt')
    expect(pt.alternates).toHaveLength(3)
  })

  test('the language menu links to the same page in the other locale', async ({ page }) => {
    await page.goto(`/${slug}`)
    // The menu opens once the page has hydrated.
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Language: English' }).click()
    const portuguese = page.getByRole('menuitem', { name: 'Português' })
    await expect(portuguese).toHaveAttribute('href', `/pt/${slug}`)
    await portuguese.click()
    await expect(page).toHaveURL(`${baseURL}/pt/${slug}`)
    await expect(page.getByText(PT)).toBeVisible()

    // And back, from the Portuguese page.
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Language: Português' }).click()
    await page.getByRole('menuitem', { name: 'English' }).click()
    await expect(page).toHaveURL(`${baseURL}/${slug}`)
    await expect(page.getByText(EN)).toBeVisible()
  })

  test("internal links stay in the visitor's locale", async ({ page }) => {
    await page.goto(`/pt/${slug}`)
    // The header's logo links home, in Portuguese.
    await expect(page.getByRole('link', { name: /home$/ }).first()).toHaveAttribute('href', '/pt')
  })

  test("an untranslated page shows the default locale's content, pointing at it", async ({
    page,
  }) => {
    const response = await page.goto(`/pt/${fallbackSlug}`)
    expect(response?.status()).toBe(200)
    await expect(page.getByText(EN_ONLY)).toBeVisible()
    expect(await headOf(page)).toEqual({
      lang: 'pt',
      canonical: `${baseURL}/${fallbackSlug}`,
      robots: 'noindex',
      ogLocale: 'en',
      alternates: [],
    })
    // The content is marked as English inside the Portuguese page.
    await expect(page.locator('main [lang="en"]').getByText(EN_ONLY)).toBeVisible()
  })

  test('unknown prefixes and the default prefix are 404s', async ({ request }) => {
    for (const path of [`/xx/${slug}`, `/en/${slug}`, '/pt/admin']) {
      expect((await request.get(path)).status(), path).toBe(404)
    }
  })

  test('serves a translated post under /pt/blog/, listed in the Portuguese archive', async ({
    page,
  }) => {
    await page.goto(`/pt/blog/${postSlug}`)
    await expect(page.getByRole('heading', { level: 1, name: PT_POST })).toBeVisible()
    expect((await headOf(page)).alternates).toContainEqual(['pt', `${baseURL}/pt/blog/${postSlug}`])

    await page.goto('/pt/blog')
    await expect(page.getByRole('link', { name: PT_POST })).toHaveAttribute(
      'href',
      `/pt/blog/${postSlug}`,
    )
    await page.goto('/blog')
    await expect(page.getByRole('link', { name: EN_POST })).toHaveAttribute('href', `/blog/${postSlug}`)
  })

  test('lists each published locale in the sitemap, with alternates', async ({ request }) => {
    const xml = await (await request.get('/sitemap.xml')).text()
    const block = (loc: string) =>
      xml.split('<url>').find((part) => part.includes(`<loc>${loc}</loc>`)) ?? ''

    const pt = block(`${baseURL}/pt/${slug}`)
    expect(pt).toContain(`hreflang="en" href="${baseURL}/${slug}"`)
    expect(pt).toContain(`hreflang="pt" href="${baseURL}/pt/${slug}"`)
    expect(pt).toContain(`hreflang="x-default" href="${baseURL}/${slug}"`)
    // The untranslated page: once, in English, without alternates.
    expect(block(`${baseURL}/${fallbackSlug}`)).not.toContain('xhtml:link')
    expect(xml).not.toContain(`/pt/${fallbackSlug}`)
  })

  test('tags each locale with the page path, so a publish purges every locale', async ({
    request,
  }) => {
    const response = await request.get(`/pt/${slug}`)
    expect(response.headers()['cache-control']).toContain('public')
    expect(response.headers()['cache-tag']?.split(',')).toContain(`page:/${slug}`)
  })

  test("searches the visitor's locale", async ({ request }) => {
    // The index is written in the background after a publish.
    await expect
      .poll(async () => {
        const body = await (await request.get('/api/search?q=caiaque&locale=pt')).json()
        return (body.results as { path: string }[]).map(({ path }) => path)
      })
      .toContain(`/pt/${slug}`)
    const english = await (await request.get('/api/search?q=caiaque')).json()
    expect(english.results).toEqual([])
  })

  test('edits the Portuguese page on the page, leaving English alone', async () => {
    const id = ids.find(({ collection }) => collection === 'pages')!.id
    await admin.goto(`/admin/collections/pages/${id}?locale=pt`)
    await expect(admin.locator('#field-title')).toHaveValue('Passeios de caiaque')
    const [editor] = await Promise.all([
      context.waitForEvent('page'),
      admin.getByRole('button', { name: 'Edit on page' }).click(),
    ])
    editor.on('dialog', (dialog) => void dialog.accept())
    await expect(editor).toHaveURL(new RegExp(`/pt/${slug}\\?_onpage=1$`))
    await expect(editor.getByRole('toolbar', { name: 'Page editor' })).toBeVisible()
    await editor.waitForLoadState('networkidle')

    const text = editor.getByText(PT)
    const box = (await text.boundingBox())!
    await editor.mouse.click(box.x + 1, box.y + box.height / 2)
    await expect(editor.locator('.po-rt-surface')).toBeFocused()
    await editor.keyboard.type(PT_EDIT)
    await editor.getByTestId('onpage-rt-done').click()

    const draft = async (locale: string) =>
      JSON.stringify(
        await (await api.get(`/api/pages/${id}?draft=true&depth=0&locale=${locale}`)).json(),
      )
    await expect.poll(() => draft('pt')).toContain(PT_EDIT + PT)
    expect(await draft('en')).not.toContain(PT_EDIT)
    await editor.close()
  })
})
