import { describe, expect, it, vi } from 'vitest'

import { SeoCache, SeoSharedCache } from '../cache.js'
import { createSitemapHandler, publishedLocales } from '../endpoints/sitemap.js'
import type { SeoConfig, SeoLocalization } from '../types.js'

// sitemap.xml with a second locale (apps/web #158): each document once per locale it is
// published in, with hreflang alternates; untouched with one locale.

const SITE = 'https://example.com'
const localization: SeoLocalization = {
  locales: ['en', 'pt'],
  defaultLocale: 'en',
  localizePath: (path, locale) =>
    locale === 'en' ? path : path === '/' ? `/${locale}` : `/${locale}${path}`,
}

// Documents as `locale: 'all'` returns them: `_status` per locale.
const DOCS = [
  { id: 1, slug: 'home', _status: { en: 'published', pt: 'published' }, updatedAt: '2026-11-01' },
  { id: 2, slug: 'about', _status: { en: 'published', pt: 'published' }, updatedAt: '2026-11-02' },
  { id: 3, slug: 'pricing', _status: { en: 'published', pt: 'draft' }, updatedAt: '2026-11-03' },
  { id: 4, slug: 'hidden', _status: { en: 'published', pt: 'published' }, noindex: true },
  { id: 5, slug: 'draft', _status: { en: 'draft' } },
]

function fakePayload(docs: Record<string, unknown>[]) {
  return {
    config: { admin: { user: 'users' }, routes: { api: '/api' } },
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    find: vi.fn(async (args: { collection: string }) => {
      if (args.collection !== 'pages') return { docs: [], hasNextPage: false, totalDocs: 0 }
      return { docs, hasNextPage: false, totalDocs: docs.length }
    }),
    findGlobal: vi.fn(async () => null),
  }
}

const fresh = () => new SeoSharedCache({ memory: new SeoCache() })

const sitemap = async (config: SeoConfig, docs: Record<string, unknown>[]) => {
  const payload = fakePayload(docs)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req = { payload, url: `${SITE}/api/seo-plugin/sitemap.xml` } as any
  const xml = await (await createSitemapHandler(['pages'], config, fresh())(req)).text()
  return { payload, xml }
}

const urlBlock = (xml: string, loc: string) =>
  xml.split('<url>').find((block) => block.includes(`<loc>${loc}</loc>`)) ?? ''

describe('publishedLocales', () => {
  it('reads a per-locale status map, and a plain status as the default locale', () => {
    expect(publishedLocales({ _status: { en: 'published', pt: 'draft' } }, localization)).toEqual([
      'en',
    ])
    expect(publishedLocales({ _status: 'published' }, localization)).toEqual(['en'])
    expect(publishedLocales({}, localization)).toEqual(['en'])
    expect(publishedLocales({ _status: 'draft' }, localization)).toEqual([])
  })
})

describe('sitemap.xml with locales', () => {
  it('lists every published locale with its alternates and x-default', async () => {
    const { payload, xml } = await sitemap({ siteUrl: SITE, localization }, DOCS)

    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({ locale: 'all' }))
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    for (const loc of [`${SITE}/about`, `${SITE}/pt/about`]) {
      const block = urlBlock(xml, loc)
      expect(block).toContain(`<xhtml:link rel="alternate" hreflang="en" href="${SITE}/about"/>`)
      expect(block).toContain(`<xhtml:link rel="alternate" hreflang="pt" href="${SITE}/pt/about"/>`)
      expect(block).toContain(
        `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/about"/>`,
      )
    }
    expect(urlBlock(xml, `${SITE}/pt`)).toContain(`hreflang="pt" href="${SITE}/pt"`)
  })

  it('leaves out untranslated locales, noindex pages and drafts', async () => {
    const { xml } = await sitemap({ siteUrl: SITE, localization }, DOCS)

    // In English only: listed once, with no alternates.
    expect(xml).toContain(`<loc>${SITE}/pricing</loc>`)
    expect(xml).not.toContain('/pt/pricing')
    expect(urlBlock(xml, `${SITE}/pricing`)).not.toContain('xhtml:link')
    expect(xml).not.toContain('hidden')
    expect(xml).not.toContain('/draft')
  })

  it('is the plain sitemap with one locale', async () => {
    const single = { ...localization, locales: ['en'] }
    const docs = [{ id: 2, slug: 'about', _status: 'published' }]
    const withOne = await sitemap({ siteUrl: SITE, localization: single }, docs)
    const without = await sitemap({ siteUrl: SITE }, docs)

    expect(withOne.xml).toBe(without.xml)
    expect(withOne.xml).not.toContain('xhtml')
    expect(withOne.payload.find).toHaveBeenCalledWith(expect.not.objectContaining({ locale: 'all' }))
  })
})
