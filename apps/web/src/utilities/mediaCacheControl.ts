import { isVersionTag, MEDIA_FILE_ROUTE, publicMediaCacheControl } from './responsiveImage'

/**
 * `Cache-Control` for files Payload serves from `/api/media/file/<filename>`. The R2 adapter
 * (`@payloadcms/storage-r2`) sends none (only what the R2 object's metadata carries, and uploads
 * set just the content type), and Payload's `modifyResponseHeaders` hook can't see the request,
 * so this runs on the response, from a request middleware in src/start.ts.
 *
 * `media` is public (`read: () => true`). A URL carrying the `?<updatedAt>` tag that
 * `getMediaUrl` appends is immutable for a year; an untagged one stays short-lived, since
 * re-uploading can keep the filename. Only full and not-modified responses opt in: ranges, errors
 * and anything setting a cookie keep no header (private once #161's default applies). Other
 * upload collections are untouched: add one here only if its `read` access is public.
 */
export const withMediaCacheControl = (request: Request, response: Response): Response => {
  if (request.method !== 'GET' && request.method !== 'HEAD') return response
  if (response.status !== 200 && response.status !== 304) return response
  if (response.headers.has('Cache-Control') || response.headers.has('Set-Cookie')) return response

  const url = new URL(request.url)
  if (!url.pathname.startsWith(MEDIA_FILE_ROUTE)) return response

  let tag: string | null = null
  try {
    tag = decodeURIComponent(url.search.slice(1))
  } catch {
    // A malformed tag is just not a version.
  }

  // Responses from Payload's endpoint router can have immutable headers.
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', publicMediaCacheControl(isVersionTag(tag)))
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}
