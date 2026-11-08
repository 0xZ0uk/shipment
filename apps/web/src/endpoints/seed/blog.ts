import type { RequiredDataFromCollectionSlug } from 'payload'

import { bulletList, heading, paragraph, richText } from '@/blocks/shared/lexical'

type PostData = RequiredDataFromCollectionSlug<'posts'>

/** Example bylines (no avatars: a fresh install has no media). */
export const blogAuthors: RequiredDataFromCollectionSlug<'authors'>[] = [
  {
    name: 'Alex Writer',
    slug: 'alex-writer',
    bio: 'Writes about content sites, editors and the web platform.',
  },
  {
    name: 'Sam Builder',
    slug: 'sam-builder',
    bio: 'Builds and ships the template, one Worker at a time.',
  },
]

export const blogCategories: RequiredDataFromCollectionSlug<'categories'>[] = [
  { title: 'Guides', slug: 'guides', description: 'How to get things done with Shipment.' },
  { title: 'News', slug: 'news', description: 'What changed, and why.' },
]

/**
 * Example posts, newest first. `authors` and `categories` name the seeded documents by slug;
 * `seedBlog` swaps in their ids.
 */
export const blogPosts: (Omit<PostData, 'authors' | 'categories'> & {
  authors: string[]
  categories: string[]
})[] = [
  {
    title: 'Welcome to the blog',
    slug: 'welcome-to-the-blog',
    excerpt: 'Posts live next to your pages: drafts, live preview, on-page editing and SEO included.',
    publishedAt: '2026-11-05T09:00:00.000Z',
    authors: ['sam-builder'],
    categories: ['news'],
    content: richText(
      paragraph(
        'This blog runs on the same Worker as the rest of the site. Posts are drafts until you publish them, and every change shows in live preview first.',
      ),
      heading('h2', 'What you get'),
      bulletList(
        'An archive at /blog, with a page per category',
        'An RSS feed at /blog/rss.xml',
        'Structured data for search engines on every post',
      ),
    ),
    _status: 'published',
  },
  {
    title: 'Writing posts that people finish',
    slug: 'writing-posts-that-people-finish',
    excerpt: 'Short paragraphs, clear headings and one idea per section.',
    publishedAt: '2026-10-22T09:00:00.000Z',
    authors: ['alex-writer'],
    categories: ['guides'],
    content: richText(
      paragraph('Readers skim first. Give them headings that say what each section is about.'),
      heading('h2', 'Keep paragraphs short'),
      paragraph('Two to four sentences is plenty on a screen.'),
    ),
    _status: 'published',
  },
  {
    title: 'Adding the latest posts to any page',
    slug: 'adding-the-latest-posts-to-any-page',
    excerpt: 'The Latest posts block lists your newest posts, from every category or one.',
    publishedAt: '2026-10-08T09:00:00.000Z',
    authors: ['alex-writer', 'sam-builder'],
    categories: ['guides', 'news'],
    content: richText(
      paragraph(
        'Pick the Latest posts block in the page editor, choose a layout and how many posts to show. It updates on its own whenever you publish.',
      ),
    ),
    _status: 'published',
  },
]
