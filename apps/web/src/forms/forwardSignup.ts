import type { NewsletterData } from './validate'

/**
 * Hands a new newsletter signup to the mailing-list provider. A no-op in v1: signups are only
 * stored (FORMS_D1 `newsletter_signups`) and exported from /admin/forms as CSV.
 *
 * To connect a provider (Resend audiences, Buttondown…), call its API here with the address and
 * a key from `.env.schema`. It runs after the row is stored, only for a new address, and its
 * failures are logged, never shown to the visitor (src/forms/handler.ts).
 */
export async function forwardSignup(_signup: NewsletterData & { page: string | null }) {}
