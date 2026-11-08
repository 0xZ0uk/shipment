/**
 * @shipment/onpage-tanstack-start — payload-onpage for TanStack Start.
 *
 *   // payload.config.ts (import from /session: it has no client code)
 *   import { tanstackSession } from '@shipment/onpage-tanstack-start/session'
 *   plugins: [onpage({ collections: ['pages'], session: tanstackSession({ secret: process.env.PAYLOAD_SECRET }) })]
 *
 *   // root route — renders nothing for visitors
 *   <OnPage />
 *
 *   // the same route keeps the edit/preview marker (?_onpage=1) on every link
 *   validateSearch: validateOnPageSearch, search: { middlewares: [retainOnPageMarker] }
 *
 *   // where a loader reads Payload (import from /session)
 *   import { isDraftEnabled, onpageContext } from '@shipment/onpage-tanstack-start/session'
 *   payload.find({ collection: 'pages', draft: await isDraftEnabled(), ...(await onpageContext()) })
 */
import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { hasMarker, withMarker, type OnPageMode } from '@shipment/onpage-core'
import { OnPageMount, type OnPageMountProps } from './client.tsx'
import { HINT_COOKIE } from './hint.ts'
import { getOnPageState } from './state.functions.ts'

export interface OnPageProps extends Omit<OnPageMountProps, 'mode' | 'shared'> {
  /**
   * Your own mount, to pass client options (custom field editors, locator,
   * media library…):
   *
   *   export const Mount = (p: OnPageMountProps) => <OnPageMount {...p} editors={{ json: myJsonEditor }} />
   */
  mount?: ComponentType<OnPageMountProps>
}

export type { OnPageMountProps } from './client.tsx'
export { retainOnPageMarker, validateOnPageSearch, type OnPageSearch } from './search.ts'
export type { OnPageState } from './state.functions.ts'

/** The hint cookie is present (editors and preview-link viewers only — never visitors). */
const hasHint = () =>
  typeof document !== 'undefined' &&
  document.cookie.split(';').some((c) => c.trim().startsWith(`${HINT_COOKIE}=`))

const inFrame = () => window.self !== window.top

/**
 * Mounts the editor (edit mode) or the preview toolbar (preview mode) and
 * renders nothing otherwise. Visitor-safe: without the hint cookie it issues
 * no requests at all; with it, one state lookup whose answer the server
 * derives from credentials the browser can't read. When that answer is "edit",
 * "view" or "shared" and the URL lacks the marker (`?_onpage=1`), it reloads
 * the page at the marked URL instead (see `MARKER_PARAM`).
 */
export function OnPage({ mount: Mount = OnPageMount, ...props }: OnPageProps) {
  const [state, setState] = useState<{ mode: OnPageMode | null; shared: boolean } | null>(null)
  useEffect(() => {
    if (!hasHint()) return
    let live = true
    getOnPageState({ data: { pathname: window.location.pathname } }).then(
      (s) => {
        if (!live) return
        // Editing or previewing on an unmarked URL (typed, bookmarked, a plain
        // link): move to the marked one, which no edge cache answers for
        // everyone. Not inside frames (live preview asks with ?draft=true).
        if ((s.mode || s.shared) && !hasMarker(window.location.search) && !inFrame()) {
          window.location.replace(withMarker(window.location.href))
          return
        }
        setState(s)
      },
      () => {
        if (live) setState(null)
      },
    )
    return () => {
      live = false
    }
  }, [])
  if (!state || (!state.mode && !state.shared)) return null
  return <Mount {...props} mode={state.mode ?? 'view'} shared={state.shared} />
}
