import type { PostsArchiveBlock } from '@/payload-types'

import type { PostSummary } from '@/components/Posts/types'

import { defineBlockMeta } from '../shared/meta'

export const postsArchiveMeta = defineBlockMeta<PostsArchiveBlock>({
  slug: 'postsArchive',
  labels: { singular: 'Latest posts', plural: 'Latest posts' },
  group: 'Content',
  variants: [
    { label: 'Grid', value: 'grid' },
    { label: 'List', value: 'list' },
    { label: 'Featured', value: 'featured' },
  ],
  example: {
    eyebrow: 'Blog',
    title: 'Latest posts',
    description: 'News, guides and notes from the team.',
    count: 3,
  },
})

const sample = (id: number, title: string, excerpt: string, day: string): PostSummary => ({
  id,
  title,
  slug: `sample-post-${id}`,
  excerpt,
  publishedAt: `2026-${day}T09:00:00.000Z`,
  cover: null,
  authors: [{ id: 1, name: 'Alex Writer', slug: 'alex-writer' }],
  categories: [{ id: 1, title: 'Guides', slug: 'guides' }],
})

/**
 * Posts for the `/dev/blocks` gallery, which has no database. On a page the block's posts come
 * from the page loader (`loadPage`), never from the page's JSON.
 */
export const postsArchiveSamplePosts: PostSummary[] = [
  sample(
    1,
    'How we ship a content site on one Worker',
    'Pages, media and search on Cloudflare, with no servers to run.',
    '11-02',
  ),
  sample(
    2,
    'Writing for the web: five habits',
    'Short paragraphs, clear headings and one idea per section.',
    '10-21',
  ),
  sample(
    3,
    'A tour of the page blocks',
    'Heroes, pricing, FAQs and more, each with designed variants.',
    '10-09',
  ),
]
