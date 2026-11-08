import { stegaEncode } from '@shipment/onpage-core'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Media } from '@/payload-types'

import { ImageMedia } from '@/components/Media/ImageMedia'
import { withMediaCacheControl } from '@/utilities/mediaCacheControl'
import {
  buildResponsiveImageSets,
  mediaStorageKeyPath,
  candidateWidths,
  IMAGE_WIDTHS,
  IMMUTABLE_CACHE_CONTROL,
  imageVariantUrl,
  UNVERSIONED_CACHE_CONTROL,
} from '@/utilities/responsiveImage'
import { type ResizeBindings, serveResizedImage } from '@/utilities/serveResizedImage'

const updatedAt = '2026-11-08T10:00:00.000Z'
const v = encodeURIComponent(updatedAt)
// Payload 4 stores each upload in R2 under its own object-key folder.
const objectKey = '1be533e5-c1a9-4d6b-9a26-32e4bb0fee30'
const key = `${objectKey}/harbour.jpg`

const photo = {
  alt: 'A harbour at dusk',
  createdAt: updatedAt,
  filename: 'harbour.jpg',
  height: 1000,
  id: 1,
  mimeType: 'image/jpeg',
  updatedAt,
  url: '/api/media/file/harbour.jpg',
  width: 1500,
  _objectKey: objectKey,
  prefix: '',
  original: { _objectKey: objectKey, filename: 'harbour.jpg', prefix: '' },
} as Media

describe('responsive image URLs', () => {
  it('lists the widths below the original, then one variant at the original size', () => {
    expect(candidateWidths(1500)).toEqual([
      { descriptor: 320, width: 320 },
      { descriptor: 640, width: 640 },
      { descriptor: 960, width: 960 },
      { descriptor: 1280, width: 1280 },
      { descriptor: 1500, width: 1920 },
    ])
    expect(candidateWidths(200)).toEqual([{ descriptor: 200, width: 320 }])
    // Wider than the list: every width, never upscaled.
    expect(candidateWidths(4000).map((c) => c.width)).toEqual([...IMAGE_WIDTHS])
  })

  it('builds an AVIF and a WebP srcset from the media URL, versioned by updatedAt', () => {
    const sets = buildResponsiveImageSets(photo)
    expect(sets?.map((s) => s.type)).toEqual(['image/avif', 'image/webp'])
    expect(sets?.[0]?.srcSet.split(', ')).toEqual([
      `/img/${key}?f=avif&w=320&v=${v} 320w`,
      `/img/${key}?f=avif&w=640&v=${v} 640w`,
      `/img/${key}?f=avif&w=960&v=${v} 960w`,
      `/img/${key}?f=avif&w=1280&v=${v} 1280w`,
      `/img/${key}?f=avif&w=1920&v=${v} 1500w`,
    ])
  })

  it('keeps the filename as Payload encoded it, and drops a tag that is not a date', () => {
    expect(imageVariantUrl('my%20photo.png', 640, 'webp', 'nope')).toBe(
      '/img/my%20photo.png?f=webp&w=640',
    )
  })

  it('maps the URL to the R2 key the storage adapter wrote', () => {
    expect(mediaStorageKeyPath(photo)).toBe(key)
    // Uploads from before object keys sit at the bucket root.
    expect(mediaStorageKeyPath({ url: '/api/media/file/old.png' })).toBe('old.png')
    expect(
      mediaStorageKeyPath({
        original: { _objectKey: objectKey, filename: 'my photo.png', prefix: 'site/a' },
        url: '/api/media/file/my%20photo.png',
      }),
    ).toBe(`site/a/${objectKey}/my%20photo.png`)
    // Not the original's filename: the doc's own location.
    expect(
      mediaStorageKeyPath({
        _objectKey: objectKey,
        original: { filename: 'x.png' },
        url: photo.url,
      }),
    ).toBe(key)
    expect(mediaStorageKeyPath({ _objectKey: 'not-a-uuid', url: photo.url })).toBeNull()
  })

  it.each([
    ['SVG', { mimeType: 'image/svg+xml' }],
    ['GIF', { mimeType: 'image/gif' }],
    ['a PDF', { mimeType: 'application/pdf' }],
    ['no width', { width: null }],
    ['an external URL', { url: 'https://example.com/a.jpg' }],
    ['no URL', { url: null }],
  ])('has no variants for %s', (_, override) => {
    expect(buildResponsiveImageSets({ ...photo, ...override })).toBeNull()
  })
})

describe('ImageMedia', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders the original only under the dev server (no Images binding)', () => {
    const html = renderToStaticMarkup(<ImageMedia resource={photo} />)
    expect(html).not.toContain('<source')
    expect(html).not.toContain('srcSet')
    expect(html).toContain(`src="/api/media/file/harbour.jpg?${v}"`)
  })

  it('renders AVIF and WebP sources with sizes, keeping the original, width, height and loading', () => {
    vi.stubEnv('DEV', false)
    const html = renderToStaticMarkup(<ImageMedia priority resource={photo} />)
    expect(html).toMatch(
      /<source sizes="\(min-width: 1536px\) 1536px, 100vw" srcSet="\/img\/1be533e5-c1a9-4d6b-9a26-32e4bb0fee30\/harbour\.jpg\?f=avif&amp;w=320/,
    )
    expect(html).toContain('type="image/avif"')
    expect(html).toContain('type="image/webp"')
    expect(html.indexOf('image/avif')).toBeLessThan(html.indexOf('image/webp'))
    expect(html).toContain(`src="/api/media/file/harbour.jpg?${v}"`)
    expect(html).toContain('width="1500"')
    expect(html).toContain('height="1000"')
    expect(html).toContain('loading="eager"')
    expect(html).toContain('fetchPriority="high"')
  })

  it('passes a caller’s sizes to the sources, and leaves SVGs alone', () => {
    vi.stubEnv('DEV', false)
    expect(renderToStaticMarkup(<ImageMedia resource={photo} size="50vw" />)).toContain(
      '<source sizes="50vw"',
    )
    const svg = renderToStaticMarkup(
      <ImageMedia
        resource={{ ...photo, mimeType: 'image/svg+xml', url: '/api/media/file/logo.svg' }}
      />,
    )
    expect(svg).not.toContain('<source')
  })

  it('strips on-page markers from the alt text and the storage fields', () => {
    vi.stubEnv('DEV', false)
    const marker = { kind: 'text', path: 'alt', ref: 'c:media:1' } as const
    const html = renderToStaticMarkup(
      <ImageMedia
        resource={{
          ...photo,
          alt: stegaEncode(photo.alt, marker),
          mimeType: stegaEncode('image/jpeg', { ...marker, path: 'mimeType' }),
          original: {
            ...photo.original,
            filename: stegaEncode('harbour.jpg', { ...marker, path: 'original.filename' }),
            prefix: stegaEncode('', { ...marker, path: 'original.prefix' }),
          },
        }}
      />,
    )
    expect(html).toContain('alt="A harbour at dusk"')
    expect(html).toContain(`srcSet="/img/${key}?f=avif&amp;w=320`)
  })
})

/** An R2 object with just what the route reads. */
const r2Object = (contentType: string) => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.close()
    },
  })
  return { body, httpMetadata: { contentType } } as unknown as R2ObjectBody
}

const fakeBindings = (objects: Record<string, string>, transform?: () => never) => {
  const calls: Array<{ format: string; transform: ImageTransform }> = []
  const bindings: ResizeBindings = {
    bucket: { get: async (key: string) => (objects[key] ? r2Object(objects[key]) : null) } as never,
    images: {
      input: () => {
        let applied: ImageTransform = {}
        const transformer = {
          output: async ({ format }: ImageOutputOptions) => {
            transform?.()
            calls.push({ format, transform: applied })
            return {
              contentType: () => format,
              image: () => new Blob(['resized']).stream(),
              response: () => new Response('resized'),
            }
          },
          transform: (t: ImageTransform) => {
            applied = t
            return transformer
          },
        }
        return transformer as unknown as ImageTransformer
      },
    },
  }
  return { bindings, calls }
}

const get = (path: string, bindings: ResizeBindings) =>
  serveResizedImage(new Request(`https://example.com${path}`), bindings)

describe('/img/* route', () => {
  const objects = {
    'anim.gif': 'image/gif',
    'doc.pdf': 'application/pdf',
    [key]: 'image/jpeg',
    'logo.svg': 'image/svg+xml',
  }

  it('resizes to a listed width and format, immutable when versioned', async () => {
    const { bindings, calls } = fakeBindings(objects)
    const response = await get(`/img/${key}?f=avif&w=640&v=${v}`, bindings)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/avif')
    expect(response.headers.get('Cache-Control')).toBe(IMMUTABLE_CACHE_CONTROL)
    expect(await response.text()).toBe('resized')
    expect(calls).toEqual([{ format: 'image/avif', transform: { fit: 'scale-down', width: 640 } }])
  })

  it('caches an unversioned variant briefly', async () => {
    const response = await get(`/img/${key}?f=webp&w=320`, fakeBindings(objects).bindings)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe(UNVERSIONED_CACHE_CONTROL)
  })

  it.each([
    ['an unlisted width', `/img/${key}?f=webp&w=500`],
    ['no width', `/img/${key}?f=webp`],
    ['an unknown format', `/img/${key}?f=png&w=640`],
    ['an extra parameter', `/img/${key}?f=webp&w=640&q=10`],
    ['a version that is not a date', `/img/${key}?f=webp&w=640&v=abc`],
  ])('rejects %s with an uncached 400', async (_, path) => {
    const { bindings, calls } = fakeBindings(objects)
    const response = await get(path, bindings)
    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(calls).toEqual([])
  })

  it.each([
    ['a key with a slash', '/img/seo-analyzer%2Fcache%2Fx?f=webp&w=640'],
    ['a nested path', '/img/seo-analyzer/cache/x?f=webp&w=640'],
    ['an encoded slash', `/img/${objectKey}%2Fharbour.jpg?f=webp&w=640`],
    ['a folder that is not an object key', '/img/uploads/harbour.jpg?f=webp&w=640'],
    ['a dot segment', `/img/${objectKey}/..?f=webp&w=640`],
  ])('answers 404 for %s', async (_, path) => {
    expect((await get(path, fakeBindings(objects).bindings)).status).toBe(404)
  })

  it('redirects a key with no R2 object to the original, uncached', async () => {
    const response = await get(`/img/missing.jpg?f=webp&w=640&v=${v}`, fakeBindings(objects).bindings)
    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe(`/api/media/file/missing.jpg?${v}`)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('refuses non-images', async () => {
    expect((await get('/img/doc.pdf?f=webp&w=640', fakeBindings(objects).bindings)).status).toBe(
      415,
    )
  })

  it.each(['logo.svg', 'anim.gif'])('redirects %s to the original', async (file) => {
    const response = await get(`/img/${file}?f=webp&w=640&v=${v}`, fakeBindings(objects).bindings)
    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe(`/api/media/file/${file}?${v}`)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('redirects to the original without the binding (Node dev server)', async () => {
    const response = await get(`/img/${key}?f=webp&w=640`, {})
    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe('/api/media/file/harbour.jpg')
  })

  it('redirects to the original, uncached, when the transform fails', async () => {
    const onError = vi.fn()
    const { bindings } = fakeBindings(objects, () => {
      throw new Error('9422: monthly transformation limit')
    })
    const response = await get(`/img/${key}?f=webp&w=640`, { ...bindings, onError })
    expect(response.status).toBe(307)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(onError).toHaveBeenCalledOnce()
  })
})

describe('media file Cache-Control', () => {
  const file = (status = 200, headers: HeadersInit = {}) =>
    new Response(status === 304 ? null : 'bytes', { headers, status })
  const at = (path: string, method = 'GET') => new Request(`https://example.com${path}`, { method })

  it('makes a file URL with the updatedAt tag immutable', () => {
    const response = withMediaCacheControl(at(`/api/media/file/harbour.jpg?${v}`), file())
    expect(response.headers.get('Cache-Control')).toBe(IMMUTABLE_CACHE_CONTROL)
  })

  it('keeps an untagged (or oddly tagged) file URL short-lived', () => {
    for (const path of [
      '/api/media/file/harbour.jpg',
      '/api/media/file/harbour.jpg?x',
      '/api/media/file/a.jpg?%E0',
    ]) {
      expect(withMediaCacheControl(at(path), file()).headers.get('Cache-Control')).toBe(
        UNVERSIONED_CACHE_CONTROL,
      )
    }
  })

  it('applies to 304s and HEAD', () => {
    expect(
      withMediaCacheControl(at(`/api/media/file/a.jpg?${v}`), file(304)).headers.get(
        'Cache-Control',
      ),
    ).toBe(IMMUTABLE_CACHE_CONTROL)
    expect(
      withMediaCacheControl(at(`/api/media/file/a.jpg?${v}`, 'HEAD'), file()).headers.get(
        'Cache-Control',
      ),
    ).toBe(IMMUTABLE_CACHE_CONTROL)
  })

  it.each([
    ['other routes', at('/api/users/me'), file()],
    ['a range', at(`/api/media/file/a.mp4?${v}`), file(206)],
    ['a 404', at(`/api/media/file/a.jpg?${v}`), file(404)],
    [
      'a response setting a cookie',
      at(`/api/media/file/a.jpg?${v}`),
      file(200, { 'Set-Cookie': 'a=b' }),
    ],
    [
      'a response with its own Cache-Control',
      at('/api/media/file/a.jpg'),
      file(200, { 'Cache-Control': 'no-cache' }),
    ],
  ])('leaves %s alone', (_, request, response) => {
    expect(withMediaCacheControl(request, response)).toBe(response)
  })
})
