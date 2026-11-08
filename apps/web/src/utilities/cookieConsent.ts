/**
 * The visitor's analytics consent, kept in a first-party cookie. Read and written in the browser
 * only (`@/components/CookieConsent`): published pages are cached at the edge by URL alone, so
 * nothing on the server (loaders, server functions, `pageHead`) may read it or render differently
 * for it.
 *
 * `cookie_consent=granted|denied`, `Path=/`, `SameSite=Lax`, `Secure` on https, for 180 days;
 * after that the banner asks again. Not HttpOnly: the client reads it.
 */
export const CONSENT_COOKIE = 'cookie_consent'

/** 180 days, in seconds. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180

export type ConsentChoice = 'denied' | 'granted'

/** The choice stored in a `document.cookie` string, or null when there is none (or it's junk). */
export const readConsent = (cookieHeader: string): ConsentChoice | null => {
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name !== CONSENT_COOKIE) continue
    const value = rest.join('=')
    if (value === 'granted' || value === 'denied') return value
  }
  return null
}

/** The `document.cookie` assignment that stores a choice. */
export const consentCookie = (choice: ConsentChoice, secure: boolean) =>
  `${CONSENT_COOKIE}=${choice}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax` +
  (secure ? '; Secure' : '')

/**
 * The `document.cookie` assignments that expire Google Analytics' own cookies (`_ga`, `_ga_<id>`,
 * `_gid`, `_gat…`) found in `cookieHeader`, on the host and on each parent domain (gtag sets them
 * on the widest one it can).
 */
export const expiredAnalyticsCookies = (cookieHeader: string, hostname: string): string[] => {
  const names = cookieHeader
    .split(';')
    .map((part) => part.trim().split('=')[0])
    .filter((name) => name && /^(_ga|_gid|_gat)(_|$)/.test(name))
  const labels = hostname.split('.')
  // `a.b.example.com` → `a.b.example.com`, `b.example.com`, `example.com` (not `com`).
  const domains = labels.slice(0, -1).map((_, i) => labels.slice(i).join('.'))
  return names.flatMap((name) => [
    `${name}=; Path=/; Max-Age=0`,
    ...domains.map((domain) => `${name}=; Path=/; Max-Age=0; Domain=.${domain}`),
  ])
}
