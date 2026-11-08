import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser, testUser } from '../helpers/seedUser'

// The Form block (src/blocks/Form) on the dev server: a visitor sends the contact form through
// the Turnstile widget (development uses Cloudflare's always-pass test keys, src/forms/turnstile.ts)
// and sees the success message; the message lands in FORMS_D1 and shows in /admin/forms and its
// CSV export. Needs the local FORMS_D1 migrated (`pnpm web forms-store:migrate`; the store also
// migrates on first use).

test.describe('Forms', () => {
  let context: BrowserContext
  let admin: Page
  let api: APIRequestContext
  let pageId: number
  const stamp = Date.now()
  const slug = `e2e-forms-${stamp}`
  const sender = `Ada E2E ${stamp}`

  test.beforeAll(async ({ browser }) => {
    await seedTestUser()
    context = await browser.newContext()
    admin = await context.newPage()
    api = context.request
    await login({ page: admin, user: testUser })

    const created = await api.post('/api/pages', {
      data: {
        title: 'E2E forms',
        slug,
        _status: 'published',
        layout: [
          {
            blockType: 'form',
            variant: 'stacked',
            form: 'contact',
            title: 'Get in touch',
            nameLabel: 'Your name',
            emailLabel: 'Your email',
            messageLabel: 'Your message',
            submitLabel: 'Send it',
            successTitle: 'Message received',
            successMessage: 'We will reply soon.',
          },
        ],
      },
    })
    expect(created.ok(), await created.text()).toBe(true)
    pageId = (await created.json()).doc.id
  })

  test.afterAll(async () => {
    if (pageId !== undefined) {
      const response = await api.delete(`/api/pages/${pageId}`)
      expect([200, 404], await response.text()).toContain(response.status())
    }
    await context.close()
    await cleanupTestUser()
  })

  // The `page` fixture: a fresh anonymous context with the config's `storageState` (analytics
  // refused), so the cookie banner doesn't cover the form.
  test('a visitor sends the contact form and sees the success message', async ({ page }) => {
    // Not `networkidle`: the Turnstile widget keeps a connection busy.
    await page.goto(`/${slug}`)

    // The always-pass test widget puts its dummy token in a hidden input once it has rendered.
    // Wait for it before typing: the block's first client render (after hydration) must be done,
    // or it can replace the inputs and drop what was typed.
    await expect
      .poll(() =>
        page
          .locator('input[name="cf-turnstile-response"]')
          .inputValue()
          .catch(() => ''),
      )
      .not.toBe('')

    await page.getByLabel('Your name').fill(sender)
    await page.getByLabel('Your email').fill('ada.e2e@example.com')
    await page.getByLabel('Your message').fill('Hello from Playwright.')

    const [request, response] = await Promise.all([
      page.waitForRequest((r) => r.url().endsWith('/api/forms/contact') && r.method() === 'POST'),
      page.waitForResponse((r) => r.url().endsWith('/api/forms/contact')),
      page.getByRole('button', { name: 'Send it' }).click(),
    ])
    expect(response.status()).toBe(200)
    const body = JSON.parse(request.postData() ?? '{}')
    expect(body).toMatchObject({
      name: sender,
      email: 'ada.e2e@example.com',
      message: 'Hello from Playwright.',
      page: `/${slug}`,
      token: expect.any(String),
      website: '',
    })

    await expect(page.getByRole('status')).toContainText('Message received')
    await expect(page.getByRole('status')).toContainText('We will reply soon.')
  })

  test('the message shows in /admin/forms and its CSV export', async () => {
    await admin.goto('/admin/forms')
    await expect(admin.getByRole('heading', { name: 'Forms', level: 1 })).toBeVisible()
    await expect(admin.getByRole('cell', { name: sender })).toBeVisible()

    const csv = await api.get('/api/forms/export/submissions')
    expect(csv.ok()).toBe(true)
    expect(csv.headers()['content-type']).toContain('text/csv')
    expect(await csv.text()).toContain(`${sender},ada.e2e@example.com,Hello from Playwright.`)
  })

  test('the export and the view are for admins only', async ({ browser }) => {
    const anonymous = await browser.newContext()
    const res = await anonymous.request.get('/api/forms/export/submissions')
    expect(res.status()).toBe(401)
    await anonymous.close()
  })

  test('the page HTML is the same for every visitor: no site key or token in it', async ({
    browser,
  }) => {
    const anonymous = await browser.newContext()
    const res = await anonymous.request.get(`/${slug}`)
    const html = await res.text()
    expect(html).toContain('Your name')
    expect(html).not.toContain('1x00000000000000000000AA')
    expect(html).not.toContain('challenges.cloudflare.com')
    await anonymous.close()
  })
})
