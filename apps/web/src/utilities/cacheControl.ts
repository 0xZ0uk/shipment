/**
 * Cache rules for Workers Cache (https://developers.cloudflare.com/workers/cache/), which is
 * checked before the Worker runs and keys entries by URL alone (request cookies are not part of
 * the key). A 200 without `Cache-Control` would be stored for two hours and served to everyone,
 * a signed-in editor's `/api/users/me` included. So:
 *
 * - **Responses are private unless they opt in.** `withDefaultCacheControl` (wrapped around
 *   `fetch` in `src/server.ts`) gives every response without a `Cache-Control` header
 *   `private, no-store`, and leaves a response that set its own alone.
 * - **Only an anonymous, published page view opts in** (`isPublicPageView`, from `loadPage`),
 *   with `publicPageHeaders`: a short browser lifetime, a longer edge lifetime and `Cache-Tag`s
 *   that the purge hooks (`src/plugins/edgeCachePurge.ts`) clear on publish.
 *
 * Pure: no Payload, TanStack or `cloudflare:workers` imports, so tests and the server entry can
 * load it.
 */

/** What every response gets unless it set its own `Cache-Control`. */
export const PRIVATE_CACHE_CONTROL = 'private, no-store'

/** Tag on every page view: the header and footer render on all of them. */
export const LAYOUT_TAG = 'layout'

/** Tag on the page served at `path` (`pagePath(slug)`: `/`, `/about`). */
export const pageTag = (path: string) => `page:${path}`

/**
 * Browsers (and any other cache on the way) check back every time: the edge answers from its
 * cache, and an editor who reloads right after publishing sees the purged, fresh page.
 */
export const PUBLIC_PAGE_CACHE_CONTROL = 'public, max-age=0, must-revalidate'

/**
 * The edge's own lifetime (`Cloudflare-CDN-Cache-Control`, read by Cloudflare only, ahead of
 * `Cache-Control`). Publishing purges by tag, so the TTL only bounds how long a change that
 * purged nothing can show: a purge that failed, or an A/B manifest change that another colo's
 * 30 s manifest cache hadn't seen yet. 5 minutes keeps that short; past it, a stale copy is
 * served for up to a day while one request re-renders it in the background, so a page nobody
 * visited for a while still answers from the cache. No `s-maxage`: in Workers Cache it turns
 * stale serving off.
 */
export const PUBLIC_PAGE_CDN_CACHE_CONTROL = 'max-age=300, stale-while-revalidate=86400'

/** The headers `loadPage` sets on a page view that opted in. */
export const publicPageHeaders = (path: string): Record<string, string> => ({
  'Cache-Control': PUBLIC_PAGE_CACHE_CONTROL,
  'Cloudflare-CDN-Cache-Control': PUBLIC_PAGE_CDN_CACHE_CONTROL,
  'Cache-Tag': [pageTag(path), LAYOUT_TAG].join(','),
})

/**
 * Gives `response` `Cache-Control: private, no-store` unless it already has a `Cache-Control`
 * header (pages that opted in, plugin files, media). Returns the same response when it can set
 * the header in place, a copy when its headers are immutable (a `fetch` result passed through).
 * WebSocket upgrades are returned as they are.
 */
export function withDefaultCacheControl(response: Response): Response {
  if (response.headers.has('Cache-Control') || response.status === 101) return response
  try {
    response.headers.set('Cache-Control', PRIVATE_CACHE_CONTROL)
    return response
  } catch {
    const copy = new Response(response.body, response)
    copy.headers.set('Cache-Control', PRIVATE_CACHE_CONTROL)
    return copy
  }
}

/** What `loadPage` knows about a request when it decides whether the page may be cached. */
export type PageViewState = {
  /** The request is a full HTML document (SSR), not a `/_serverFn` call from client navigation. */
  document: boolean
  /** `?draft=true` was asked for (live preview), signed in or not. */
  draftParam: boolean
  /** A valid on-page mode cookie or a preview-link grant for this URL (`isDraftEnabled`). */
  onpageDraft: boolean
  /** On-page edit mode: strings carry markers. */
  markers: boolean
  /** A preview-link grant for the page being rendered (`previewGrantFor`). */
  previewGrant: boolean
  /** A Payload user was resolved for this request. */
  user: boolean
  /** The draft is shown. */
  draft: boolean
  /** The page runs an A/B experiment, or its manifest couldn't be read (`routeAb().varies`). */
  abVaries: boolean
  /** The response sets a cookie (an A/B bucket, a session). */
  setsCookie: boolean
  /** A published page is rendered (no 404, no redirect to a variant's original). */
  found: boolean
  /**
   * `SITE_URL` is configured. Workers Cache keys don't include the host, so cached HTML must read
   * the same on every hostname the Worker answers (`workers.dev` and the custom domain): without
   * `SITE_URL`, canonical URLs, `og:url` and JSON-LD fall back to the request's origin.
   */
  siteUrlConfigured: boolean
}

/**
 * True only when every viewer of this URL gets the same HTML: a full document of a published
 * page, for a request with no editor or preview state, no experiment and no cookie set, on a
 * site whose public URL is configured (no host-derived URLs in the HTML). Decided
 * from the request's actual state, never from a URL marker. 404s stay private (the SEO 404
 * monitor counts them in the Worker), and so do server-function responses for now.
 */
export const isPublicPageView = (s: PageViewState): boolean =>
  s.document &&
  s.found &&
  s.siteUrlConfigured &&
  !s.draftParam &&
  !s.onpageDraft &&
  !s.markers &&
  !s.previewGrant &&
  !s.user &&
  !s.draft &&
  !s.abVaries &&
  !s.setsCookie
