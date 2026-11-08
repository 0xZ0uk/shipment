/**
 * Cloudflare Turnstile: the widget proves a visitor is human, and the endpoint verifies its token
 * server-side with Siteverify before storing anything.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Cloudflare's documented test keys
 * (https://developers.cloudflare.com/turnstile/troubleshooting/testing/). The widget with a test
 * site key issues the dummy token `XXXX.DUMMY.TOKEN.XXXX`, which only the test secrets accept.
 */
export const TURNSTILE_TEST_KEYS = {
  /** Always passes: the development default. */
  pass: { siteKey: '1x00000000000000000000AA', secretKey: '1x0000000000000000000000000000000AA' },
  /** Always fails: the widget blocks and Siteverify refuses. */
  fail: { siteKey: '2x00000000000000000000AB', secretKey: '2x0000000000000000000000000000000AA' },
} as const

export type TurnstileKeys = { siteKey: string; secretKey: string }

/**
 * The keys forms use, or null when forms aren't configured.
 *
 * Both keys set: those. Neither set in development (local dev, CI's e2e): the always-pass test
 * pair, so forms work with no setup. Anything else (a deployed Worker without both keys, or only
 * one of them): null, and the forms refuse submissions with `not_configured` and render a "not
 * available" notice. Accepting unverified posts on a public site would be an open relay for spam
 * into the owner's inbox; refusing loudly means a missing secret shows up on the first test
 * submission instead of in a flooded inbox.
 */
export function turnstileKeys({
  appEnv,
  secretKey,
  siteKey,
}: {
  appEnv?: string
  secretKey?: string
  siteKey?: string
}): TurnstileKeys | null {
  if (siteKey && secretKey) return { siteKey, secretKey }
  if (!siteKey && !secretKey && (appEnv ?? 'development') === 'development') {
    return { ...TURNSTILE_TEST_KEYS.pass }
  }
  return null
}

/**
 * Asks Siteverify whether `token` is valid for `secretKey`. False for an empty token, a refusal,
 * or Siteverify being unreachable (fail closed: the visitor can retry; the honeypot alone isn't
 * enough to let a post through).
 */
export async function verifyTurnstile({
  fetch: fetchFn = fetch,
  ip,
  secretKey,
  token,
}: {
  fetch?: typeof fetch
  ip?: string | null
  secretKey: string
  token: string
}): Promise<boolean> {
  if (!token || token.length > 2048) return false
  const body = new URLSearchParams({ secret: secretKey, response: token })
  if (ip) body.set('remoteip', ip)
  try {
    const res = await fetchFn(SITEVERIFY_URL, { method: 'POST', body })
    if (!res.ok) return false
    const result = (await res.json()) as { success?: boolean }
    return result.success === true
  } catch {
    return false
  }
}
