import type { LoadPageResult } from '@/app/_frontend/pages.functions'
import { localeHead } from '@/i18n/head'

import { gtagScripts } from './googleAnalytics'
import { pagePath } from './pagePath'
import { siteName } from './siteName'

type HeadMeta = { content: string; name?: string; property?: string } | { title: string }

/** What a page's `<head>` says about it (see `headTags`). */
export type HeadInput = {
  title: string
  description?: null | string
  /** Absolute. */
  imageURL?: string
  /** The canonical URL, also `og:url`. Absolute, from `siteUrl`. */
  url: string
  noindex?: boolean | null
  ogType?: 'article' | 'website'
  /** Extra tags after the Open Graph ones (`article:published_time`…). */
  meta?: HeadMeta[]
  /** Extra links after the canonical one (hreflang alternates, `prev`/`next`). */
  links?: { href: string; hrefLang?: string; rel: string }[]
  /** Serialized JSON-LD nodes. */
  jsonLd?: string[]
  gaMeasurementId?: null | string
}

/**
 * The title, description, Open Graph and Twitter tags, robots `noindex`, canonical link,
 * JSON-LD and the GA stub. Shared by pages, posts and the blog archives, so they read the same.
 */
export const headTags = ({
  description,
  gaMeasurementId,
  imageURL,
  jsonLd = [],
  links = [],
  meta = [],
  noindex,
  ogType = 'website',
  title,
  url,
}: HeadInput) => ({
  meta: [
    { title },
    ...(description ? [{ name: 'description', content: description }] : []),
    { property: 'og:type', content: ogType },
    { property: 'og:site_name', content: siteName },
    { property: 'og:title', content: title },
    { property: 'og:url', content: url },
    ...(description ? [{ property: 'og:description', content: description }] : []),
    ...(imageURL ? [{ property: 'og:image', content: imageURL }] : []),
    ...meta,
    { name: 'twitter:card', content: 'summary_large_image' },
    ...(noindex ? [{ name: 'robots', content: 'noindex' }] : []),
  ],
  links: [{ rel: 'canonical', href: url }, ...links],
  scripts: [
    ...jsonLd.map((children) => ({ children, type: 'application/ld+json' })),
    ...gtagScripts(gaMeasurementId),
  ],
})

/** A route's `head`: always a title, the rest when there's a document to describe. */
export type HeadResult = Partial<ReturnType<typeof headTags>> & { meta: HeadMeta[] }

/** An upload's absolute URL on `siteUrl` (not the request origin: cached HTML is shared across hostnames). */
export const absoluteMediaURL = (siteUrl: string, image: unknown): string | undefined => {
  const url =
    image && typeof image === 'object' ? (image as { url?: null | string }).url : undefined
  if (!url) return undefined
  return /^https?:\/\//i.test(url) ? url : `${siteUrl}${url}`
}

/**
 * Builds the document title and SEO/Open Graph tags from a page's `meta` fields, plus a
 * robots `noindex` tag when the editor ticked "Hide from search engines" (`noindex`, a
 * field the SEO analyzer plugin adds; it also leaves the page out of the sitemaps and llms.txt).
 *
 * The canonical link and `og:url` come from `canonicalSlug`, not `page.slug`: an A/B variant
 * served at the original's URL (or opened by an editor at its own) points at the original.
 * With several locales, they're in the page's locale, with hreflang alternates for its
 * translations; a page shown in the default locale's words for want of a translation points at
 * the default-locale page and isn't indexed (`localeHead`).
 */
export const pageHead = (data?: LoadPageResult): HeadResult => {
  const page = data?.page

  if (!data || !page) {
    return { meta: [{ title: siteName }] }
  }

  const locale = localeHead({
    fallback: data.fallback,
    locale: data.locale,
    path: pagePath(data.canonicalSlug),
    siteUrl: data.siteUrl,
    translations: data.translations,
  })

  return headTags({
    description: page.meta?.description,
    gaMeasurementId: data.gaMeasurementId,
    imageURL: absoluteMediaURL(data.siteUrl, page.meta?.image),
    jsonLd: data.jsonLd,
    links: locale.links,
    meta: locale.meta,
    noindex: page.noindex || locale.noindex,
    title: page.meta?.title || (page.title ? `${page.title} | ${siteName}` : siteName),
    url: locale.url,
  })
}
