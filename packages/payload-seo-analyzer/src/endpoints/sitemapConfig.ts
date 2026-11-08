/**
 * Sitemap Config endpoint handler.
 * GET — returns sitemap configuration from seo-settings + a preview
 * of generated sitemap entries for all pages/posts.
 *
 * NOTE: Rate limiting is not handled by this plugin. The consuming application
 * should implement rate limiting via its own middleware (e.g., express-rate-limit,
 * Next.js middleware, or a reverse proxy like Nginx/Caddy).
 */

import type { PayloadHandler } from 'payload'
import type { SeoConfig } from '../types.js'
import { docExclusion } from '../helpers/excludeDocs.js'
import { buildDocPath } from '../helpers/docUrl.js'
import { fetchAllDocs } from '../helpers/fetchAllDocs.js'
import { isSeoPanelUser } from '../helpers/isAdmin.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PriorityOverride {
  slugPattern: string
  priority: number
  changefreq?: string
}

/** What the `sitemap` group of the `seo-settings` document may hold: read defensively, entry by entry. */
interface SavedSitemapSettings {
  excludedSlugs?: unknown
  defaultChangefreq?: unknown
  defaultPriority?: unknown
  priorityOverrides?: unknown
}

/** An `excludedSlugs` row: a plain slug, or the `{ slug }` row of the array field. */
type ExcludedSlugEntry = string | { slug?: string } | null | undefined

/** A `priorityOverrides` row as saved; only `slugPattern` is checked before use. */
interface RawPriorityOverride {
  slugPattern?: unknown
  priority?: unknown
  changefreq?: string
}

/** The document fields the preview reads. */
interface SitemapConfigDoc {
  slug?: string
  title?: string
  updatedAt?: string
}

interface SitemapPreviewEntry {
  url: string
  collection: string
  title: string
  changefreq: string
  priority: number
  lastmod: string
}

// ---------------------------------------------------------------------------
// Simple glob matching: supports trailing * (startsWith)
// ---------------------------------------------------------------------------

function matchPattern(slug: string, pattern: string): boolean {
  // Exact match
  if (pattern === slug) return true

  // Wildcard at end: "blog/*" matches "blog/article-1"
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1)
    return slug.startsWith(prefix)
  }

  return false
}

// ---------------------------------------------------------------------------
// Endpoint handler
// ---------------------------------------------------------------------------

export function createSitemapConfigHandler(
  targetCollections: string[],
  seoConfig?: SeoConfig,
): PayloadHandler {
  return async (req) => {
    try {
      if (!isSeoPanelUser(req)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // 1. Fetch settings
      let excludedSlugs: string[] = []
      let defaultChangefreq = 'weekly'
      let defaultPriority = 0.5
      let priorityOverrides: PriorityOverride[] = []

      try {
        const settingsResult = await req.payload.find({
          collection: 'seo-settings',
          limit: 1,
          overrideAccess: true,
        })
        const settings = settingsResult.docs?.[0]
        if (settings) {
          const sitemap = (settings as { sitemap?: SavedSitemapSettings | null }).sitemap
          if (sitemap && typeof sitemap === 'object') {
            if (Array.isArray(sitemap.excludedSlugs)) {
              excludedSlugs = (sitemap.excludedSlugs as ExcludedSlugEntry[])
                .map((s) => (typeof s === 'string' ? s : s?.slug || ''))
                .filter(Boolean)
            }
            if (typeof sitemap.defaultChangefreq === 'string') {
              defaultChangefreq = sitemap.defaultChangefreq
            }
            if (typeof sitemap.defaultPriority === 'number') {
              defaultPriority = sitemap.defaultPriority
            }
            if (Array.isArray(sitemap.priorityOverrides)) {
              priorityOverrides = (sitemap.priorityOverrides as Array<RawPriorityOverride | null | undefined>)
                .filter((o): o is RawPriorityOverride & { slugPattern: string } => !!o && typeof o.slugPattern === 'string')
                .map((o) => ({
                  slugPattern: o.slugPattern,
                  priority: typeof o.priority === 'number' ? o.priority : defaultPriority,
                  ...(o.changefreq && { changefreq: o.changefreq }),
                }))
            }
          }
        }
      } catch {
        // SeoSettings might not exist yet — use defaults
      }

      // 2. Fetch all pages + posts
      const excludedSet = new Set(excludedSlugs)
      const preview: SitemapPreviewEntry[] = []
      let totalPages = 0
      let excludedCount = 0

      const allFetched = await fetchAllDocs(req.payload, {
        collections: targetCollections,
        depth: 0,
        exclude: docExclusion(seoConfig),
      })

      for (const { doc, sourceSlug: collectionSlug } of allFetched) {
        const d = doc as SitemapConfigDoc
        const slug = d.slug || ''
        const title = d.title || ''

        totalPages++

        // Check exclusion
        if (excludedSet.has(slug)) {
          excludedCount++
          continue
        }

        // Compute priority and changefreq for this page
        let pageChangefreq = defaultChangefreq
        let pagePriority = defaultPriority

        // Apply overrides (last match wins)
        for (const override of priorityOverrides) {
          if (matchPattern(slug, override.slugPattern)) {
            pagePriority = override.priority
            if (override.changefreq) {
              pageChangefreq = override.changefreq
            }
          }
        }

        // Homepage gets highest priority if no override set
        if ((slug === 'home' || slug === '') && !priorityOverrides.some((o) => matchPattern(slug, o.slugPattern))) {
          pagePriority = 1.0
          pageChangefreq = 'daily'
        }

        preview.push({
          // Same path builder as sitemap.xml (sitemap.ts): the preview must show
          // exactly what the generated sitemap will publish, collection route
          // prefix included. `|| '/'` keeps the home page displayable, where the
          // XML emits the bare site URL.
          url: buildDocPath(slug, collectionSlug, seoConfig?.collectionRoutes) || '/',
          collection: collectionSlug,
          title,
          changefreq: pageChangefreq,
          priority: pagePriority,
          lastmod: d.updatedAt || '',
        })
      }

      // Sort by priority descending, then alphabetically
      preview.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority
        return a.url.localeCompare(b.url)
      })

      return Response.json({
        config: {
          excludedSlugs,
          defaultChangefreq,
          defaultPriority,
          priorityOverrides,
        },
        preview,
        stats: {
          totalPages,
          excludedCount,
          includedCount: totalPages - excludedCount,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error'
      req.payload.logger.error(`[seo] sitemap-config error: ${message}`)
      return Response.json({ error: message }, { status: 500 })
    }
  }
}
