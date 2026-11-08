import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { csvCell, submissionsCsv } from '@/forms/csv'
import { handleFormSubmission, hashIp, type FormsHandlerDeps } from '@/forms/handler'
import { ownerNotification, parseRecipients } from '@/forms/notify'
import {
  createFormsStore,
  migrateFormsStore,
  purgeOldSubmissions,
  retentionDays,
  type FormsStore,
} from '@/forms/store'
import { TURNSTILE_TEST_KEYS, turnstileKeys, verifyTurnstile } from '@/forms/turnstile'
import { parseSubmission } from '@/forms/validate'

// The forms endpoint (src/forms/handler.ts) against a real, in-memory D1 (workerd, like
// production; the shared local D1 in `.wrangler/state` is untouched), with Siteverify, the rate
// limit and the email transport faked.

let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ FORMS_D1: D1Database }>>>
let db: D1Database
let store: FormsStore

beforeAll(async () => {
  proxy = await getPlatformProxy<{ FORMS_D1: D1Database }>({
    persist: false,
    remoteBindings: false,
  })
  db = proxy.env.FORMS_D1
  store = createFormsStore(db)
}, 60_000)

afterAll(async () => {
  await proxy?.dispose()
})

beforeEach(async () => {
  await migrateFormsStore(db)
  await db.batch([db.prepare('DELETE FROM submissions'), db.prepare('DELETE FROM newsletter_signups')])
})

const siteverify = (success: boolean) =>
  vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json({ success }))

const deps = (overrides: Partial<FormsHandlerDeps> = {}) => {
  const sendEmail = vi.fn(async (_message: unknown) => ({}))
  const logger = { error: vi.fn() }
  const fetch = siteverify(true)
  const all: FormsHandlerDeps = {
    store,
    turnstileSecret: TURNSTILE_TEST_KEYS.pass.secretKey,
    hashSecret: 'test-secret',
    sendEmail,
    notifyTo: ['owner@example.com'],
    autoresponder: false,
    siteName: 'Shipment',
    logger,
    fetch: fetch as unknown as typeof globalThis.fetch,
    ...overrides,
  }
  return { deps: all, fetch, logger, sendEmail }
}

const contactBody = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  message: 'Hello!\nA second line.',
  page: '/contact',
  token: 'XXXX.DUMMY.TOKEN.XXXX',
}

const post = (d: FormsHandlerDeps, form: string, body: unknown, ip = '203.0.113.7') =>
  handleFormSubmission(d, {
    form,
    headers: new Headers({ 'cf-connecting-ip': ip }),
    readBody: async () => body,
  })

const count = async (table: 'newsletter_signups' | 'submissions') =>
  (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n

describe('POST /api/forms/:form', () => {
  it('stores a valid contact submission and emails the owner', async () => {
    const { deps: d, fetch, sendEmail } = deps()
    const result = await post(d, 'contact', contactBody)

    expect(result).toEqual({ status: 200, body: { ok: true } })
    const [row] = await store.listSubmissions()
    expect(row).toMatchObject({ form: 'contact', page: '/contact' })
    expect(JSON.parse(row!.data)).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      message: 'Hello!\nA second line.',
    })
    // The IP is never stored as-is.
    expect(row!.ip_hash).toBe(await hashIp('203.0.113.7', 'test-secret'))
    expect(row!.ip_hash).not.toContain('203.0.113.7')

    // Siteverify got the secret, the token and the client IP.
    const body = fetch.mock.calls[0]![1]!.body as URLSearchParams
    expect(body.get('secret')).toBe(TURNSTILE_TEST_KEYS.pass.secretKey)
    expect(body.get('response')).toBe('XXXX.DUMMY.TOKEN.XXXX')
    expect(body.get('remoteip')).toBe('203.0.113.7')

    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0]![0]).toMatchObject({
      to: ['owner@example.com'],
      replyTo: 'ada@example.com',
      subject: '[Shipment] New message from Ada Lovelace',
    })
  })

  it('rejects a failed Turnstile token without storing it', async () => {
    const { deps: d, sendEmail } = deps({
      fetch: siteverify(false) as unknown as typeof fetch,
      turnstileSecret: TURNSTILE_TEST_KEYS.fail.secretKey,
    })
    expect(await post(d, 'contact', contactBody)).toEqual({
      status: 403,
      body: { ok: false, error: 'verification_failed' },
    })
    expect(await post(d, 'contact', { ...contactBody, token: '' })).toMatchObject({ status: 403 })
    expect(await count('submissions')).toBe(0)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('fails closed when Siteverify is unreachable', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    expect(
      await verifyTurnstile({ fetch: down as unknown as typeof fetch, secretKey: 's', token: 't' }),
    ).toBe(false)
  })

  it('rejects a rate-limited request before reading the body or calling Siteverify', async () => {
    const limit = vi.fn(async (_options: { key: string }) => ({ success: false }))
    const readBody = vi.fn(async () => contactBody)
    const { deps: d, fetch } = deps({ rateLimit: { limit } as unknown as RateLimit })
    const result = await handleFormSubmission(d, {
      form: 'contact',
      headers: new Headers({ 'cf-connecting-ip': '198.51.100.1' }),
      readBody,
    })
    expect(result).toEqual({ status: 429, body: { ok: false, error: 'rate_limited' } })
    expect(limit).toHaveBeenCalledWith({ key: 'forms:198.51.100.1' })
    expect(readBody).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('drops a filled honeypot silently: 200, nothing stored, no Siteverify call', async () => {
    const { deps: d, fetch, sendEmail } = deps()
    expect(await post(d, 'contact', { ...contactBody, website: 'http://spam.example' })).toEqual({
      status: 200,
      body: { ok: true },
    })
    expect(await count('submissions')).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects invalid bodies with the invalid fields, before Siteverify', async () => {
    const { deps: d, fetch } = deps()
    expect(await post(d, 'contact', { ...contactBody, email: 'not-an-email', name: ' ' })).toEqual(
      { status: 400, body: { ok: false, error: 'invalid', fields: { email: 'invalid', name: 'required' } } },
    )
    expect(await post(d, 'contact', { ...contactBody, message: 'x'.repeat(5001) })).toMatchObject({
      status: 400,
      body: { fields: { message: 'too_long' } },
    })
    expect(await post(d, 'contact', 'a string')).toMatchObject({ status: 400 })
    expect(await post(d, 'contact', ['an', 'array'])).toMatchObject({ status: 400 })
    const unreadable = await handleFormSubmission(d, {
      form: 'contact',
      headers: new Headers(),
      readBody: async () => {
        throw new SyntaxError('Unexpected token')
      },
    })
    expect(unreadable.status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
    expect(await count('submissions')).toBe(0)
  })

  it('answers 404 for an unknown form and 503 when Turnstile is not configured', async () => {
    expect((await post(deps().deps, 'quote', contactBody)).status).toBe(404)
    expect(await post(deps({ turnstileSecret: null }).deps, 'contact', contactBody)).toEqual({
      status: 503,
      body: { ok: false, error: 'not_configured' },
    })
    expect(await count('submissions')).toBe(0)
  })

  it('stores a newsletter signup once: a duplicate answers the same and changes nothing', async () => {
    const forwardSignup = vi.fn(async () => {})
    const { deps: d, sendEmail } = deps({ forwardSignup })
    const body = {
      email: ' Ada@Example.com ',
      consent: 'Send me the monthly newsletter.',
      page: '/',
      token: 'XXXX.DUMMY.TOKEN.XXXX',
    }

    expect(await post(d, 'newsletter', body)).toEqual({ status: 200, body: { ok: true } })
    const [first] = await store.listSignups()
    expect(first).toMatchObject({
      email: 'ada@example.com',
      consent_text: 'Send me the monthly newsletter.',
      page: '/',
      unsubscribed_at: null,
    })

    // Same address, different case and consent: the same answer, the first record kept.
    expect(
      await post(d, 'newsletter', { ...body, email: 'ADA@example.com', consent: 'Other' }),
    ).toEqual({ status: 200, body: { ok: true } })
    expect(await store.listSignups()).toEqual([first])
    // The owner and the provider hear about it once.
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(forwardSignup).toHaveBeenCalledTimes(1)
    expect(forwardSignup).toHaveBeenCalledWith({
      email: 'ada@example.com',
      consent: 'Send me the monthly newsletter.',
      page: '/',
    })

    const token = await db
      .prepare('SELECT unsubscribe_token FROM newsletter_signups')
      .first<{ unsubscribe_token: string }>()
    expect(token?.unsubscribe_token).toMatch(/^[0-9a-f]{48}$/)
  })

  it('keeps the submission when the notification fails', async () => {
    const sendEmail = vi.fn(async () => {
      throw new Error('SMTP down')
    })
    const { deps: d, logger } = deps({ sendEmail, autoresponder: true })
    expect(await post(d, 'contact', contactBody)).toEqual({ status: 200, body: { ok: true } })
    expect(await count('submissions')).toBe(1)
    // Both emails were tried; each failure was logged.
    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledTimes(2)
  })

  it('sends the autoresponder only when enabled, and nothing without recipients', async () => {
    const { deps: d, sendEmail } = deps({ autoresponder: true, notifyTo: [] })
    await post(d, 'contact', contactBody)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0]![0]).toMatchObject({ to: 'ada@example.com' })
  })

  it('runs follow-ups through waitUntil when given', async () => {
    const waitUntil = vi.fn()
    const { deps: d, sendEmail } = deps({ waitUntil })
    await post(d, 'contact', contactBody)
    expect(waitUntil).toHaveBeenCalledTimes(1)
    await waitUntil.mock.calls[0]![0]
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('answers 500 and logs when the store fails', async () => {
    const broken = {
      ...store,
      insertSubmission: vi.fn(async () => {
        throw new Error('D1 unavailable')
      }),
    }
    const { deps: d, logger, sendEmail } = deps({ store: broken })
    expect(await post(d, 'contact', contactBody)).toEqual({
      status: 500,
      body: { ok: false, error: 'server_error' },
    })
    expect(logger.error).toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('forms retention', () => {
  it('deletes only submissions older than the retention window', async () => {
    const now = new Date('2026-11-08T12:00:00Z')
    const day = 24 * 60 * 60 * 1000
    for (const age of [0, 89, 91, 400]) {
      await store.insertSubmission({
        form: 'contact',
        data: { age },
        page: null,
        ipHash: null,
        createdAt: new Date(now.getTime() - age * day),
      })
    }
    await store.addSignup({
      email: 'old@example.com',
      consent: null,
      page: null,
      ipHash: null,
      createdAt: new Date(now.getTime() - 400 * day),
    })

    expect(await purgeOldSubmissions(store, 90, now)).toBe(2)
    const ages = (await store.listSubmissions()).map((row) => JSON.parse(row.data).age)
    expect(ages.sort((a, b) => a - b)).toEqual([0, 89])
    // Signups are not subject to the submissions' retention.
    expect(await count('newsletter_signups')).toBe(1)
  })

  it('reads FORMS_RETENTION_DAYS with a 90-day default', () => {
    expect(retentionDays(undefined)).toBe(90)
    expect(retentionDays('')).toBe(90)
    expect(retentionDays('0')).toBe(90)
    expect(retentionDays('abc')).toBe(90)
    expect(retentionDays('30')).toBe(30)
  })
})

describe('forms store migrations', () => {
  it('are idempotent', async () => {
    expect(await migrateFormsStore(db)).toEqual([])
    const tables = await db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '\\_%' ESCAPE '\\' AND name NOT LIKE 'sqlite%' ORDER BY name")
      .all<{ name: string }>()
    expect(tables.results.map((t) => t.name)).toEqual([
      'forms_store_migrations',
      'newsletter_signups',
      'submissions',
    ])
  })
})

describe('Turnstile keys', () => {
  it('uses the always-pass test pair in development when none are set', () => {
    expect(turnstileKeys({ appEnv: 'development' })).toEqual(TURNSTILE_TEST_KEYS.pass)
    expect(turnstileKeys({})).toEqual(TURNSTILE_TEST_KEYS.pass)
  })

  it('refuses (null) on a deployed Worker without both keys', () => {
    expect(turnstileKeys({ appEnv: 'production' })).toBeNull()
    expect(turnstileKeys({ appEnv: 'staging' })).toBeNull()
    expect(turnstileKeys({ appEnv: 'production', siteKey: 'site' })).toBeNull()
    expect(turnstileKeys({ appEnv: 'development', secretKey: 'secret' })).toBeNull()
  })

  it('uses the configured pair anywhere', () => {
    expect(turnstileKeys({ appEnv: 'production', siteKey: 'a', secretKey: 'b' })).toEqual({
      siteKey: 'a',
      secretKey: 'b',
    })
  })
})

describe('forms helpers', () => {
  it('keeps only same-site page paths', () => {
    const parse = (page: unknown) => {
      const result = parseSubmission('newsletter', { email: 'a@b.co', page })
      return result.ok ? result.submission.page : 'invalid'
    }
    expect(parse('/pricing')).toBe('/pricing')
    expect(parse('https://evil.example')).toBeNull()
    expect(parse('//evil.example')).toBeNull()
    expect(parse(42)).toBeNull()
  })

  it('escapes owner emails and neutralises spreadsheet formulas in CSV exports', () => {
    const email = ownerNotification(
      {
        form: 'contact',
        data: { name: '<b>Eve</b>', email: 'eve@example.com', message: 'hi' },
        page: null,
        token: 't',
      },
      { siteName: 'Shipment', to: ['o@example.com'] },
    )
    expect(email.html).toContain('&lt;b&gt;Eve&lt;/b&gt;')
    expect(email.html).not.toContain('<b>Eve</b>')

    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell(null)).toBe('')
    expect(
      submissionsCsv([
        {
          id: 1,
          form: 'contact',
          data: JSON.stringify({ name: 'Ada', email: 'a@b.co', message: 'line 1\nline 2' }),
          page: '/contact',
          ip_hash: 'x',
          created_at: '2026-11-08T12:00:00.000Z',
        },
      ]),
    ).toBe(
      'id,created_at,form,name,email,message,page\r\n' +
        '1,2026-11-08T12:00:00.000Z,contact,Ada,a@b.co,"line 1\nline 2",/contact\r\n',
    )
  })

  it('parses FORMS_NOTIFY_EMAIL', () => {
    expect(parseRecipients(' a@x.co, ,b@x.co ')).toEqual(['a@x.co', 'b@x.co'])
    expect(parseRecipients(undefined)).toEqual([])
  })
})
