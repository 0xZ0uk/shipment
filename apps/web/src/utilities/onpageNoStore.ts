import { hasMarker } from '@shipment/onpage-core'

/** Cache-Control headers only CDNs read; Cloudflare's cache honours them over `Cache-Control`. */
const CDN_CACHE_HEADERS = ['Cloudflare-CDN-Cache-Control', 'CDN-Cache-Control']

/**
 * Responses to URLs carrying the on-page marker (`?_onpage=1`, `MARKER_PARAM`) are never stored
 * in a shared cache, whatever they render. Marked URLs exist so an editor's or preview-link
 * viewer's page has its own cache key; a marked URL can still render the published page (a link
 * viewer outside their grant, an editor whose mode cookie expired), and if that were cached under
 * the marked key, the next editor in edit mode would be served it: no draft, no markers, a broken
 * editor. Only editors and link viewers ever have the marker, so visitors lose no caching.
 *
 * This overrides any `Cache-Control` the handler set (a public opt-in included), and drops the
 * CDN-only headers (`Cloudflare-CDN-Cache-Control`, `CDN-Cache-Control`), which Cloudflare's cache
 * reads before `Cache-Control`: left in place, they would still let the edge store the page.
 */
export const withOnPageNoStore = (request: Request, response: Response): Response => {
  if (!hasMarker(new URL(request.url).search)) return response
  const cdnHeaders = CDN_CACHE_HEADERS.filter((name) => response.headers.has(name))
  if (response.headers.get('Cache-Control') === 'private, no-store' && cdnHeaders.length === 0) {
    return response
  }

  // Responses from Payload's endpoint router can have immutable headers.
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'private, no-store')
  for (const name of cdnHeaders) headers.delete(name)
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}
