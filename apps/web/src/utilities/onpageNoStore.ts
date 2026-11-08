import { hasMarker } from '@shipment/onpage-core'

/**
 * Responses to URLs carrying the on-page marker (`?_onpage=1`, `MARKER_PARAM`) are never stored
 * in a shared cache, whatever they render. Marked URLs exist so an editor's or preview-link
 * viewer's page has its own cache key; a marked URL can still render the published page (a link
 * viewer outside their grant, an editor whose mode cookie expired), and if that were cached under
 * the marked key, the next editor in edit mode would be served it: no draft, no markers, a broken
 * editor. Only editors and link viewers ever have the marker, so visitors lose no caching.
 *
 * This overrides any `Cache-Control` the handler set (a public opt-in included).
 */
export const withOnPageNoStore = (request: Request, response: Response): Response => {
  if (!hasMarker(new URL(request.url).search)) return response
  if (response.headers.get('Cache-Control') === 'private, no-store') return response

  // Responses from Payload's endpoint router can have immutable headers.
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'private, no-store')
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}
