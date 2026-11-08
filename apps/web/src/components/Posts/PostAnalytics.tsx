import React from 'react'

import { useConsent } from '@/components/CookieConsent'
import { GoogleAnalyticsConfig } from '@/components/GoogleAnalytics'

/**
 * GA4 on blog pages, as `PageTemplate` loads it: once the visitor accepts the cookie banner, and
 * never for drafts. Consent is read on the client only, so the server's HTML is the same for all.
 */
export const PostAnalytics: React.FC<{ draft?: boolean; gaMeasurementId?: null | string }> = ({
  draft = false,
  gaMeasurementId,
}) => {
  const { choice } = useConsent()
  return gaMeasurementId && !draft && choice === 'granted' ? (
    <GoogleAnalyticsConfig measurementId={gaMeasurementId} />
  ) : null
}
