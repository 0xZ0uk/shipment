import type { PostSummary } from '@/components/Posts/types'
import { populated } from '@/components/Posts/types'

import { BLOG_FEED_PATH, BLOG_PATH, postPath } from './postPath'

/** Escapes text for XML element content and attribute values. */
export const escapeXml = (value: string): string =>
  value
    // Characters XML 1.0 doesn't allow at all (control characters other than tab, LF, CR).
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const element = (name: string, value: null | string | undefined) =>
  value ? `<${name}>${escapeXml(value)}</${name}>` : ''

/** An RFC 822 date (what RSS 2.0 expects), or null for a missing or invalid one. */
const rfc822 = (value: null | string | undefined) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toUTCString()
}

export type RssFeedInput = {
  /** Absolute origin; a trailing slash is ignored. */
  siteUrl: string
  title: string
  description: string
  /** Published posts, newest first. */
  posts: PostSummary[]
}

/**
 * The blog's RSS 2.0 feed: one `<item>` per post with its absolute URL (link and guid), title,
 * excerpt, publication date, categories and authors (`dc:creator`). Every URL is absolute, from
 * `siteUrl`; every editor-written string is escaped.
 */
export const buildRssFeed = ({ description, posts, siteUrl, title }: RssFeedInput): string => {
  const origin = siteUrl.replace(/\/+$/, '')
  const items = posts
    .filter((post) => post.slug)
    .map((post) => {
      const url = `${origin}${postPath(post.slug!)}`
      return [
        '<item>',
        element('title', post.title),
        element('link', url),
        `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
        element('description', post.excerpt),
        element('pubDate', rfc822(post.publishedAt)),
        ...populated(post.authors).map((author) => element('dc:creator', author.name)),
        ...populated(post.categories).map((category) => element('category', category.title)),
        '</item>',
      ].join('')
    })
  const lastBuild = rfc822(posts[0]?.publishedAt)

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '<channel>',
    element('title', title),
    element('link', `${origin}${BLOG_PATH}`),
    element('description', description),
    '<language>en</language>',
    `<atom:link href="${escapeXml(`${origin}${BLOG_FEED_PATH}`)}" rel="self" type="application/rss+xml"/>`,
    element('lastBuildDate', lastBuild),
    ...items,
    '</channel>',
    '</rss>',
  ].join('\n')
}
