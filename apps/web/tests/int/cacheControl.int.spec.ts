import { describe, expect, it } from 'vitest'

import {
  isPublicPageView,
  LAYOUT_TAG,
  pageTag,
  PRIVATE_CACHE_CONTROL,
  publicPageHeaders,
  withDefaultCacheControl,
  type PageViewState,
} from '@/utilities/cacheControl'

describe('withDefaultCacheControl (the server.ts wrapper)', () => {
  it('makes responses without Cache-Control private: admin, REST, /api/users/me, server functions', () => {
    const responses = [
      new Response('<!doctype html><title>Admin</title>', {
        headers: { 'Content-Type': 'text/html' },
      }),
      Response.json({ docs: [], totalDocs: 0 }),
      new Response(JSON.stringify({ user: { email: 'editor@example.com' } }), {
        headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'payload-token=x; HttpOnly' },
      }),
      new Response('{"result":{}}', { headers: { 'Content-Type': 'application/json' } }),
      new Response(null, { status: 404 }),
      new Response(null, { headers: { Location: '/new' }, status: 301 }),
    ]
    for (const response of responses) {
      expect(withDefaultCacheControl(response).headers.get('Cache-Control')).toBe(
        PRIVATE_CACHE_CONTROL,
      )
    }
  })

  it('keeps a Cache-Control the response set itself', () => {
    const page = new Response('<html></html>', { headers: publicPageHeaders('/about') })
    expect(withDefaultCacheControl(page).headers.get('Cache-Control')).toBe(
      'public, max-age=0, must-revalidate',
    )
    const media = new Response('bytes', {
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    })
    expect(withDefaultCacheControl(media).headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable',
    )
    const draft = new Response('<html></html>', {
      headers: { 'Cache-Control': 'private, no-store' },
    })
    expect(withDefaultCacheControl(draft)).toBe(draft)
  })

  it('copies a response whose headers are immutable', async () => {
    const immutable = Response.redirect('https://example.com/elsewhere', 302)
    expect(() => immutable.headers.set('X', '1')).toThrow()
    const result = withDefaultCacheControl(immutable)
    expect(result).not.toBe(immutable)
    expect(result.status).toBe(302)
    expect(result.headers.get('Location')).toBe('https://example.com/elsewhere')
    expect(result.headers.get('Cache-Control')).toBe(PRIVATE_CACHE_CONTROL)
  })
})

describe('publicPageHeaders', () => {
  it('tags the page and the layout, with a short browser and a longer edge lifetime', () => {
    const headers = publicPageHeaders('/about')
    expect(headers['Cache-Tag']).toBe(`${pageTag('/about')},${LAYOUT_TAG}`)
    expect(headers['Cache-Tag']).toBe('page:/about,layout')
    expect(headers['Cache-Control']).toMatch(/^public, /)
    expect(headers['Cloudflare-CDN-Cache-Control']).toMatch(
      /max-age=\d+, stale-while-revalidate=\d+/,
    )
    // `s-maxage` turns off stale serving in Workers Cache.
    expect(Object.values(headers).join()).not.toContain('s-maxage')
  })
})

describe('isPublicPageView', () => {
  const anonymous: PageViewState = {
    abVaries: false,
    document: true,
    draft: false,
    draftParam: false,
    found: true,
    markers: false,
    onpageDraft: false,
    previewGrant: false,
    setsCookie: false,
    siteUrlConfigured: true,
    user: false,
  }

  it('opts in an anonymous, published, non-experiment document', () => {
    expect(isPublicPageView(anonymous)).toBe(true)
  })

  it.each([
    ['a server-function call (client-side navigation)', { document: false }],
    ['a 404 or a redirect', { found: false }],
    ['live preview (?draft=true)', { draftParam: true }],
    ['a valid on-page mode cookie', { onpageDraft: true }],
    ['on-page edit markers', { markers: true }],
    ['a preview-link grant', { previewGrant: true }],
    ['a signed-in user', { user: true }],
    ['a draft', { draft: true }],
    ['an A/B experiment (or an unreadable manifest)', { abVaries: true }],
    ['a response that sets a cookie', { setsCookie: true }],
    ['a site without SITE_URL (host-derived URLs)', { siteUrlConfigured: false }],
  ] satisfies [string, Partial<PageViewState>][])('stays private for %s', (_, change) => {
    expect(isPublicPageView({ ...anonymous, ...change })).toBe(false)
  })
})
