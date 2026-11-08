import {
  IMAGE_FORMATS,
  IMAGE_KEY_PATTERN,
  IMAGE_ROUTE,
  IMAGE_WIDTHS,
  type ImageFormat,
  isResizableImage,
  isVersionTag,
  MEDIA_FILE_ROUTE,
  publicMediaCacheControl,
} from './responsiveImage'

/** What the route needs from the Worker's bindings; tests pass fakes. */
export interface ResizeBindings {
  bucket?: Pick<R2Bucket, 'get'>
  images?: Pick<ImagesBinding, 'input'>
  onError?: (error: unknown) => void
}

const ALLOWED_PARAMS = new Set(['f', 'v', 'w'])

/** Not cached anywhere: errors, and redirects that depend on what the binding could do just now. */
const NO_STORE = 'no-store'

const text = (body: string, status: number) =>
  new Response(body, {
    headers: { 'Cache-Control': NO_STORE, 'Content-Type': 'text/plain' },
    status,
  })

const toOriginal = (filename: string, version: string | null) =>
  new Response(null, {
    headers: {
      'Cache-Control': NO_STORE,
      Location: `${MEDIA_FILE_ROUTE}${encodeURIComponent(filename)}${version ? `?${encodeURIComponent(version)}` : ''}`,
    },
    status: 307,
  })

/**
 * `GET /img/<key>?w=<width>&f=<avif|webp>[&v=<updatedAt>]`: the `media` upload stored in R2 at
 * `<key>` (`[<prefix>/]<objectKey>/<filename>`, see `mediaStorageKeyPath`) resized to one of
 * `IMAGE_WIDTHS` and re-encoded, with a long-lived public `Cache-Control` so Workers Cache can
 * serve it without running the Worker.
 *
 * - Unknown widths, formats or parameters are a 400, so the set of variants stays bounded.
 * - Keys that don't look like an upload's are a 404 (`IMAGE_KEY_PATTERN`): the bucket also holds
 *   the SEO analyzer's cache under `seo-analyzer/cache/`. Every `media` file is public.
 * - Non-images are a 415. SVG and GIF (vector, often animated) redirect to the original.
 * - Without the binding (the Node dev server, which keeps uploads in `media/`), or when the
 *   transform fails (a corrupt file, the Free plan's monthly limit), it redirects to the original,
 *   uncached, so the page still shows the image.
 */
export const serveResizedImage = async (
  request: Request,
  bindings: ResizeBindings,
): Promise<Response> => {
  const url = new URL(request.url)
  if (!url.pathname.startsWith(IMAGE_ROUTE)) return text('Not Found', 404)

  let segments: string[]
  try {
    segments = url.pathname.slice(IMAGE_ROUTE.length).split('/').map(decodeURIComponent)
  } catch {
    return text('Not Found', 404)
  }
  const key = segments.join('/')
  const isUploadKey =
    IMAGE_KEY_PATTERN.test(key) &&
    segments.every((s) => s && s !== '.' && s !== '..' && !s.includes('/') && !s.includes('\\'))
  if (!isUploadKey) return text('Not Found', 404)
  const filename = key.slice(key.lastIndexOf('/') + 1)

  for (const param of url.searchParams.keys()) {
    if (!ALLOWED_PARAMS.has(param)) return text(`Unknown parameter: ${param}`, 400)
  }
  const width = Number(url.searchParams.get('w'))
  if (!(IMAGE_WIDTHS as readonly number[]).includes(width)) {
    return text(`w must be one of ${IMAGE_WIDTHS.join(', ')}`, 400)
  }
  const format = url.searchParams.get('f') as ImageFormat | null
  if (!format || !IMAGE_FORMATS.includes(format)) {
    return text(`f must be one of ${IMAGE_FORMATS.join(', ')}`, 400)
  }
  const version = url.searchParams.get('v')
  if (version !== null && !isVersionTag(version))
    return text('v must be the upload’s updatedAt', 400)

  const { bucket, images } = bindings
  if (!bucket || !images) return toOriginal(filename, version)

  const object = await bucket.get(key)
  if (!object) return text('Not Found', 404)

  const contentType = object.httpMetadata?.contentType ?? ''
  if (!isResizableImage(contentType)) {
    // The body is never read: release the R2 stream.
    await object.body.cancel().catch(() => {})
    return contentType.startsWith('image/')
      ? toOriginal(filename, version)
      : text('Not an image', 415)
  }

  try {
    const result = await images
      .input(object.body)
      .transform({ fit: 'scale-down', width })
      .output({ format: `image/${format}` })

    return new Response(result.image(), {
      headers: {
        'Cache-Control': publicMediaCacheControl(version !== null),
        'Content-Type': result.contentType(),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    bindings.onError?.(error)
    return toOriginal(filename, version)
  }
}
