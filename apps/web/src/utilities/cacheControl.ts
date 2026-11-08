/**
 * Cache rules for Workers Cache (https://developers.cloudflare.com/workers/cache/), which is
 * checked before the Worker runs and keys entries by URL alone (request cookies are not part of
 * the key). A 200 without `Cache-Control` would be stored for two hours and served to everyone,
 * a signed-in editor's `/api/users/me` included. So:
 *
 * - **Responses are private unless they opt in.** `withDefaultCacheControl` (wrapped around
 *   `fetch` in `src/server.ts`) gives every response without a `Cache-Control` header
 *   `private, no-cache`, and leaves a response that set its own alone.
 * - **Only an anonymous, published page view opts in** (`isPublicPageView`, from `loadPage` and
 *   the blog's loaders; the RSS feed when `SITE_URL` is set), with `publicPageHeaders`: a short browser lifetime, a longer edge lifetime and `Cache-Tag`s
 *   that the purge hooks (`src/plugins/edgeCachePurge.ts`) clear on publish.
 *
 * Pure: no Payload, TanStack or `cloudflare:workers` imports, so tests and the server entry can
 * load it.
 */

/**
 * What every response gets unless it set its own `Cache-Control`. `private` is what keeps it out
 * of Workers Cache (and any shared cache); `no-cache` makes browsers revalidate before reusing it.
 * Not `no-store`: Chrome never finishes a `no-store` response whose body the page doesn't read
 * (fire-and-forget POSTs in the admin), which keeps requests open and the page from going idle.
 * Responses that render drafts or experiments still set `private, no-store` themselves.
 */
export const PRIVATE_CACHE_CONTROL = 'private, no-cache'

/** Tag on every page view: the header and footer render on all of them. */
export const LAYOUT_TAG = 'layout'

/** Tag on the page served at `path` (`pagePath(slug)`: `/`, `/about`). */
export const pageTag = (path: string) => `page:${path}`

/**
 * Tag on every response that lists posts: the blog and category archives, the RSS feed, and
 * pages with a Posts archive block. Publishing, unpublishing, changing or deleting a post purges
 * it, and so does a change to an author or a category (their names show in the lists).
 */
export const POSTS_TAG = 'posts'

/** Tag on the post pages that show author `id` (their byline). */
export const authorTag = (id: number | string) => `author:${id}`

/** Tag on the post pages and the archive that show category `id`. */
export const categoryTag = (id: number | string) => `category:${id}`

/** The ids of a relationship value (populated documents or bare ids). */
const relationIds = (list: unknown): (number | string)[] =>
  Array.isArray(list)
    ? list
        .map((item) => (item && typeof item === 'object' ? (item as { id?: unknown }).id : item))
        .filter((id): id is number | string => typeof id === 'number' || typeof id === 'string')
    : []

/**
 * A post page's tags on top of its path and `layout`: its authors' and categories' (their names
 * show on it). Not `posts`: publishing another post changes nothing on this one.
 */
export const postPageTags = (post: { authors?: unknown; categories?: unknown }): string[] => [
  ...relationIds(post.authors).map(authorTag),
  ...relationIds(post.categories).map(categoryTag),
]

/** An archive page's tags on top of its path and `layout`: `posts`, and its category's. */
export const archivePageTags = (categoryId?: null | number | string): string[] => [
  POSTS_TAG,
  ...(categoryId != null ? [categoryTag(categoryId)] : []),
]

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

/**
 * The headers a response that opted in gets (`loadPage`, the blog's loaders and its feed): its
 * path's tag, `layout`, and `tags` for what else it shows (`posts`, an author, a category).
 * `layout` goes on every cached response, the feed included: the purger falls back to purging it
 * alone when a batch is large, so it must cover everything (`createEdgeCachePurger`).
 */
export const publicPageHeaders = (
  path: string,
  tags: readonly string[] = [],
): Record<string, string> => ({
  'Cache-Control': PUBLIC_PAGE_CACHE_CONTROL,
  'Cloudflare-CDN-Cache-Control': PUBLIC_PAGE_CDN_CACHE_CONTROL,
  'Cache-Tag': [...new Set([pageTag(path), LAYOUT_TAG, ...tags])].join(','),
})

/**
 * Gives `response` `Cache-Control: private, no-cache` unless it already has a `Cache-Control`
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
