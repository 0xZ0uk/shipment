/**
 * The site's fixed forms, shared by the Form block (client) and the endpoint (server). Client
 * safe: no Payload or runtime imports.
 *
 * Two forms, defined in code rather than with `@payloadcms/plugin-form-builder` (which stores
 * submissions in the main D1): `contact` (name, email, message) and `newsletter` (email).
 * Editors control the copy (labels, button, success message) through the block's fields.
 */
export const FORM_SLUGS = ['contact', 'newsletter'] as const

export type FormSlug = (typeof FORM_SLUGS)[number]

export const isFormSlug = (value: unknown): value is FormSlug =>
  typeof value === 'string' && (FORM_SLUGS as readonly string[]).includes(value)

/** `POST` a submission here (a Payload endpoint, src/plugins/forms.ts). */
export const formEndpoint = (form: FormSlug) => `/api/forms/${form}`

/** `GET`: `{ siteKey }`, the Turnstile site key, or `null` when forms aren't configured. */
export const FORMS_CONFIG_ENDPOINT = '/api/forms/config'

/**
 * The honeypot: an input hidden from people (and from assistive tech) that bots fill in. A
 * submission with a value in it is dropped (and answered as a success, so bots learn nothing).
 */
export const HONEYPOT_FIELD = 'website'

/** Longest accepted value per field, in characters. */
export const FIELD_LIMITS = {
  name: 200,
  // RFC 5321's limit for a forward path.
  email: 254,
  message: 5000,
  consent: 1000,
  page: 500,
} as const

/** What the client posts. `token` is the Turnstile response. */
export type FormSubmissionBody = {
  name?: string
  email?: string
  message?: string
  /** The newsletter's consent text as shown to the visitor (proof of what they agreed to). */
  consent?: string
  /** The path of the page the form was on. */
  page?: string
  token?: string
  [HONEYPOT_FIELD]?: string
}

export type FormErrorCode =
  | 'invalid'
  | 'not_configured'
  | 'rate_limited'
  | 'server_error'
  | 'unknown_form'
  | 'verification_failed'

/** The endpoint's answer. `fields` names the invalid fields for `invalid`. */
export type FormResponse =
  | { ok: true }
  | { ok: false; error: FormErrorCode; fields?: Partial<Record<'email' | 'message' | 'name', string>> }
