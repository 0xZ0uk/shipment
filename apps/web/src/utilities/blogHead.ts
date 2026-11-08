import type { LoadArchiveResult, LoadPostResult } from '@/app/_frontend/blog.functions'

import { localeHead } from '@/i18n/head'
import { localizePath } from '@/i18n/locales'

import { absoluteMediaURL, type HeadResult, headTags } from './pageHead'
import { archivePagePath, postPath } from './postPath'
import { siteName } from './siteName'

/** A post's head: its SEO meta (else title and excerpt), `og:type` article, JSON-LD. */
export const postHead = (data?: LoadPostResult): HeadResult => {
  const post = data?.post
  if (!data || !post) return { meta: [{ title: siteName }] }

  const published = post.publishedAt || undefined
  const locale = localeHead({
    fallback: data.fallback,
    locale: data.locale,
    path: postPath(post.slug),
    siteUrl: data.siteUrl,
    translations: data.translations,
  })
  return headTags({
    description: post.meta?.description || post.excerpt,
    gaMeasurementId: data.gaMeasurementId,
    imageURL:
      absoluteMediaURL(data.siteUrl, post.meta?.image) ?? absoluteMediaURL(data.siteUrl, post.cover),
    jsonLd: data.jsonLd,
    links: locale.links,
    meta: [
      ...locale.meta,
      ...(published ? [{ property: 'article:published_time', content: published }] : []),
      ...(post.updatedAt ? [{ property: 'article:modified_time', content: post.updatedAt }] : []),
    ],
    noindex: post.noindex || locale.noindex,
    ogType: 'article',
    title: post.meta?.title || `${post.title} | ${siteName}`,
    url: locale.url,
  })
}

/** The title of an archive page: "Blog", "News · Blog", "Blog (page 2)". */
export const archiveTitle = (category: { title: string } | null, page: number) =>
  `${category ? `${category.title} · Blog` : 'Blog'}${page > 1 ? ` (page ${page})` : ''}`

/**
 * An archive page's head. Page 1's canonical URL is the bare path (`/blog`), later pages their
 * own (`/blog/page/2`), with `prev`/`next` links between them.
 */
export const archiveHead = (data?: LoadArchiveResult): HeadResult => {
  if (!data?.found) return { meta: [{ title: siteName }] }

  const url = (page: number) =>
    `${data.siteUrl}${localizePath(archivePagePath(data.basePath, page), data.locale)}`
  const locale = localeHead({
    locale: data.locale,
    path: archivePagePath(data.basePath, data.page),
    siteUrl: data.siteUrl,
    translations: data.translations,
  })
  return headTags({
    description:
      data.category?.description ||
      (data.category
        ? `Posts in ${data.category.title} from ${siteName}.`
        : `The latest posts from ${siteName}.`),
    gaMeasurementId: data.gaMeasurementId,
    links: [
      ...locale.links,
      ...(data.page > 1 ? [{ rel: 'prev', href: url(data.page - 1) }] : []),
      ...(data.page < data.totalPages ? [{ rel: 'next', href: url(data.page + 1) }] : []),
    ],
    meta: locale.meta,
    title: `${archiveTitle(data.category, data.page)} | ${siteName}`,
    url: locale.url,
  })
}
