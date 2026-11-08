import { serializeJsonLd } from '@shipment/payload-seo-analyzer/shared'

import type { Author, Media, Post } from '@/payload-types'

import { BLOG_PATH, postPath } from './postPath'
import { siteName } from './siteName'

type JsonLdNode = Record<string, unknown>

export type PostForJsonLd = Pick<Post, 'excerpt' | 'meta' | 'publishedAt' | 'slug' | 'title'> & {
  authors?: (Pick<Author, 'name'> | number)[] | null
  cover?: Media | number | null
  createdAt?: string | null
  updatedAt?: string | null
}

const compact = (node: JsonLdNode): JsonLdNode =>
  Object.fromEntries(
    Object.entries(node).filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0),
    ),
  )

const absolute = (origin: string, url: string) => (/^https?:\/\//i.test(url) ? url : `${origin}${url}`)

const imageUrl = (origin: string, image: Media | number | null | undefined) =>
  image && typeof image === 'object' && image.url ? absolute(origin, image.url) : undefined

/**
 * A post's structured data, each node serialized for a `<script type="application/ld+json">`
 * (escaped like `buildPageJsonLd`, so editor text can't close the element):
 *
 * - `BlogPosting`: headline, description (meta description, else the excerpt), image (SEO
 *   image, else the cover), datePublished / dateModified, each author as a `Person`, the site as
 *   `publisher` (`Organization`), and `mainEntityOfPage`, the post's URL.
 * - `BreadcrumbList`: Home › Blog › the post.
 *
 * @param siteUrl - absolute origin; a trailing slash is ignored
 */
export const buildPostJsonLd = (post: PostForJsonLd, siteUrl: string): string[] => {
  const origin = siteUrl.replace(/\/+$/, '')
  const url = `${origin}${postPath(post.slug ?? '')}`
  const published = post.publishedAt || post.createdAt || undefined
  const authors = (post.authors ?? [])
    .filter((author): author is Pick<Author, 'name'> => typeof author === 'object' && !!author?.name)
    .map((author) => ({ '@type': 'Person', name: author.name }))

  const posting = compact({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    author: authors,
    dateModified: post.updatedAt || published,
    datePublished: published,
    description: post.meta?.description || post.excerpt || undefined,
    headline: post.title,
    image: imageUrl(origin, post.meta?.image) ?? imageUrl(origin, post.cover),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    publisher: { '@type': 'Organization', name: siteName, url: origin },
    url,
  })

  const breadcrumb: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', item: `${origin}/`, name: 'Home', position: 1 },
      { '@type': 'ListItem', item: `${origin}${BLOG_PATH}`, name: 'Blog', position: 2 },
      { '@type': 'ListItem', item: url, name: post.title, position: 3 },
    ],
  }

  return [posting, breadcrumb].map((node) => serializeJsonLd(node))
}
