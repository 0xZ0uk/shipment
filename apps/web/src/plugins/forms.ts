import type { Config, Endpoint, PayloadRequest, Plugin } from 'payload'

import { signupsCsv, submissionsCsv } from '@/forms/csv'
import { handleFormSubmission } from '@/forms/handler'
import { parseRecipients } from '@/forms/notify'
import { createFormsStore, type FormsStore } from '@/forms/store'
import { turnstileKeys } from '@/forms/turnstile'
import { siteName } from '@/utilities/siteName'

/** What the forms read from the Worker: bindings, and variables varlock may also put in `process.env`. */
export type FormsEnv = {
  FORMS_D1?: D1Database
  FORMS_RATE_LIMIT?: RateLimit
  APP_ENV?: string
  PAYLOAD_SECRET?: string
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  FORMS_NOTIFY_EMAIL?: string
  FORMS_AUTORESPONDER?: string
}

const read = (env: FormsEnv, name: keyof FormsEnv): string | undefined => {
  const value = process.env[name] || env[name]
  return typeof value === 'string' && value ? value : undefined
}

/** The Turnstile keys forms use (see `turnstileKeys`): test keys in dev, none when unconfigured. */
export const formsTurnstileKeys = (env: FormsEnv) =>
  turnstileKeys({
    appEnv: read(env, 'APP_ENV'),
    secretKey: read(env, 'TURNSTILE_SECRET_KEY'),
    siteKey: read(env, 'TURNSTILE_SITE_KEY'),
  })

const stores = new WeakMap<D1Database, FormsStore>()

/** One store per database binding, so its first-use migration check runs once per isolate. */
export const formsStore = (env: FormsEnv): FormsStore => {
  const db = env.FORMS_D1
  if (!db) throw new Error('The FORMS_D1 binding is missing (wrangler.jsonc).')
  let store = stores.get(db)
  if (!store) stores.set(db, (store = createFormsStore(db)))
  return store
}

/** Admin users only: a session on another auth collection doesn't count. */
export const isFormsAdmin = (req: Pick<PayloadRequest, 'payload' | 'user'>) =>
  Boolean(req.user) && req.user?.collection === req.payload.config.admin?.user

const EXPORT_PAGE = 1000
const EXPORT_MAX_ROWS = 50_000

const exportRows = async <T>(list: (o: { limit: number; offset: number }) => Promise<T[]>) => {
  const rows: T[] = []
  while (rows.length < EXPORT_MAX_ROWS) {
    const page = await list({ limit: EXPORT_PAGE, offset: rows.length })
    rows.push(...page)
    if (page.length < EXPORT_PAGE) break
  }
  return rows
}

const formsEndpoints = (env: FormsEnv, waitUntil?: (p: Promise<unknown>) => void): Endpoint[] => [
  {
    // The Turnstile site key for the Form block, fetched in the browser so page HTML stays the
    // same for everyone (edge-cacheable). The same answer for every visitor, so it may be
    // shared; short, so a key change shows up within minutes.
    path: '/forms/config',
    method: 'get',
    handler: () =>
      Response.json(
        { siteKey: formsTurnstileKeys(env)?.siteKey ?? null },
        { headers: { 'Cache-Control': 'public, max-age=300' } },
      ),
  },
  {
    path: '/forms/:form',
    method: 'post',
    handler: async (req) => {
      const { status, body } = await handleFormSubmission(
        {
          store: formsStore(env),
          rateLimit: env.FORMS_RATE_LIMIT,
          turnstileSecret: formsTurnstileKeys(env)?.secretKey ?? null,
          hashSecret: read(env, 'PAYLOAD_SECRET') ?? req.payload.secret,
          sendEmail: (message) => req.payload.sendEmail(message),
          notifyTo: parseRecipients(read(env, 'FORMS_NOTIFY_EMAIL')),
          autoresponder: read(env, 'FORMS_AUTORESPONDER') === '1',
          siteName,
          logger: req.payload.logger,
          waitUntil,
        },
        {
          form: String(req.routeParams?.form ?? ''),
          headers: req.headers,
          readBody: async () => (req.json ? req.json() : undefined),
        },
      )
      return Response.json(body, { status })
    },
  },
  {
    // CSV of every submission or signup, for admins (`/admin/forms` links here).
    path: '/forms/export/:table',
    method: 'get',
    handler: async (req) => {
      if (!isFormsAdmin(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
      const table = req.routeParams?.table
      const store = formsStore(env)
      let csv: string
      if (table === 'submissions') csv = submissionsCsv(await exportRows(store.listSubmissions))
      else if (table === 'signups') csv = signupsCsv(await exportRows(store.listSignups))
      else return Response.json({ error: 'Not found' }, { status: 404 })
      const date = new Date().toISOString().slice(0, 10)
      return new Response(csv, {
        headers: {
          'Cache-Control': 'private, no-store',
          'Content-Disposition': `attachment; filename="${table}-${date}.csv"`,
          'Content-Type': 'text/csv; charset=utf-8',
        },
      })
    },
  },
]

/**
 * Contact and newsletter forms (the Form block): `POST /api/forms/:form`, the Turnstile site key
 * at `GET /api/forms/config`, and `/admin/forms` (submissions and signups, CSV export) for admin
 * users. Rows live in FORMS_D1, never the main database; no collection is registered.
 */
export const formsPlugin =
  (env: FormsEnv, { waitUntil }: { waitUntil?: (p: Promise<unknown>) => void } = {}): Plugin =>
  (config: Config): Config => {
    const afterNavLinks = config.admin?.components?.afterNavLinks
    return {
      ...config,
      endpoints: [...(config.endpoints ?? []), ...formsEndpoints(env, waitUntil)],
      admin: {
        ...config.admin,
        components: {
          ...config.admin?.components,
          afterNavLinks: [
            ...(Array.isArray(afterNavLinks) ? afterNavLinks : afterNavLinks ? [afterNavLinks] : []),
            '@/forms/admin/FormsNavLink#FormsNavLink',
          ],
          views: {
            ...config.admin?.components?.views,
            forms: { Component: '@/forms/admin/FormsView#FormsView', path: '/forms' },
          },
        },
      },
    }
  }
