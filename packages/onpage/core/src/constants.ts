/** Defaults shared by every package, so routes and names are defined once. */
export const DEFAULTS = {
  apiRoute: '/api',
  routePrefix: '/onpage',
  adminRoute: '/admin',
} as const

/** The plugin's endpoints, under `${apiRoute}${routePrefix}`. One list for the plugin and every client. */
export const ROUTES = {
  schema: '/schema',
  enter: '/enter',
  mode: '/mode',
  exit: '/exit',
  previewLink: '/preview-link',
  preview: '/preview',
  schedule: '/schedule',
  conditions: '/conditions',
  lock: '/lock',
  comments: '/comments',
  review: '/review',
  pages: '/pages',
  patterns: '/patterns',
} as const

/**
 * The Payload request-context key that asks a read for auto-mapping markers.
 * `onpageContext()` sets it; the plugin's afterRead hook reads it.
 */
export const CONTEXT_KEY = 'onpage'

/** Cookies and headers used by the Next.js adapter and its proxy. */
export const COOKIE = {
  /** Editor mode, bound to the signed-in session and sealed: `edit|view:<authCookie>:<hash>.<seal>` (see `createModeCookie`). */
  mode: 'onpage',
  /** Sealed preview-link grant (path, expiry, Next's draft secret); only the proxy can read it. */
  preview: 'onpage_preview',
  /** Next.js's draft-mode cookie. */
  nextDraft: '__prerender_bypass',
} as const

export const HEADER = {
  /** Request path, set by the proxy (server components can't see it otherwise). */
  path: 'x-onpage-path',
  /** Set by the proxy when this request is a preview-link view. */
  shared: 'x-onpage-shared',
  /** Stale-write guard: the `updatedAt` the editor last saw. */
  ifUnmodifiedSince: 'x-onpage-if-unmodified-since',
} as const

/**
 * The query parameter that gives edit-mode and preview-link pages their own
 * URL (`/about?_onpage=1`). An edge cache keyed by URL (Workers Cache) never
 * sees cookies, so without it an editor could be served the cached published
 * page. It is only a cache key: it grants nothing, and the server still checks
 * the sealed mode cookie or preview grant. A marked URL without them renders
 * the published page, so a host must never let a shared cache store a
 * response to a marked URL, whatever it renders (the app does it in
 * `src/start.ts`); otherwise that page would be served to the next editor.
 */
export const MARKER_PARAM = '_onpage'
