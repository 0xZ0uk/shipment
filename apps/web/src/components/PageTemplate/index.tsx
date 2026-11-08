import { ExperimentTracker } from '@shipment/payload-plugin-ab/analytics'
import React from 'react'

import type { LoadPageResult } from '@/app/_frontend/pages.functions'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import { DraftModeProvider } from '@/blocks/shared/draftMode'
import { AbConversionTracker } from '@/components/AbConversionTracker'
import { useConsent } from '@/components/CookieConsent'
import { GoogleAnalyticsConfig } from '@/components/GoogleAnalytics'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { PostsArchiveProvider } from '@/components/Posts/context'
import type { PostSummary } from '@/components/Posts/types'

export const PageTemplate: React.FC<{
  /** A draft read (live preview, on-page editing, a preview link): blocks may show hints. */
  draft: boolean
  /** The A/B experiment this view belongs to (`loadPage`): CTA clicks then count as conversions. */
  experiment?: string | null
  /** The GA4 measurement ID (`loadPage`), set only for views that may load Google Analytics. */
  gaMeasurementId?: string | null
  /** The admin's live preview: reload the route's data when the document is saved there. */
  livePreview: boolean
  page: NonNullable<LoadPageResult['page']>
  /** The Posts archive blocks' posts, by block id (`loadPage`). */
  postsArchive?: Record<string, PostSummary[]>
}> = ({ draft, experiment, gaMeasurementId, livePreview, page, postsArchive }) => {
  const { layout } = page

  return (
    <article data-test="payload-ui-barrel-sentinel">
      {/* Not for on-page editing (it refreshes on its own) or preview links: the listener reloads
          the route once on mount. */}
      {livePreview && <LivePreviewListener />}
      {experiment && !draft && <AbConversionTracker experiment={experiment} />}
      {gaMeasurementId && !draft && (
        <ConsentedAnalytics experiment={experiment} measurementId={gaMeasurementId} />
      )}

      <DraftModeProvider draft={draft}>
        <PostsArchiveProvider byBlock={postsArchive ?? {}}>
          <RenderBlocks blocks={layout} />
        </PostsArchiveProvider>
      </DraftModeProvider>
    </article>
  )
}

/**
 * GA4, once the visitor accepts the cookie banner (head: `gtagScripts`, a stub). The tracker sets
 * the experiment's dimensions before the config call, so the first page view carries them.
 *
 * Its own component so that only it reads the consent context: the choice is read from the
 * cookie right after hydration, and if `PageTemplate` re-rendered then, so would `RenderBlocks`,
 * and React would throw away the server HTML of every lazily loaded block still hydrating and
 * render it again on the client (losing anything typed into it).
 */
function ConsentedAnalytics({
  experiment,
  measurementId,
}: {
  experiment?: string | null
  measurementId: string
}) {
  // Read on the client only (after hydration): the server renders the same HTML for everyone.
  const { choice } = useConsent()
  if (choice !== 'granted') return null
  return (
    <>
      {experiment && <ExperimentTracker experimentId={experiment} />}
      <GoogleAnalyticsConfig measurementId={measurementId} />
    </>
  )
}
