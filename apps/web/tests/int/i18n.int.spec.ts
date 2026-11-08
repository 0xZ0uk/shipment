import { describe, expect, it } from 'vitest'

import { localeHead } from '@/i18n/head'
import {
  isMultilingual,
  languageTag,
  localeConfig,
  localeLabel,
  localeView,
  localizeHref,
  localizePath,
  ogLocale,
  parseLocales,
  splitLocalePath,
} from '@/i18n/locales'
import {
  localeDeps,
  localeRewrite,
  publicSearchStr,
  validateLocaleSearch,
} from '@/i18n/routing'
import { publicPageHeaders } from '@/utilities/cacheControl'
import { pageHead } from '@/utilities/pageHead'
import { pagePath } from '@/utilities/pagePath'
import { postPath } from '@/utilities/postPath'
import { buildRedirectIndex, matchLocalizedRedirect } from '@/utilities/redirects'
import { buildRssFeed } from '@/utilities/rss'

// A second locale (#158). The helpers take a config, so `en,pt` is tested here while the suite
// runs with `LOCALES` unset: the single-locale site, which must behave as before localization.

const EN_PT = parseLocales('en,pt')
const SITE = 'https://example.com'

describe('LOCALES', () => {
  it('parses codes, the first one the default', () => {
    expect(parseLocales('en,pt')).toEqual({ defaultLocale: 'en', locales: ['en', 'pt'] })
    expect(parseLocales(' PT , en ,pt')).toEqual({ defaultLocale: 'pt', locales: ['pt', 'en'] })
    expect(parseLocales('en,pt-br')).toEqual({ defaultLocale: 'en', locales: ['en', 'pt-br'] })
  })

  it('drops invalid codes and falls back to en', () => {
    expect(parseLocales('')).toEqual({ defaultLocale: 'en', locales: ['en'] })
    expect(parseLocales(undefined)).toEqual({ defaultLocale: 'en', locales: ['en'] })
    expect(parseLocales('../x,en_US,123')).toEqual({ defaultLocale: 'en', locales: ['en'] })
  })

  it('is single-locale by default', () => {
    expect(localeConfig).toEqual({ defaultLocale: 'en', locales: ['en'] })
    expect(isMultilingual).toBe(false)
  })

  it("keeps the single-locale site's route data as it was: no locale fields, no deps", () => {
    expect(localeView({ fallback: false, locale: 'en', translations: ['en'] })).toEqual({})
    // The router hashes undefined deps as '' (no `{}` in match ids), as before localization.
    expect(localeDeps({})).toBeUndefined()
    expect(localeDeps({ locale: 'pt' })).toEqual({ locale: 'pt' })
  })

  it('names locales in their own language, with BCP 47 and Open Graph tags', () => {
    expect(localeLabel('en')).toBe('English')
    expect(localeLabel('pt')).toBe('Português')
    expect(languageTag('pt-br')).toBe('pt-BR')
    expect(ogLocale('pt-br')).toBe('pt_BR')
    expect(ogLocale('en')).toBe('en')
  })
})

describe('locale paths', () => {
  it('leaves the default locale unprefixed and prefixes the others', () => {
    expect(localizePath('/', 'en', EN_PT)).toBe('/')
    expect(localizePath('/about', 'en', EN_PT)).toBe('/about')
    expect(localizePath('/', 'pt', EN_PT)).toBe('/pt')
    expect(localizePath('/about', 'pt', EN_PT)).toBe('/pt/about')
    expect(localizePath(postPath('hello'), 'pt', EN_PT)).toBe('/pt/blog/hello')
    expect(localizePath('/about?draft=true', 'pt', EN_PT)).toBe('/pt/about?draft=true')
  })

  it('never prefixes the admin, the API, files or the site-wide documents', () => {
    for (const path of ['/admin', '/admin/collections/pages', '/api/search', '/sitemap.xml']) {
      expect(localizePath(path, 'pt', EN_PT)).toBe(path)
    }
  })

  it('ignores unknown locales, and does nothing with one locale', () => {
    expect(localizePath('/about', 'xx', EN_PT)).toBe('/about')
    expect(localizePath('/about', 'pt')).toBe('/about')
  })

  it('localizes site-relative hrefs only', () => {
    expect(localizeHref('/#faq', 'pt', EN_PT)).toBe('/pt/#faq')
    expect(localizeHref('/pricing', 'pt', EN_PT)).toBe('/pt/pricing')
    for (const href of ['https://x.com/a', '//cdn.x/a', '#top', 'mailto:a@b.c', '/admin']) {
      expect(localizeHref(href, 'pt', EN_PT)).toBe(href)
    }
  })

  it('splits a public path into its locale and unprefixed path', () => {
    expect(splitLocalePath('/pt/about', EN_PT)).toEqual({ locale: 'pt', path: '/about' })
    expect(splitLocalePath('/pt', EN_PT)).toEqual({ locale: 'pt', path: '/' })
    expect(splitLocalePath('/pt/', EN_PT)).toEqual({ locale: 'pt', path: '/' })
    expect(splitLocalePath('/pt/blog/rss.xml', EN_PT)).toEqual({
      locale: 'pt',
      path: '/blog/rss.xml',
    })
    expect(splitLocalePath('/about', EN_PT)).toEqual({ locale: 'en', path: '/about' })
  })

  it('treats the default locale, unknown codes and non-page paths as no prefix (404s)', () => {
    for (const path of ['/en/about', '/xx/about', '/pt/admin', '/pt/api/search', '/pt/sitemap.xml']) {
      expect(splitLocalePath(path, EN_PT)).toEqual({ locale: 'en', path })
    }
    expect(splitLocalePath('/pt/about')).toEqual({ locale: 'en', path: '/pt/about' })
  })
})

describe('the router rewrite', () => {
  const rewrite = localeRewrite(EN_PT)
  const input = (href: string) => {
    const out = rewrite.input!({ url: new URL(href, SITE) })
    return out === undefined ? undefined : new URL(String(out), SITE).href.replace(SITE, '')
  }
  const output = (href: string) => {
    const out = rewrite.output!({ url: new URL(href, SITE) })
    return out === undefined ? undefined : new URL(String(out), SITE).href.replace(SITE, '')
  }

  it('routes /pt/… as the unprefixed path with ?locale=pt', () => {
    expect(input('/pt/about')).toBe('/about?locale=pt')
    expect(input('/pt')).toBe('/?locale=pt')
    expect(input('/pt/blog/hello?x=1')).toBe('/blog/hello?x=1&locale=pt')
  })

  it('leaves default-locale URLs alone, and drops a locale param from the address bar', () => {
    expect(input('/about')).toBeUndefined()
    expect(input('/about?locale=pt')).toBe('/about')
    expect(input('/pt/about?locale=en')).toBe('/about?locale=pt')
  })

  it('puts the prefix back on the locations the router builds', () => {
    expect(output('/about?locale=pt')).toBe('/pt/about')
    expect(output('/?locale=pt')).toBe('/pt')
    expect(output('/blog/hello?x=1&locale=pt')).toBe('/pt/blog/hello?x=1')
    expect(output('/about?locale=en')).toBe('/about')
    expect(output('/about')).toBeUndefined()
  })

  it("leaves the admin and the API alone, the admin's own ?locale= included", () => {
    expect(input('/admin/collections/pages/2?locale=pt')).toBeUndefined()
    expect(input('/api/pages?locale=pt')).toBeUndefined()
    expect(output('/admin/collections/pages/2?locale=pt')).toBeUndefined()
  })

  it('round-trips', () => {
    for (const href of ['/pt/about', '/pt', '/pt/blog/page/2?q=a']) {
      expect(output(input(href)!)).toBe(href)
    }
  })

  it("validates the route's locale param", () => {
    expect(validateLocaleSearch({ locale: 'pt' }, EN_PT)).toEqual({ locale: 'pt' })
    expect(validateLocaleSearch({ locale: 'en' }, EN_PT)).toEqual({})
    expect(validateLocaleSearch({ locale: 'xx' }, EN_PT)).toEqual({})
    // One locale: no param ever.
    expect(validateLocaleSearch({ locale: 'pt' })).toEqual({})
  })

  it("strips the internal param from a location's query, and only that", () => {
    expect(publicSearchStr('?locale=pt')).toBe('')
    expect(publicSearchStr('?utm_source=x&locale=pt')).toBe('?utm_source=x')
    // Untouched (byte for byte) without it.
    expect(publicSearchStr('?q=a+b&x=%20')).toBe('?q=a+b&x=%20')
  })
})

describe('locale head tags', () => {
  const head = (input: Partial<Parameters<typeof localeHead>[0]>) =>
    localeHead(
      { locale: 'en', path: '/about', siteUrl: SITE, translations: ['en', 'pt'], ...input },
      EN_PT,
    )

  it('lists every translation and x-default, with og:locale', () => {
    const pt = head({ locale: 'pt' })
    expect(pt.url).toBe(`${SITE}/pt/about`)
    expect(pt.noindex).toBe(false)
    expect(pt.links).toEqual([
      { href: `${SITE}/about`, hrefLang: 'en', rel: 'alternate' },
      { href: `${SITE}/pt/about`, hrefLang: 'pt', rel: 'alternate' },
      { href: `${SITE}/about`, hrefLang: 'x-default', rel: 'alternate' },
    ])
    expect(pt.meta).toEqual([
      { content: 'pt', property: 'og:locale' },
      { content: 'en', property: 'og:locale:alternate' },
    ])
    expect(head({}).url).toBe(`${SITE}/about`)
  })

  it('points a fallback view at the default-locale page: canonical there, noindex, no hreflang', () => {
    const fallback = head({ fallback: true, locale: 'pt', translations: ['en'] })
    expect(fallback).toEqual({
      links: [],
      meta: [{ content: 'en', property: 'og:locale' }],
      noindex: true,
      url: `${SITE}/about`,
    })
  })

  it('has no alternates for a page in one locale, and no x-default without the default', () => {
    expect(head({ translations: ['en'] }).links).toEqual([])
    expect(head({ locale: 'pt', translations: ['pt'] }).links).toEqual([])
    const ptAndEs = localeHead(
      { locale: 'pt', path: '/', siteUrl: SITE, translations: ['pt', 'es'] },
      parseLocales('en,pt,es'),
    )
    expect(ptAndEs.links.map((link) => link.hrefLang)).toEqual(['pt', 'es'])
  })

  it('is the plain canonical with one locale', () => {
    expect(localeHead({ locale: 'en', path: '/about', siteUrl: SITE, translations: ['en'] })).toEqual(
      { links: [], meta: [], noindex: false, url: `${SITE}/about` },
    )
  })

  it("gives a single-locale page today's head: canonical only, no og:locale or hreflang", () => {
    const tags = pageHead({
      canonicalSlug: 'about',
      draft: false,
      fallback: false,
      jsonLd: [],
      livePreview: false,
      locale: 'en',
      origin: SITE,
      page: { layout: [], slug: 'about', title: 'About' } as never,
      siteUrl: SITE,
      translations: ['en'],
    })
    expect(tags.links).toEqual([{ rel: 'canonical', href: `${SITE}/about` }])
    expect(JSON.stringify(tags.meta)).not.toContain('og:locale')
  })
})

describe('edge cache tags', () => {
  it("tag every locale's view of a page with its unprefixed path, so one purge covers all", () => {
    // `loadPage` tags `/pt/about` with `pagePath(slug)`: the path the purge hooks purge.
    expect(publicPageHeaders(pagePath('about'))['Cache-Tag']).toBe('page:/about,layout')
  })
})

describe('redirects in a locale', () => {
  const index = buildRedirectIndex([
    { from: '/old', to: '/new', type: '301' },
    { from: '/gone', to: 'https://elsewhere.example/x', type: '302' },
    { from: '/pt/antigo', to: '/pt/novo', type: '301' },
    { from: '/home-old', to: '/', type: '301' },
  ])
  const match = (pathname: string, locale: string, search = '') =>
    matchLocalizedRedirect(index, pathname, search, locale, EN_PT)

  it('keeps working for the default locale', () => {
    expect(match('/old', 'en')).toEqual({ href: '/new', statusCode: 301 })
    expect(match('/antigo', 'en')).toBeNull()
  })

  it("sends /pt/<from> to the target in pt, keeping the visitor's query", () => {
    expect(match('/old', 'pt')).toEqual({ href: '/pt/new', statusCode: 301 })
    expect(match('/old', 'pt', '?utm_source=x')).toEqual({
      href: '/pt/new?utm_source=x',
      statusCode: 301,
    })
    expect(match('/home-old', 'pt')).toEqual({ href: '/pt', statusCode: 301 })
  })

  it('prefers a redirect of the prefixed path itself, and keeps absolute targets', () => {
    expect(match('/antigo', 'pt')).toEqual({ href: '/pt/novo', statusCode: 301 })
    expect(match('/gone', 'pt')).toEqual({ href: 'https://elsewhere.example/x', statusCode: 302 })
  })
})

describe('the RSS feed', () => {
  const post = { id: 1, slug: 'hello', title: 'Hello', publishedAt: '2026-11-01T00:00:00.000Z' }

  it("is today's feed in the default locale", () => {
    const xml = buildRssFeed({ description: 'd', posts: [post], siteUrl: SITE, title: 't' })
    expect(xml).toContain('<language>en</language>')
    expect(xml).toContain(`<link>${SITE}/blog/hello</link>`)
    expect(xml).toContain(`<atom:link href="${SITE}/blog/rss.xml"`)
  })

  it('has its language and prefixed URLs in another locale', () => {
    const xml = buildRssFeed({
      description: 'd',
      locale: 'pt',
      posts: [post],
      siteUrl: SITE,
      title: 't',
    })
    expect(xml).toContain('<language>pt</language>')
    // `localizePath` with the suite's single-locale config ignores `pt`: the prefix itself is
    // covered above. The feed passes the locale through to it.
    expect(xml).toContain(`<link>${SITE}${localizePath('/blog/hello', 'pt')}</link>`)
  })
})
