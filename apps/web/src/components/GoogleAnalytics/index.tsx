import { useEffect } from 'react'

import { gtagSrc } from '@/utilities/googleAnalytics'

type Gtag = (command: string, ...args: unknown[]) => void

let configured = false

/**
 * Loads gtag.js and sends the GA4 `config` command (and so the first page view), once per page
 * load. Mounted by `PageTemplate` only after the visitor accepted the cookie banner
 * (`@/components/CookieConsent`), so nothing requests googletagmanager.com before that.
 *
 * It mounts after the sibling `<ExperimentTracker>`, which sets the experiment's custom
 * dimensions: gtag runs its queue in order, so the page view carries the experiment, bucket and
 * visitor id. The head's inline snippet (`gtagScripts` in `@/utilities/googleAnalytics`) only
 * defines `gtag` and queues `js`. Client-side navigation after it is left to GA4's own
 * history-change page views (Enhanced measurement).
 *
 * Mounted only when `GA_MEASUREMENT_ID` is set, the page isn't a draft and consent is granted.
 */
export function GoogleAnalyticsConfig({ measurementId }: { measurementId: string }) {
  useEffect(() => {
    if (configured) return
    const w = window as Window & { dataLayer?: unknown[]; gtag?: Gtag }
    // The head snippet defines these; recreate them if it's missing (e.g. a cached old page).
    if (typeof w.gtag !== 'function') {
      w.dataLayer = w.dataLayer || []
      w.gtag = function gtag() {
        // gtag.js reads the `arguments` object, not an array.
        // eslint-disable-next-line prefer-rest-params
        w.dataLayer!.push(arguments)
      }
      w.gtag('js', new Date())
    }
    configured = true
    w.gtag('config', measurementId)
    const script = document.createElement('script')
    script.async = true
    script.src = gtagSrc(measurementId)
    document.head.appendChild(script)
  }, [measurementId])

  return null
}
