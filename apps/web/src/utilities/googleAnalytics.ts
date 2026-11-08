const MEASUREMENT_ID = /^G-[A-Z0-9]+$/

/**
 * The GA4 measurement ID a view may load, or null. Null for an unset or malformed id
 * (`GA_MEASUREMENT_ID`, validated as `G-…` in `.env.schema`) and for every draft: live preview,
 * on-page editing and preview links never load Google Analytics. The admin doesn't use this
 * path at all (its routes aren't the frontend's).
 */
export const gaMeasurementIdFor = (id: string | undefined, draft: boolean): string | null =>
  !draft && id && MEASUREMENT_ID.test(id) ? id : null

/**
 * The GA4 snippet for a public page's `<head>`: an inline script that defines `gtag` and queues
 * `js`. It requests nothing: gtag.js itself (`gtagSrc`) is only added by `GoogleAnalyticsConfig`
 * once the visitor accepts the cookie banner (`@/components/CookieConsent`), so the server's HTML
 * is the same with or without consent. The snippet is static (the id isn't in it). Nothing
 * without an id.
 */
export const gtagScripts = (measurementId?: string | null) =>
  measurementId && MEASUREMENT_ID.test(measurementId)
    ? [
        {
          children:
            'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}' +
            "gtag('js',new Date());",
        },
      ]
    : []

/** The gtag.js URL for a measurement id: loaded on consent only (`GoogleAnalyticsConfig`). */
export const gtagSrc = (measurementId: string) =>
  `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
