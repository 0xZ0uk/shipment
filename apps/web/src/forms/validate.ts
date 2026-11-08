import { FIELD_LIMITS, HONEYPOT_FIELD, type FormSlug } from './definitions'

export type ContactData = { name: string; email: string; message: string }
export type NewsletterData = { email: string; consent: string | null }

export type ParsedSubmission =
  | { form: 'contact'; data: ContactData; page: string | null; token: string }
  | { form: 'newsletter'; data: NewsletterData; page: string | null; token: string }

export type ParseResult =
  | { ok: true; submission: ParsedSubmission }
  | { ok: false; reason: 'honeypot' }
  | { ok: false; reason: 'invalid'; fields: Partial<Record<'email' | 'message' | 'name', string>> }

// Deliberately loose: one `@`, no spaces, a dot in the domain. The real check is whether mail
// arrives; this only catches typos and junk.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** A same-site path (`/contact`), or null: never a full URL someone could plant. */
const pagePath = (value: unknown): string | null => {
  const path = str(value)
  return path.startsWith('/') && !path.startsWith('//') && path.length <= FIELD_LIMITS.page
    ? path
    : null
}

/** Lower-cased, so the newsletter's unique index treats `Ann@x.com` and `ann@x.com` as one. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase()

/**
 * Validates a posted body for `form`. Plain checks (no schema library in the app). The honeypot
 * is checked first: a bot's post is dropped before anything else looks at it.
 */
export function parseSubmission(form: FormSlug, body: unknown): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, reason: 'invalid', fields: {} }
  }
  const input = body as Record<string, unknown>
  if (str(input[HONEYPOT_FIELD])) return { ok: false, reason: 'honeypot' }

  const fields: Partial<Record<'email' | 'message' | 'name', string>> = {}
  const email = str(input.email)
  if (!email) fields.email = 'required'
  else if (email.length > FIELD_LIMITS.email || !EMAIL.test(email)) fields.email = 'invalid'

  const token = str(input.token)
  const page = pagePath(input.page)

  if (form === 'newsletter') {
    if (Object.keys(fields).length) return { ok: false, reason: 'invalid', fields }
    const consent = str(input.consent).slice(0, FIELD_LIMITS.consent) || null
    return {
      ok: true,
      submission: { form, data: { email: normalizeEmail(email), consent }, page, token },
    }
  }

  const name = str(input.name)
  if (!name) fields.name = 'required'
  else if (name.length > FIELD_LIMITS.name) fields.name = 'too_long'

  const message = str(input.message)
  if (!message) fields.message = 'required'
  else if (message.length > FIELD_LIMITS.message) fields.message = 'too_long'

  if (Object.keys(fields).length) return { ok: false, reason: 'invalid', fields }
  return { ok: true, submission: { form, data: { name, email, message }, page, token } }
}
