/**
 * XML Sitemap endpoint handler.
 * GET — Dynamically generates sitemap.xml from published documents
 * across all target collections, respecting seo-settings configuration.
 */

import type { PayloadHandler } from 'payload'
import type { SeoConfig, SeoLocalization } from '../types.js'
import { buildDocPath } from '../helpers/docUrl.js'
import { requestOrigin, resolveSiteUrl } from '../helpers/siteUrl.js'
import { buildSelect } from '../helpers/buildSelect.js'
import { docExclusion } from '../helpers/excludeDocs.js'
import { isListedDoc } from '../helpers/searchText.js'
import { fetchAllDocs } from '../helpers/fetchAllDocs.js'
import { defaultSeoSharedCache, safeLookup, safeSet, type SeoSharedCache } from '../cache.js'
import { keyFor } from '../cacheKey.js'

/**
 * Cache key base for the rendered XML. Scoped by the collections the handler was
 * built with (never by anything the caller sends): the document is identical for
 * every anonymous visitor, so a shared entry leaks nothing and is no oracle.
 * Cleared by the same afterChange invalidation as the other caches — see
 * CONTENT_CACHE_BASES in cache.ts. Persisted in the shared `cacheStore` when one is
 * configured, so every isolate serves the same build and a save invalidates all of them.
 */
export const SITEMAP_XML_CACHE_BASE = 'sitemap-xml'

/**
 * Memory cap for the public sitemap build.
 *
 * This handler used to pass a hard-coded `limit: 10000` to fetchAllDocs, which
 * takes precedence over SEO_FETCH_MAX_DOCS: an operator lowering that variable to
 * survive on a constrained host still loaded 10 000 documents on every ANONYMOUS
 * request. The cap now comes from the environment, like every other site-wide read,
 * and reuses the SEO_SITEMAP_MAX_DOCS name already honoured by the news/image/video
 * sitemaps so the two public paths share one knob.
 */
function sitemapMaxDocs(): number {
  const raw = process.env.SEO_SITEMAP_MAX_DOCS ?? process.env.SEO_FETCH_MAX_DOCS
  const parsed = raw != null ? parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5000
}

/** Document fields the sitemap reads (see the loop in the handler). */
export const SITEMAP_SELECT_PATHS = ['slug', 'updatedAt', '_status', 'noindex', 'meta.noindex']

/** The `sitemap` group of the `seo-settings` document. */
interface SitemapSettings {
  excludedSlugs?: Array<{ slug: string }>
  defaultChangefreq?: string
  defaultPriority?: number
  priorityOverrides?: Array<{ slugPattern: string; priority: number; changefreq?: string }>
}

/** The document fields the sitemap loop reads (`SITEMAP_SELECT_PATHS`). */
interface SitemapDoc {
  _status?: string
  noindex?: boolean
  meta?: { noindex?: boolean }
  slug?: string
  updatedAt?: string | number | Date
}

/** Escape special XML characters */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Check if a slug matches a pattern (supports trailing wildcard: blog/*) */
function matchesPattern(slug: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2)
    return slug === prefix || slug.startsWith(prefix + '/')
  }
  return slug === pattern
}

interface SitemapUrl {
  loc: string
  lastmod?: string
  changefreq?: string
  priority?: string
  /** hreflang alternates (`xhtml:link`), the URL itself included. */
  alternates?: Array<{ hreflang: string; href: string }>
}

/** `localization` when it has a second locale, else undefined (the single-locale sitemap). */
const multilingual = (seoConfig?: SeoConfig): SeoLocalization | undefined =>
  seoConfig?.localization && seoConfig.localization.locales.length > 1
    ? seoConfig.localization
    : undefined

/**
 * The locales a document read with `locale: 'all'` is published in. `_status` is a locale map
 * when the collection keeps it per locale; a plain value (or none: no drafts) is the default
 * locale's alone.
 */
export function publishedLocales(doc: { _status?: unknown }, localization: SeoLocalization): string[] {
  const status = doc._status
  if (status && typeof status === 'object') {
    const byLocale = status as Record<string, unknown>
    return localization.locales.filter((locale) => byLocale[locale] === 'published')
  }
  return status === 'draft' ? [] : [localization.defaultLocale]
}

/**
 * GET handler — generates sitemap.xml dynamically.
 * Public endpoint, no authentication required.
 */
export function createSitemapHandler(
  targetCollections: string[],
  seoConfig?: SeoConfig,
  cache: SeoSharedCache = defaultSeoSharedCache,
): PayloadHandler {
  const xmlResponse = (xml: string) =>
    new Response(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    })

  return async (req) => {
    try {
      // Serve the rendered XML when it is still warm. Without this, every anonymous
      // hit re-scanned the whole corpus — the most expensive request in the plugin,
      // on its only unauthenticated (and deliberately un-rate-limited) endpoint.
      // Staleness stays bounded by the cache TTL, which is well under the one-hour
      // Cache-Control this endpoint has always advertised.
      // The entry lives in the shared cache (R2 with a `cacheStore`), so isolates share one
      // build and a save invalidates it everywhere. A miss, e.g. right after a save, is a plain
      // rebuild with no stale-while-revalidate: several concurrent requests may each rebuild
      // once, which is acceptable now that the build only reads the fields it needs.
      // Without a configured site URL, fall back to the request's origin (sitemap
      // `<loc>` values must be absolute). The XML then depends on the host, so the
      // origin is part of the cache key.
      const serverUrl = resolveSiteUrl(seoConfig?.siteUrl, requestOrigin(req))
      // The collections and the origin (request-derived: uppercase host, IPv6 literal, query
      // string…) are inputs of the key. Persisted entries outlive deploys: the key also carries
      // the config that shapes the XML (`collectionRoutes` builds every `<loc>`).
      const localization = multilingual(seoConfig)
      const cacheKey = await keyFor(SITEMAP_XML_CACHE_BASE, req, {
        cache,
        // The locales shape the XML too (and `localizePath`, a function, isn't in the config hash).
        inputs: [
          targetCollections,
          serverUrl,
          localization ? [localization.defaultLocale, ...localization.locales] : null,
        ],
        config: seoConfig ?? null,
      })
      const lookup = await safeLookup<string>(cache, SITEMAP_XML_CACHE_BASE, cacheKey, req)
      if (typeof lookup.data === 'string') return xmlResponse(lookup.data)

      // Read sitemap config from seo-settings
      const settingsResult = await req.payload.find({
        collection: 'seo-settings',
        limit: 1,
        overrideAccess: true,
      })
      const config = settingsResult.docs[0] as { sitemap?: SitemapSettings } | undefined
      const sitemapConfig: SitemapSettings = config?.sitemap || {}

      const excludedSlugs: string[] = (sitemapConfig.excludedSlugs || []).map(
        (entry) => entry.slug,
      )
      const defaultChangefreq: string = sitemapConfig.defaultChangefreq || 'weekly'
      const defaultPriority: number = sitemapConfig.defaultPriority ?? 0.5
      const priorityOverrides = sitemapConfig.priorityOverrides || []

      // Fetch all published documents from target collections
      const allDocs = await fetchAllDocs(req.payload, {
        collections: targetCollections,
        depth: 0,
        maxDocs: sitemapMaxDocs(),
        // Only what the loop below reads — never the layout blocks / Lexical trees.
        select: buildSelect(req.payload, targetCollections, SITEMAP_SELECT_PATHS),
        exclude: docExclusion(seoConfig),
        // Every locale's `_status`, to list each document once per locale it is published in.
        ...(localization ? { locale: 'all' } : {}),
      })

      const urls: SitemapUrl[] = []

      for (const { doc: rawDoc, sourceSlug: collectionSlug } of allDocs) {
        const doc = rawDoc as SitemapDoc
        const locales = localization ? publishedLocales(doc, localization) : []
        if (localization && locales.length === 0) continue
        // Skip drafts and documents the editor explicitly removed from indexing. sitemap.xml is a
        // PUBLIC, anonymous endpoint built with overrideAccess: true — without this filter
        // it published the URLs of noindex pages (post-purchase thank-you, private pricing,
        // test landing pages) and contradicted /llms.txt, which already honours the flag.
        // (Read in every locale, `_status` is a map: `publishedLocales` checked it above.)
        if (!isListedDoc(localization ? { ...doc, _status: 'published' } : doc)) continue

        const slug: string = doc.slug || ''

        // Skip excluded slugs
        if (excludedSlugs.some((excluded) => matchesPattern(slug, excluded))) continue

        const isHome = slug === 'home' || slug === ''
        // Prefix by the collection route (posts → /posts/<slug> by default):
        // emitting the bare slug for a `posts` document declares a 404 to
        // Googlebot and wastes crawl budget.
        const path = buildDocPath(slug, collectionSlug, seoConfig?.collectionRoutes)

        // Determine priority and changefreq
        let priority = defaultPriority
        let changefreq = defaultChangefreq

        // Home page always gets highest priority
        if (isHome) {
          priority = 1.0
          changefreq = 'weekly'
        } else if (collectionSlug === 'posts') {
          // Blog posts default to slightly higher priority than generic default
          priority = Math.max(priority, 0.7)
          changefreq = 'weekly'
        } else {
          // Pages default
          priority = Math.max(priority, 0.8)
          changefreq = 'monthly'
        }

        // Apply priority overrides from settings
        for (const override of priorityOverrides) {
          if (matchesPattern(slug, override.slugPattern)) {
            priority = override.priority
            if (override.changefreq) changefreq = override.changefreq
            break
          }
        }

        const entry = {
          lastmod: doc.updatedAt
            ? new Date(doc.updatedAt).toISOString().split('T')[0]
            : undefined,
          changefreq,
          priority: priority.toFixed(1),
        }

        if (!localization) {
          urls.push({ loc: `${serverUrl}${path}`, ...entry })
          continue
        }

        // One `<url>` per published locale, each listing the whole set (itself included), plus
        // `x-default` on the default locale's URL. A document in one locale has no alternates.
        const hreflang = localization.hreflang ?? ((locale: string) => locale)
        const hrefOf = (locale: string) => `${serverUrl}${localization.localizePath(path, locale)}`
        const alternates =
          locales.length > 1
            ? [
                ...locales.map((locale) => ({ hreflang: hreflang(locale), href: hrefOf(locale) })),
                ...(locales.includes(localization.defaultLocale)
                  ? [{ hreflang: 'x-default', href: hrefOf(localization.defaultLocale) }]
                  : []),
              ]
            : undefined
        for (const locale of locales) urls.push({ loc: hrefOf(locale), ...entry, alternates })
      }

      // Build XML
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
      xml += localization
        ? '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        : '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      for (const url of urls) {
        xml += '  <url>\n'
        xml += `    <loc>${escapeXml(url.loc)}</loc>\n`
        for (const alternate of url.alternates ?? []) {
          xml += `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.hreflang)}" href="${escapeXml(alternate.href)}"/>\n`
        }
        if (url.lastmod) xml += `    <lastmod>${url.lastmod}</lastmod>\n`
        if (url.changefreq) xml += `    <changefreq>${url.changefreq}</changefreq>\n`
        if (url.priority) xml += `    <priority>${url.priority}</priority>\n`
        xml += '  </url>\n'
      }
      xml += '</urlset>'

      // Stamped with the generation read BEFORE the build: a save that lands meanwhile makes
      // this entry stale instead of masking it.
      await safeSet(cache, SITEMAP_XML_CACHE_BASE, cacheKey, xml, lookup, req)
      return xmlResponse(xml)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      req.payload.logger.error(`[seo] sitemap.xml generation error: ${message}`)
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
        {
          headers: { 'Content-Type': 'application/xml' },
          status: 500,
        },
      )
    }
  }
}
