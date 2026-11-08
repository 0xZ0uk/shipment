import { buildJsonLd, serializeJsonLd } from '@shipment/payload-seo-analyzer/shared'
import type { RequiredDataFromCollectionSlug } from 'payload'

import {
  defaultLocale,
  isMultilingual,
  languageTag,
  type Locale,
  localizePath,
} from '@/i18n/locales'

import { pagePath } from './pagePath'
import { siteName } from './siteName'

type JsonLdNode = Record<string, unknown>

type PageForJsonLd = Pick<RequiredDataFromCollectionSlug<'pages'>, 'meta' | 'slug' | 'title'> & {
  updatedAt?: string | null
}

/** Drops empty values (the plugin's Organization builder emits `description: ""`). */
const compact = (node: JsonLdNode): JsonLdNode =>
  Object.fromEntries(
    Object.entries(node).filter(([, value]) => value !== undefined && value !== null && value !== ''),
  )

/**
 * Builds the page's structured data and returns each node serialized for a
 * `<script type="application/ld+json">`.
 *
 * - Every page: `WebPage` and a `BreadcrumbList` (Home › page).
 * - Home: `WebSite` and `Organization` as well, with no breadcrumb.
 *
 * The helpers come from the plugin's `shared` entry, which has no Payload or React imports.
 * Serializing goes through the plugin's `serializeJsonLd`, which escapes `<`, `>` and `&` so editor-written text can't close the
 * `<script>` element.
 *
 * @param siteUrl - absolute origin without a trailing slash
 * @param options.slug - the slug URLs are built from (the canonical slug), when it isn't the
 *   page's own: an A/B variant is described at its original's URL
 * @param options.locale - the locale whose URL describes it (the default locale's unprefixed URL
 *   when absent); with several locales, also its `inLanguage`
 */
export const buildPageJsonLd = async (
  page: PageForJsonLd,
  siteUrl: string,
  options: { locale?: Locale; slug?: string } = {},
): Promise<string[]> => {
  const slug = options.slug ?? page.slug ?? 'home'
  const isHome = slug === 'home'
  const locale = options.locale ?? defaultLocale
  const origin = siteUrl.replace(/\/+$/, '')
  const url = `${origin}${localizePath(pagePath(slug), locale)}`
  const name = page.meta?.title || page.title || siteName
  const description = page.meta?.description || undefined
  const image = page.meta?.image
  const imageUrl =
    image && typeof image === 'object' && image.url
      ? image.url.startsWith('http')
        ? image.url
        : `${origin}${image.url}`
      : undefined

  const websiteId = `${origin}/#website`
  const nodes: JsonLdNode[] = []

  if (isHome) {
    nodes.push(
      {
        '@context': 'https://schema.org',
        '@id': websiteId,
        '@type': 'WebSite',
        name: siteName,
        url: `${origin}/`,
      },
      buildJsonLd({ meta: { description }, title: siteName }, { siteUrl: origin, type: 'Organization' })
        .jsonLd,
    )
  }

  nodes.push(
    compact({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      dateModified: page.updatedAt,
      description,
      image: imageUrl,
      inLanguage: isMultilingual ? languageTag(locale) : undefined,
      isPartOf: { '@id': websiteId },
      name,
      url,
    }),
  )

  if (!isHome) {
    nodes.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          item: `${origin}${localizePath('/', locale)}`,
          name: 'Home',
          position: 1,
        },
        { '@type': 'ListItem', item: url, name: page.title || slug, position: 2 },
      ],
    })
  }

  return nodes.map((node) => serializeJsonLd(compact(node)))
}
