import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

import { withMediaCacheControl } from '@/utilities/mediaCacheControl'
import { withOnPageNoStore } from '@/utilities/onpageNoStore'
import { MEDIA_FILE_ROUTE } from '@/utilities/responsiveImage'
import { trailingSlashTarget } from '@/utilities/trailingSlash'

/**
 * `/foo/` → 308 `/foo`. Without it, TanStack's SSR redirects with a hard-coded 307 before any
 * route or `seo-redirects` lookup runs, and search engines treat a 307 as temporary.
 */
const trailingSlashMiddleware = createMiddleware({ type: 'request' }).server(({ next, request }) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return next()

  const target = trailingSlashTarget(new URL(request.url))
  if (!target) return next()

  return new Response(null, { headers: { Location: target }, status: 308 })
})

/** No shared cache may store a response to a marked (`?_onpage=1`) URL; see withOnPageNoStore. */
const onpageNoStoreMiddleware = createMiddleware({ type: 'request' }).server(async ({ next, request }) => {
  const result = await next()
  return { ...result, response: withOnPageNoStore(request, result.response) }
})

/** Public, long-lived `Cache-Control` on media files (`/api/media/file/*`); see withMediaCacheControl. */
const mediaCacheMiddleware = createMiddleware({ type: 'request' }).server(async ({ next, pathname, request }) => {
  if (!pathname.startsWith(MEDIA_FILE_ROUTE)) return next()
  const result = await next()
  return { ...result, response: withMediaCacheControl(request, result.response) }
})

export const startInstance = createStart(() => ({
  requestMiddleware: [
    // Defining a start instance replaces TanStack's default request middleware, which is
    // exactly this CSRF check on server-function calls. Keep it.
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' }),
    trailingSlashMiddleware,
    // Before (so around) every middleware that sets Cache-Control: it has the last word.
    onpageNoStoreMiddleware,
    mediaCacheMiddleware,
  ],
}))
