import type { Payload, Where } from 'payload'

import type { PostSummary } from '@/components/Posts/types'

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
 */
export const findPostSummaries = async (
  payload: Payload,
  {
    categoryId,
    limit,
    page = 1,
  }: { categoryId?: number | string | null; limit: number; page?: number },
): Promise<PostSummaryPage> => {
  const where: Where | undefined =
    categoryId != null ? { categories: { in: [categoryId] } } : undefined
  const result = await payload.find({
    collection: 'posts',
    depth: 1,
    draft: false,
    limit,
    overrideAccess: false,
    page,
    select: POST_SUMMARY_SELECT,
    sort: ['-publishedAt', '-id'],
    where,
  })
  return {
    docs: result.docs as PostSummary[],
    page: result.page ?? page,
    totalDocs: result.totalDocs,
    totalPages: result.totalPages,
  }
}
