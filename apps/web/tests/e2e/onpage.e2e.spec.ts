import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

// On-page editing (packages/onpage): "Edit on page" in the admin, inline rich-text edits that
// autosave as drafts, and preview links. Visitors must get none of it.

const PUBLISHED = 'Espresso is brewed by forcing hot water through finely ground coffee.'
const EDIT = 'Ristretto first. '

// The invisible characters onpage's field markers are made of. They only appear in edit mode.
// Built from a string so the escapes survive formatting (literal characters would be invisible).
const MARKERS = new RegExp('[\\u200B-\\u200F\\u2060-\\u2064\\uFEFF]')

const paragraph = (text: string) => ({
  type: 'paragraph',
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
  textFormat: 0,
  children: [{ type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text, version: 1 }],
})

/** A published page with one Rich text block holding `text`. */
const pageData = (title: string, slug: string, text: string) => ({
  title,
  slug,
  _status: 'published',
  layout: [
    {
      blockType: 'richText',
      richText: {
        root: {
          type: 'root',
          direction: 'ltr',
          format: '',
          indent: 0,
          version: 1,
          children: [paragraph(text)],
        },
      },
    },
  ],
})

/**
 * `/<path>` carrying onpage's marker (`?_onpage=1`), and nothing after it. Edit mode and preview
 * links get their own URL so an edge cache keyed by URL never serves them the published page.
 */
const marked = (path: string) => new RegExp(`${path}\\?_onpage=1$`)

/** A fresh browser context with no cookies: a site visitor. */
const visitor = async (browser: Browser) => (await browser.newContext()).newPage()

test.describe('On-page editing', () => {
  let context: BrowserContext
  let admin: Page
  let api: APIRequestContext
  let id: number
  /** A page that takes over `slug` once the shared page is renamed. */
  let squatterId: number | undefined
  const slug = `e2e-onpage-${Date.now()}`

  /**
   * A preview link for the test page, made from the admin as "Copy preview link" does: the
   * endpoint refuses requests that aren't same-origin, which Playwright's API client isn't.
   */
  const createPreviewLink = async () => {
    await admin.goto(`/admin/collections/pages/${id}`)
    const { status, body } = await admin.evaluate(async (pageId) => {
      const res = await fetch('/api/onpage/preview-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'collection', slug: 'pages', id: pageId }),
      })
      return { status: res.status, body: await res.text() }
    }, id)
    expect(status, body).toBe(200)
    return (JSON.parse(body) as { url: string }).url
  }

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()
    context = await browser.newContext()
    admin = await context.newPage()
    api = context.request
    await login({ page: admin, user: testUser })

    // Published through the REST API as the admin, so the dev server does every write itself
    // (see seo-sidebar.e2e.spec.ts).
    const response = await api.post('/api/pages', {
      data: pageData('E2E on-page editing', slug, PUBLISHED),
    })
    expect(response.ok(), await response.text()).toBe(true)
    id = (await response.json()).doc.id
  })

  test.afterAll(async () => {
    for (const pageId of [id, squatterId]) {
      if (pageId === undefined) continue
      const response = await api.delete(`/api/pages/${pageId}`)
      expect([200, 404]).toContain(response.status())
    }
    await context.close()
    await cleanupTestUser()
  })

  test('visitors get no editor, markers or extra requests', async ({ browser }) => {
    const page = await visitor(browser)
    const onpageRequests: string[] = []
    page.on('request', (request) => {
      if (/\/api\/onpage\/|_serverFn/.test(request.url())) onpageRequests.push(request.url())
    })

    const response = await page.goto(`/${slug}`)
    const html = (await response?.text()) ?? ''
    expect(html).toContain(PUBLISHED)
    expect(html).not.toContain('data-onpage')
    expect(html).not.toMatch(MARKERS)

    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('toolbar', { name: 'Page editor' })).toHaveCount(0)
    expect(onpageRequests).toEqual([])
    await page.context().close()
  })

  test('"Edit on page" opens the editor, and a rich-text edit saves as a draft', async ({
    browser,
  }) => {
    await admin.goto(`/admin/collections/pages/${id}`)
    // The form (and the controls beside it) only respond once its state has loaded.
    await expect(admin.locator('#field-title')).toBeEnabled()
    const [editor] = await Promise.all([
      context.waitForEvent('page'),
      admin.getByRole('button', { name: 'Edit on page' }).click(),
    ])
    // Leaving with a save in flight asks first; the test always lets it go.
    editor.on('dialog', (dialog) => void dialog.accept())
    await expect(editor).toHaveURL(marked(`/${slug}`))
    await expect(editor.getByRole('toolbar', { name: 'Page editor' })).toBeVisible()
    // The dock shows before the document's schema and data have loaded (and on `vite dev`
    // before the editor's lazy chunks compile); until then a click only selects the section.
    await editor.waitForLoadState('networkidle')

    // Click the start of the paragraph, as an editor would: the caret lands there.
    const text = editor.getByText(PUBLISHED)
    const box = (await text.boundingBox())!
    await editor.mouse.click(box.x + 1, box.y + box.height / 2)
    await expect(editor.getByRole('toolbar', { name: 'Text formatting' })).toBeVisible()
    await expect(editor.locator('.po-rt-surface')).toBeFocused()
    await editor.keyboard.type(EDIT)
    await editor.getByTestId('onpage-rt-done').click()
    await expect(editor.getByText(EDIT + PUBLISHED)).toBeVisible()

    // Autosaved as a draft through Payload's REST API, without markers…
    await expect
      .poll(async () =>
        JSON.stringify(await (await api.get(`/api/pages/${id}?draft=true&depth=0`)).json()),
      )
      .toContain(EDIT + PUBLISHED)
    const draft = JSON.stringify(
      await (await api.get(`/api/pages/${id}?draft=true&depth=0`)).json(),
    )
    expect(draft).not.toMatch(MARKERS)

    // …while visitors still get the published page.
    const page = await visitor(browser)
    await page.goto(`/${slug}`)
    await expect(page.getByText(PUBLISHED, { exact: true })).toBeVisible()
    await expect(page.getByText(EDIT)).toHaveCount(0)
    await page.context().close()
    await editor.close()
  })

  test('edit and preview modes keep their own URL until they are turned off', async () => {
    await admin.goto(`/admin/collections/pages/${id}`)
    await expect(admin.locator('#field-title')).toBeEnabled()
    const [editor] = await Promise.all([
      context.waitForEvent('page'),
      admin.getByRole('button', { name: 'Edit on page' }).click(),
    ])
    editor.on('dialog', (dialog) => void dialog.accept())
    const editBar = editor.getByRole('toolbar', { name: 'Page editor' })
    const previewBar = editor.getByRole('toolbar', { name: 'Draft preview' })
    const home = editor.getByRole('link', { name: 'Shipment home' }).first()
    await expect(editor).toHaveURL(marked(`/${slug}`))
    await expect(editBar).toBeVisible()

    // A reload stays in the mode, on the same URL.
    await editor.reload()
    await expect(editor).toHaveURL(marked(`/${slug}`))
    await expect(editBar).toBeVisible()
    // Links carry the marker, so one opened in a new tab stays in the mode too. (In edit mode a
    // click on the page selects instead of navigating.)
    await expect(home).toHaveAttribute('href', '/?_onpage=1')
    await editor.waitForLoadState('networkidle')

    // Switching to preview keeps the marker…
    await editor.getByTestId('onpage-preview').click()
    await expect(previewBar).toBeVisible()
    await expect(editor).toHaveURL(marked(`/${slug}`))
    await editor.waitForLoadState('networkidle')

    // …and so does client-side navigation.
    await home.click()
    await expect(editor).toHaveURL(marked('/'))
    await expect(previewBar).toBeVisible()

    // An unmarked URL (typed, bookmarked) moves to the marked one.
    await editor.goto(`/${slug}`)
    await expect(editor).toHaveURL(marked(`/${slug}`))
    await expect(previewBar).toBeVisible()
    await editor.waitForLoadState('networkidle')

    // Leaving the mode drops the marker: back to the published page's own URL.
    await editor.getByTestId('onpage-exit-preview').click()
    await expect(editor).toHaveURL(new RegExp(`/${slug}$`))
    await expect(previewBar).toHaveCount(0)
    await expect(editBar).toHaveCount(0)
    await editor.close()
  })

  test('a preview link shows the draft of that page only, to anyone holding it', async ({
    browser,
  }) => {
    const previewURL = await createPreviewLink()

    const page = await visitor(browser)
    await page.goto(previewURL)
    await expect(page).toHaveURL(marked(`/${slug}`))
    await expect(page.getByText(EDIT + PUBLISHED)).toBeVisible()
    await expect(page.getByText('Shared preview — not published yet')).toBeVisible()
    // Never an editor, even with the link.
    await expect(page.getByRole('toolbar', { name: 'Page editor' })).toHaveCount(0)

    // Still the draft once the page has hydrated: nothing may re-run the loader in place (it
    // runs as a server-function call then, whose URL isn't the page's).
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(EDIT + PUBLISHED)).toBeVisible()

    // Link viewers navigate with full page loads (each page checked on the server), and one
    // press of Back returns to the shared page, still showing the draft.
    // The marker follows (it grants nothing: the home page has no grant and stays published).
    await page.getByRole('link', { name: 'Shipment home' }).first().click()
    await expect(page).toHaveURL(marked('/'))
    await page.goBack()
    await expect(page).toHaveURL(marked(`/${slug}`))
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(EDIT + PUBLISHED)).toBeVisible()

    // The grant is bound to this page's path: the home page stays published for this viewer,
    // and a server render of it carries no draft state.
    const home = await page.request.get('/')
    expect(home.headers()['cache-control'] ?? '').not.toContain('no-store')

    // A reload stays on the shared draft.
    await page.reload()
    await expect(page).toHaveURL(marked(`/${slug}`))
    await expect(page.getByText(EDIT + PUBLISHED)).toBeVisible()

    // A visitor without the link still gets the published page.
    const other = await visitor(browser)
    await other.goto(`/${slug}`)
    await expect(other.getByText(PUBLISHED, { exact: true })).toBeVisible()
    await other.context().close()
    await page.context().close()
  })

  test('a preview grant keeps showing the page it was made for after its slug moves on', async ({
    browser,
  }) => {
    // A viewer opens the link: their browser now holds a grant for /<slug> and this page.
    const page = await visitor(browser)
    await page.goto(await createPreviewLink())
    await expect(page).toHaveURL(marked(`/${slug}`))

    // The page is renamed (publishing its draft), and another page is published at the old
    // slug, with a draft of its own.
    const renamed = await api.patch(`/api/pages/${id}`, {
      data: { slug: `${slug}-renamed`, _status: 'published' },
    })
    expect(renamed.ok(), await renamed.text()).toBe(true)
    const squatter = await api.post('/api/pages', {
      data: pageData('E2E squatter', slug, 'A different page now lives at this address.'),
    })
    expect(squatter.ok(), await squatter.text()).toBe(true)
    squatterId = (await squatter.json()).doc.id
    const squatterDraft = await api.patch(`/api/pages/${squatterId}?draft=true`, {
      data: { title: 'E2E squatter (draft)' },
    })
    expect(squatterDraft.ok(), await squatterDraft.text()).toBe(true)

    // Back at the old address, the grant still covers only the page it was made for: never the
    // new occupant's draft.
    // (Typed without the marker: the viewer is moved to the marked URL.)
    await page.goto(`/${slug}`)
    await expect(page).toHaveURL(marked(`/${slug}`))
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(EDIT + PUBLISHED)).toBeVisible()
    await expect(page.getByText('A different page now lives at this address.')).toHaveCount(0)
    await page.context().close()
  })
})
