import type { LoadArchiveResult, LoadPostResult } from '@/app/_frontend/blog.functions'

import { absoluteMediaURL, type HeadResult, headTags } from './pageHead'
import { archivePagePath, postPath } from './postPath'
import { siteName } from './siteName'

/** A post's head: its SEO meta (else title and excerpt), `og:type` article, JSON-LD. */
export const postHead = (data?: LoadPostResult): HeadResult => {
  const post = data?.post
  if (!data || !post) return { meta: [{ title: siteName }] }

  const published = post.publishedAt || undefined
  return headTags({
    description: post.meta?.description || post.excerpt,
    gaMeasurementId: data.gaMeasurementId,
    imageURL:
      absoluteMediaURL(data.siteUrl, post.meta?.image) ?? absoluteMediaURL(data.siteUrl, post.cover),
    jsonLd: data.jsonLd,
    meta: [
      ...(published ? [{ property: 'article:published_time', content: published }] : []),
      ...(post.updatedAt ? [{ property: 'article:modified_time', content: post.updatedAt }] : []),
    ],
    noindex: post.noindex,
    ogType: 'article',
    title: post.meta?.title || `${post.title} | ${siteName}`,
    url: `${data.siteUrl}${postPath(post.slug)}`,
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

  const url = (page: number) => `${data.siteUrl}${archivePagePath(data.basePath, page)}`
  return headTags({
    description:
      data.category?.description ||
      (data.category
        ? `Posts in ${data.category.title} from ${siteName}.`
        : `The latest posts from ${siteName}.`),
    gaMeasurementId: data.gaMeasurementId,
    links: [
      ...(data.page > 1 ? [{ rel: 'prev', href: url(data.page - 1) }] : []),
      ...(data.page < data.totalPages ? [{ rel: 'next', href: url(data.page + 1) }] : []),
    ],
    title: `${archiveTitle(data.category, data.page)} | ${siteName}`,
    url: url(data.page),
  })
}
