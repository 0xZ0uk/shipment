import { isFormSlug, type FormResponse } from './definitions'
import { forwardSignup as defaultForwardSignup } from './forwardSignup'
import { autoresponder, ownerNotification, type SendEmail } from './notify'
import type { FormsStore } from './store'
import { verifyTurnstile } from './turnstile'
import { parseSubmission, type ParsedSubmission } from './validate'

export type FormsLogger = {
  error: (obj: { err?: unknown; msg: string }) => void
}

export type FormsHandlerDeps = {
  store: FormsStore
  /** The `FORMS_RATE_LIMIT` binding. Without it (Node dev server, tests), everything passes. */
  rateLimit?: RateLimit
  /** The Turnstile secret, or null when forms aren't configured (see `turnstileKeys`). */
  turnstileSecret: string | null
  /** Hashes the client IP for storage (keyed with a per-site secret). */
  hashSecret: string
  sendEmail: SendEmail
  /** FORMS_NOTIFY_EMAIL: owners notified of each stored post. Empty: none. */
  notifyTo: string[]
  autoresponder: boolean
  siteName: string
  logger: FormsLogger
  /** Runs notifications after the response (Workers). Without it they're awaited. */
  waitUntil?: (promise: Promise<unknown>) => void
  fetch?: typeof fetch
  forwardSignup?: typeof defaultForwardSignup
  now?: () => Date
}

export type FormsHandlerResult = { status: number; body: FormResponse }

/** The client IP, which Cloudflare's edge sets and clients can't forge. */
export const clientIp = (headers: Headers) => headers.get('cf-connecting-ip')?.trim() || null

/**
 * HMAC-SHA256 of the IP with a per-site secret, hex, truncated: enough to spot one source
 * flooding the forms, without storing the address itself or a hash anyone could reverse by
 * hashing every IPv4 address.
 */
export async function hashIp(ip: string | null, secret: string): Promise<string | null> {
  if (!ip || !secret) return null
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(`forms-ip:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(ip)))
  return Array.from(signature.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
}

const fail = (status: number, body: Extract<FormResponse, { ok: false }>): FormsHandlerResult => ({
  status,
  body,
})

const OK: FormsHandlerResult = { status: 200, body: { ok: true } }

/**
 * `POST /api/forms/:form`. In order, each step only reached when the previous one passed:
 *
 * 1. Known form, and forms configured (a Turnstile secret): else 404 / 503.
 * 2. Rate limit per client IP (`FORMS_RATE_LIMIT`): 429. First, so a flood costs no body
 *    parsing, Siteverify calls or writes.
 * 3. Body: the honeypot (a filled one is answered 200 and dropped, so bots learn nothing), then
 *    the fields: 400 with the invalid field names.
 * 4. Turnstile (Siteverify): 403.
 * 5. Store in FORMS_D1: 500 if that fails (nothing was kept, the visitor can retry).
 * 6. Notify the owners (and the optional autoresponder; newsletter: forward to the provider, a
 *    no-op for now). After the row is stored, and never able to fail the request: a broken
 *    email transport loses no submission.
 */
export async function handleFormSubmission(
  deps: FormsHandlerDeps,
  request: { form: string; headers: Headers; readBody: () => Promise<unknown> },
): Promise<FormsHandlerResult> {
  const { form, headers } = request
  if (!isFormSlug(form)) return fail(404, { ok: false, error: 'unknown_form' })
  if (!deps.turnstileSecret) return fail(503, { ok: false, error: 'not_configured' })

  const ip = clientIp(headers)
  if (deps.rateLimit) {
    const { success } = await deps.rateLimit.limit({ key: `forms:${ip ?? 'unknown'}` })
    if (!success) return fail(429, { ok: false, error: 'rate_limited' })
  }

  let body: unknown
  try {
    body = await request.readBody()
  } catch {
    return fail(400, { ok: false, error: 'invalid', fields: {} })
  }
  const parsed = parseSubmission(form, body)
  if (!parsed.ok) {
    return parsed.reason === 'honeypot'
      ? OK
      : fail(400, { ok: false, error: 'invalid', fields: parsed.fields })
  }
  const { submission } = parsed

  const verified = await verifyTurnstile({
    fetch: deps.fetch,
    ip,
    secretKey: deps.turnstileSecret,
    token: submission.token,
  })
  if (!verified) return fail(403, { ok: false, error: 'verification_failed' })

  const createdAt = deps.now?.() ?? new Date()
  let isNew = true
  try {
    const ipHash = await hashIp(ip, deps.hashSecret)
    if (submission.form === 'contact') {
      await deps.store.insertSubmission({
        form: submission.form,
        data: submission.data,
        page: submission.page,
        ipHash,
        createdAt,
      })
    } else {
      // An address already on the list answers exactly like a new one: the form must not
      // tell anyone whether an address is subscribed.
      const { created } = await deps.store.addSignup({
        email: submission.data.email,
        consent: submission.data.consent,
        page: submission.page,
        ipHash,
        createdAt,
      })
      isNew = created
    }
  } catch (error) {
    deps.logger.error({ err: error, msg: `[forms] storing a ${form} submission failed` })
    return fail(500, { ok: false, error: 'server_error' })
  }

  if (isNew) {
    const followUp = runFollowUps(deps, submission)
    if (deps.waitUntil) deps.waitUntil(followUp)
    else await followUp
  }
  return OK
}

/** Emails and forwarding after a stored post. Never rejects: each step logs its own failure. */
async function runFollowUps(deps: FormsHandlerDeps, submission: ParsedSubmission) {
  const steps: Array<[string, () => Promise<unknown>]> = []
  if (deps.notifyTo.length) {
    steps.push([
      'owner notification',
      () =>
        deps.sendEmail(
          ownerNotification(submission, { siteName: deps.siteName, to: deps.notifyTo }),
        ),
    ])
  }
  if (submission.form === 'contact' && deps.autoresponder) {
    steps.push([
      'autoresponder',
      () => deps.sendEmail(autoresponder(submission, { siteName: deps.siteName })),
    ])
  }
  if (submission.form === 'newsletter') {
    const forward = deps.forwardSignup ?? defaultForwardSignup
    steps.push([
      'newsletter forwarding',
      () => forward({ ...submission.data, page: submission.page }),
    ])
  }
  for (const [name, step] of steps) {
    try {
      await step()
    } catch (error) {
      deps.logger.error({ err: error, msg: `[forms] ${name} failed (the ${submission.form} post is stored)` })
    }
  }
}
