import type { Payload, Where } from 'payload'

import type { PostSummary } from '@/components/Posts/types'
import { defaultLocale, type Locale } from '@/i18n/locales'
import { readLocale } from '@/i18n/server'

/** The fields a post card shows: everything but the body and the SEO tab. */
export const POST_SUMMARY_SELECT = {
  authors: true,
  categories: true,
  cover: true,
  excerpt: true,
  publishedAt: true,
  slug: true,
  title: true,
} as const

export type PostSummaryPage = {
  docs: PostSummary[]
  page: number
  totalDocs: number
  totalPages: number
}

/**
 * Published posts, newest first, as cards (cover, authors and categories populated). Read as a
 * visitor (no user, access applied), so drafts never show, whoever is signed in: archives,
 * the feed and the Posts archive block list what's live.
 *
 * In another locale (#158) the list is the same, the default locale's published posts, each in
 * the visitor's locale where it's translated and in the default locale's words where not: a
 * visitor's query in Portuguese alone would only find posts published in Portuguese (Payload
 * keeps `_status` per locale), and the archive would hide every untranslated post.
 */
export const findPostSummaries = async (
  payload: Payload,
  {
    categoryId,
    limit,
    locale = defaultLocale,
    page = 1,
  }: { categoryId?: number | string | null; limit: number; locale?: Locale; page?: number },
): Promise<PostSummaryPage> => {
  const where: Where | undefined =
    categoryId != null ? { categories: { in: [categoryId] } } : undefined
  const result = await payload.find({
    collection: 'posts',
    depth: locale === defaultLocale ? 1 : 0,
    draft: false,
    limit,
    overrideAccess: false,
    page,
    select: locale === defaultLocale ? POST_SUMMARY_SELECT : {},
    sort: ['-publishedAt', '-id'],
    where,
    ...readLocale(defaultLocale),
  })
  let docs = result.docs as PostSummary[]
  if (locale !== defaultLocale && docs.length > 0) {
    // The published version of each, read in `locale` with the default locale's as fallback.
    // Access was applied above; these ids are published.
    const ids = docs.map((doc) => doc.id)
    const localized = await payload.find({
      collection: 'posts',
      depth: 1,
      draft: false,
      limit: ids.length,
      overrideAccess: true,
      pagination: false,
      select: POST_SUMMARY_SELECT,
      where: { id: { in: ids } },
      ...readLocale(locale),
    })
    const byId = new Map(localized.docs.map((doc) => [doc.id, doc as PostSummary]))
    docs = ids.flatMap((id) => byId.get(id) ?? [])
  }
  return {
    docs,
    page: result.page ?? page,
    totalDocs: result.totalDocs,
    totalPages: result.totalPages,
  }
}
