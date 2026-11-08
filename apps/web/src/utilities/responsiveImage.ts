/**
 * Responsive variants of uploaded images, served by `/img/<R2 key>` (src/app/img.$.ts), which
 * resizes the original in R2 with the Cloudflare Images binding. Client-safe: no runtime imports.
 *
 * URL shape: `/img/[<prefix>/]<objectKey>/<filename>?w=<width>&f=<avif|webp>[&v=<updatedAt>]`.
 * The path is the object's R2 key as `@payloadcms/plugin-cloud-storage` builds it (Payload 4
 * stores each upload under its own `_objectKey` folder), so the route reads R2 directly, with no
 * database lookup. The width comes from a fixed list and the format is explicit, so every variant
 * is its own URL: the cache key needs no `Vary: Accept`, and the browser picks the format through
 * `<source type>`. `v` is the media doc's `updatedAt`, the same cache tag `getMediaUrl` appends;
 * it makes the URL immutable.
 */

/** Widths the resize route serves. Anything else is a 400, so variants stay bounded. */
export const IMAGE_WIDTHS = [320, 640, 960, 1280, 1920, 2560] as const

/** Output formats, best first. Images bills a width once whatever the format. */
export const IMAGE_FORMATS = ['avif', 'webp'] as const
export type ImageFormat = (typeof IMAGE_FORMATS)[number]

/** Source types the route resizes. SVG (vector) and GIF (often animated) are served as they are. */
export const RESIZABLE_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const

export const IMAGE_ROUTE = '/img/'

/** Where Payload serves `media` files (`routes.api` is the default `/api`). */
export const MEDIA_FILE_ROUTE = '/api/media/file/'

/**
 * `sizes` when the caller gives none: the image is at most as wide as the viewport, and no wider
 * than the 2xl container. Over-estimates for half-width layouts; pass `size` for those.
 */
export const DEFAULT_IMAGE_SIZES = '(min-width: 1536px) 1536px, 100vw'

export const isResizableImage = (mimeType: string | null | undefined): boolean =>
  !!mimeType && (RESIZABLE_IMAGE_TYPES as readonly string[]).includes(mimeType.toLowerCase())

/**
 * Whether pages emit resized variants. Off under `vite dev` (and vitest): the Node dev server
 * writes uploads to `media/`, not R2, so there is nothing for the route to resize, and images
 * fall back to the original URL. `pnpm preview` and deployed Workers build with it on.
 */
export const responsiveImagesEnabled = (): boolean => !import.meta.env.DEV

/** The media doc's `updatedAt` as a cache tag is a date; anything else doesn't version a URL. */
export const isVersionTag = (tag: string | null | undefined): boolean =>
  !!tag && !Number.isNaN(Date.parse(tag))

/** Where an upload sits in storage: the semantic `prefix` and the per-upload `_objectKey` folder. */
interface StorageLocation {
  _objectKey?: string | null
  filename?: string | null
  prefix?: string | null
}

export interface ResponsiveImageSource extends StorageLocation {
  /** The upload's `url`, e.g. `/api/media/file/hero.jpg`. */
  url?: string | null
  /** Intrinsic width in pixels. Without it there is no safe candidate list. */
  width?: number | null
  mimeType?: string | null
  updatedAt?: string | null
  original?: StorageLocation | null
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/**
 * R2 keys the resize route may read: `[<prefix>/]<objectKey>/<filename>`, or a bare `<filename>`
 * for uploads stored before object keys. Anything else in the bucket (the SEO analyzer's cache
 * under `seo-analyzer/cache/`) doesn't match.
 */
export const IMAGE_KEY_PATTERN = new RegExp(`^(?:(?:[^/]+/)*${UUID}/)?[^/]+$`, 'i')

const cleanSegments = (value: string | null | undefined): string[] =>
  (value ?? '').split('/').filter((segment) => segment && segment !== '.' && segment !== '..')

/**
 * The upload's R2 key, URL-encoded per segment, or `null` when it can't be told from the doc.
 * Mirrors plugin-cloud-storage's `getRepresentationPrefix`: the `original` representation's
 * location when the URL serves it, else the doc's own.
 */
export const mediaStorageKeyPath = (resource: ResponsiveImageSource): string | null => {
  const path = resource.url?.split('?')[0]
  if (!path?.startsWith(MEDIA_FILE_ROUTE)) return null
  let filename: string
  try {
    filename = decodeURIComponent(path.slice(MEDIA_FILE_ROUTE.length))
  } catch {
    return null
  }
  if (!filename || filename.includes('/')) return null

  const { original } = resource
  const servesOriginal = !!original?.filename && original.filename === filename
  const location: StorageLocation = servesOriginal ? original! : resource
  const key = [...cleanSegments(location.prefix), ...cleanSegments(location._objectKey), filename]
  const keyPath = key.map(encodeURIComponent).join('/')
  return IMAGE_KEY_PATTERN.test(key.join('/')) ? keyPath : null
}

export interface ResponsiveImageSet {
  format: ImageFormat
  /** `image/avif`, `image/webp`: the `<source type>`. */
  type: string
  srcSet: string
}

/** `/img/<key>?w=…&f=…&v=…` for one variant; `keyPath` is URL-encoded per segment. */
export const imageVariantUrl = (
  keyPath: string,
  width: number,
  format: ImageFormat,
  version?: string | null,
): string => {
  const params = new URLSearchParams({ f: format, w: String(width) })
  if (isVersionTag(version)) params.set('v', version!)
  return `${IMAGE_ROUTE}${keyPath}?${params.toString()}`
}

/**
 * The candidate widths for an image `intrinsicWidth` px wide: every listed width below it, then
 * the first listed width at or above it, described with the intrinsic width (the route never
 * upscales, so that variant comes back at the original size).
 */
export const candidateWidths = (
  intrinsicWidth: number,
): Array<{ descriptor: number; width: number }> => {
  const candidates: Array<{ descriptor: number; width: number }> = []
  for (const width of IMAGE_WIDTHS) {
    if (width < intrinsicWidth) {
      candidates.push({ descriptor: width, width })
    } else {
      candidates.push({ descriptor: intrinsicWidth, width })
      break
    }
  }
  return candidates
}

/**
 * One `srcset` per output format for an uploaded image, or `null` when the image can't be resized
 * (not served by Payload's media route, SVG/GIF, unknown width or storage key): render the
 * original then.
 */
export const buildResponsiveImageSets = (
  resource: ResponsiveImageSource,
): ResponsiveImageSet[] | null => {
  const { mimeType, updatedAt, width } = resource
  if (!width || width <= 0 || !isResizableImage(mimeType)) return null

  // Only Payload's own media URLs map to an R2 key.
  const keyPath = mediaStorageKeyPath(resource)
  if (!keyPath) return null

  const candidates = candidateWidths(width)
  return IMAGE_FORMATS.map((format) => ({
    format,
    srcSet: candidates
      .map(
        ({ descriptor, width: w }) =>
          `${imageVariantUrl(keyPath, w, format, updatedAt)} ${descriptor}w`,
      )
      .join(', '),
    type: `image/${format}`,
  }))
}

/** One year: the URL changes whenever the file does. */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

/**
 * A URL without the `updatedAt` tag can point at a newer file later (re-uploading keeps the
 * filename), so it stays fresh for 5 minutes, then is served stale for up to a day while the
 * cache refetches it.
 */
export const UNVERSIONED_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=86400'

export const publicMediaCacheControl = (versioned: boolean): string =>
  versioned ? IMMUTABLE_CACHE_CONTROL : UNVERSIONED_CACHE_CONTROL
