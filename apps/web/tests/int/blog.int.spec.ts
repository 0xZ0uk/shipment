// @vitest-environment jsdom
import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'

import { collectArchiveBlocks } from '@/components/Posts/archiveBlocks'
import type { LayoutBlock } from '@/blocks/components'
import type { PostSummary } from '@/components/Posts/types'
import { formatPostDate } from '@/components/Posts/PostMeta'
import { searchEntryFor } from '@/plugins/siteSearch'
import { archiveHead, postHead } from '@/utilities/blogHead'
import {
  archivePageTags,
  postPageTags,
  publicPageHeaders,
  PUBLIC_PAGE_CACHE_CONTROL,
} from '@/utilities/cacheControl'
import { buildPostJsonLd } from '@/utilities/postJsonLd'
import {
  archivePageCount,
  archivePagePath,
  BLOG_PAGE_SIZE,
  categoryPath,
  parseArchivePage,
  postPath,
} from '@/utilities/postPath'
import { buildRssFeed, escapeXml } from '@/utilities/rss'
import { postSocialContext } from '@/utilities/socialsPageSource'

const LINE_SEPARATOR = String.fromCharCode(0x2028)

const post = (id: number, overrides: Partial<PostSummary> = {}): PostSummary => ({
  id,
  title: `Post ${id}`,
  slug: `post-${id}`,
  excerpt: `Excerpt ${id}`,
  publishedAt: `2026-10-${String(10 + id).padStart(2, '0')}T09:00:00.000Z`,
  authors: [{ id: 1, name: 'Alex Writer', slug: 'alex-writer' }],
  categories: [{ id: 2, title: 'Guides', slug: 'guides' }],
  ...overrides,
})

const parseXml = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
  return doc
}

describe('blog paths and pagination', () => {
  it('builds post, category and archive paths', () => {
    expect(postPath('hello world')).toBe('/blog/hello%20world')
    expect(categoryPath('news')).toBe('/blog/category/news')
    expect(archivePagePath('/blog', 1)).toBe('/blog')
    expect(archivePagePath('/blog', 3)).toBe('/blog/page/3')
    expect(archivePagePath(categoryPath('news'), 2)).toBe('/blog/category/news/page/2')
  })

  it('reads page numbers from the URL, rejecting anything but a plain positive integer', () => {
    expect(parseArchivePage('1')).toBe(1)
    expect(parseArchivePage('12')).toBe(12)
    for (const bad of ['0', '01', '-1', '1.5', 'abc', '', '9999999']) {
      expect(parseArchivePage(bad), bad).toBeNull()
    }
  })

  it('counts pages: at least one, then one per page size', () => {
    expect(archivePageCount(0)).toBe(1)
    expect(archivePageCount(1)).toBe(1)
    expect(archivePageCount(BLOG_PAGE_SIZE)).toBe(1)
    expect(archivePageCount(BLOG_PAGE_SIZE + 1)).toBe(2)
    expect(archivePageCount(25, 10)).toBe(3)
  })
})

describe('buildRssFeed', () => {
  const xml = buildRssFeed({
    description: 'The latest posts.',
    posts: [post(2), post(1)],
    siteUrl: 'https://example.com/',
    title: 'Shipment blog',
  })

  it('is valid RSS 2.0 with absolute URLs, newest first', () => {
    const doc = parseXml(xml)
    expect(doc.documentElement.nodeName).toBe('rss')
    expect(doc.documentElement.getAttribute('version')).toBe('2.0')
    const channel = doc.getElementsByTagName('channel')[0]!
    expect(channel.getElementsByTagName('link')[0]?.textContent).toBe('https://example.com/blog')
    const items = [...doc.getElementsByTagName('item')]
    expect(items.map((item) => item.getElementsByTagName('link')[0]?.textContent)).toEqual([
      'https://example.com/blog/post-2',
      'https://example.com/blog/post-1',
    ])
    expect(items[0]!.getElementsByTagName('guid')[0]?.getAttribute('isPermaLink')).toBe('true')
    expect(items[0]!.getElementsByTagName('pubDate')[0]?.textContent).toBe(
      'Mon, 12 Oct 2026 09:00:00 GMT',
    )
    expect(items[0]!.getElementsByTagName('category')[0]?.textContent).toBe('Guides')
    expect(items[0]!.getElementsByTagName('dc:creator')[0]?.textContent).toBe('Alex Writer')
    expect(xml).toContain('<atom:link href="https://example.com/blog/rss.xml" rel="self"')
  })

  it('escapes editor-written text', () => {
    const evil = `Tom & Jerry <script>alert("x")</script> \u0001`
    const feed = buildRssFeed({
      description: 'd',
      posts: [post(1, { excerpt: evil, title: evil })],
      siteUrl: 'https://example.com',
      title: 't',
    })
    const doc = parseXml(feed)
    const item = doc.getElementsByTagName('item')[0]!
    expect(item.getElementsByTagName('title')[0]?.textContent).toBe(
      'Tom & Jerry <script>alert("x")</script> ',
    )
    expect(feed).not.toContain('<script>')
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;',
    )
  })

  it('renders an empty channel, and skips posts without a slug', () => {
    const empty = parseXml(
      buildRssFeed({ description: 'd', posts: [], siteUrl: 'https://example.com', title: 't' }),
    )
    expect(empty.getElementsByTagName('item')).toHaveLength(0)
    const feed = parseXml(
      buildRssFeed({
        description: 'd',
        posts: [post(1, { slug: '' })],
        siteUrl: 'https://example.com',
        title: 't',
      }),
    )
    expect(feed.getElementsByTagName('item')).toHaveLength(0)
  })
})

describe('buildPostJsonLd', () => {
  const nodes = buildPostJsonLd(
    {
      authors: [{ name: 'Alex Writer' }, { name: 'Sam Builder' }, 3],
      cover: { id: 9, url: '/api/media/file/cover.jpg' } as never,
      createdAt: '2026-10-01T00:00:00.000Z',
      excerpt: 'An excerpt',
      meta: {},
      publishedAt: '2026-10-02T00:00:00.000Z',
      slug: 'hello',
      title: 'Hello',
      updatedAt: '2026-10-03T00:00:00.000Z',
    },
    'https://example.com/',
  ).map((node) => JSON.parse(node) as Record<string, unknown>)

  it('emits BlogPosting with authors, dates, image, publisher and the page it is about', () => {
    expect(nodes.map((node) => node['@type'])).toEqual(['BlogPosting', 'BreadcrumbList'])
    expect(nodes[0]).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      author: [
        { '@type': 'Person', name: 'Alex Writer' },
        { '@type': 'Person', name: 'Sam Builder' },
      ],
      dateModified: '2026-10-03T00:00:00.000Z',
      datePublished: '2026-10-02T00:00:00.000Z',
      description: 'An excerpt',
      headline: 'Hello',
      image: 'https://example.com/api/media/file/cover.jpg',
      mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://example.com/blog/hello' },
      publisher: { '@type': 'Organization', name: 'Shipment', url: 'https://example.com' },
      url: 'https://example.com/blog/hello',
    })
    expect(nodes[1]?.itemListElement).toEqual([
      { '@type': 'ListItem', item: 'https://example.com/', name: 'Home', position: 1 },
      { '@type': 'ListItem', item: 'https://example.com/blog', name: 'Blog', position: 2 },
      { '@type': 'ListItem', item: 'https://example.com/blog/hello', name: 'Hello', position: 3 },
    ])
  })

  it('prefers the SEO description and image, and drops empty values', () => {
    const [posting] = buildPostJsonLd(
      {
        excerpt: 'Excerpt',
        meta: { description: 'Meta', image: { id: 1, url: 'https://cdn.example.com/a.jpg' } as never },
        slug: 'x',
        title: 'X',
      },
      'https://example.com',
    ).map((node) => JSON.parse(node) as Record<string, unknown>)
    expect(posting).toMatchObject({ description: 'Meta', image: 'https://cdn.example.com/a.jpg' })
    expect(posting).not.toHaveProperty('author')
    expect(posting).not.toHaveProperty('datePublished')
  })

  it('escapes </script> in editor text', () => {
    const evil = `</script><script>alert(1)</script> & ${LINE_SEPARATOR}`
    for (const node of buildPostJsonLd({ meta: {}, slug: 'x', title: evil }, 'https://e.com')) {
      expect(node).not.toMatch(new RegExp(`[<>&${LINE_SEPARATOR}]`))
      expect(JSON.parse(node)).toBeTruthy()
    }
  })
})

/** The locale fields with one locale (`LOCALES` unset), as the blog loaders return them. */
const singleLocale = { fallback: false, locale: 'en', translations: ['en'] }

describe('blog heads', () => {
  it('describes a post as an article at its canonical URL', () => {
    const head = postHead({
      draft: false,
      jsonLd: ['{}'],
      livePreview: false,
      post: {
        excerpt: 'Short',
        meta: {},
        publishedAt: '2026-10-02T00:00:00.000Z',
        slug: 'hello',
        title: 'Hello',
      } as never,
      siteUrl: 'https://example.com',
      ...singleLocale,
    })
    expect(head.meta).toContainEqual({ title: 'Hello | Shipment' })
    expect(head.meta).toContainEqual({ property: 'og:type', content: 'article' })
    expect(head.meta).toContainEqual({ name: 'description', content: 'Short' })
    expect(head.meta).toContainEqual({
      property: 'article:published_time',
      content: '2026-10-02T00:00:00.000Z',
    })
    expect(head.links).toEqual([{ rel: 'canonical', href: 'https://example.com/blog/hello' }])
    expect(head.scripts).toContainEqual({ children: '{}', type: 'application/ld+json' })
  })

  it('gives archive page 1 the bare path as canonical, and later pages prev/next links', () => {
    const base = {
      basePath: '/blog',
      category: null,
      found: true,
      posts: [],
      siteUrl: 'https://example.com',
      totalDocs: 30,
      totalPages: 4,
      ...singleLocale,
    }
    expect(archiveHead({ ...base, page: 1 }).links).toEqual([
      { rel: 'canonical', href: 'https://example.com/blog' },
      { rel: 'next', href: 'https://example.com/blog/page/2' },
    ])
    const page2 = archiveHead({ ...base, page: 2 })
    expect(page2.links).toEqual([
      { rel: 'canonical', href: 'https://example.com/blog/page/2' },
      { rel: 'prev', href: 'https://example.com/blog' },
      { rel: 'next', href: 'https://example.com/blog/page/3' },
    ])
    expect(page2.meta).toContainEqual({ title: 'Blog (page 2) | Shipment' })
    const category = archiveHead({
      ...base,
      basePath: '/blog/category/news',
      category: { description: 'All the news', id: 3, slug: 'news', title: 'News' },
      page: 4,
    })
    expect(category.links?.at(-1)).toEqual({
      rel: 'prev',
      href: 'https://example.com/blog/category/news/page/3',
    })
    expect(category.meta).toContainEqual({ name: 'description', content: 'All the news' })
  })
})

describe('blog edge caching', () => {
  it('tags a post page with its path, the layout, its authors and categories', () => {
    const tags = postPageTags({ authors: [{ id: 1 }, 4], categories: [{ id: 2 }] })
    expect(tags).toEqual(['author:1', 'author:4', 'category:2'])
    expect(publicPageHeaders(postPath('hello'), tags)).toEqual({
      'Cache-Control': PUBLIC_PAGE_CACHE_CONTROL,
      'Cloudflare-CDN-Cache-Control': 'max-age=300, stale-while-revalidate=86400',
      'Cache-Tag': 'page:/blog/hello,layout,author:1,author:4,category:2',
    })
  })

  it('tags archives (and the feed) with `posts`, and a category archive with its category', () => {
    expect(archivePageTags()).toEqual(['posts'])
    expect(archivePageTags(3)).toEqual(['posts', 'category:3'])
    expect(publicPageHeaders('/blog/page/2', archivePageTags())['Cache-Tag']).toBe(
      'page:/blog/page/2,layout,posts',
    )
  })
})

describe('collectArchiveBlocks (what loadPage queries for the Posts archive block)', () => {
  it('finds the blocks of a layout and of its reusable sections, with clamped counts', () => {
    const layout = [
      { blockType: 'hero', id: 'h' },
      { blockType: 'postsArchive', id: 'a', count: 3 },
      { blockType: 'postsArchive', id: 'b', count: 40, category: { id: 7, slug: 'news' } },
      { blockType: 'postsArchive', id: 'c', count: 0, category: 8 },
      { blockType: 'postsArchive', count: 2 },
      {
        blockType: 'globalSection',
        id: 'g',
        reusableSection: { id: 1, layout: [{ blockType: 'postsArchive', id: 'd' }] },
      },
      { blockType: 'globalSection', id: 'e', reusableSection: 2 },
    ] as unknown as LayoutBlock[]
    expect(collectArchiveBlocks(layout)).toEqual([
      { id: 'a', limit: 3, categoryId: null },
      { id: 'b', limit: 12, categoryId: 7 },
      { id: 'c', limit: 3, categoryId: 8 },
      { id: 'd', limit: 3, categoryId: null },
    ])
    expect(collectArchiveBlocks(null)).toEqual([])
  })
})

describe('post search entry', () => {
  // `searchEntryFor` only reads the analyzer's extractors from the Payload instance.
  const payload = { config: { custom: {} } } as unknown as Payload
  const options = { path: (doc: Record<string, unknown>) => postPath(doc.slug as string) }
  const content = {
    root: {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text: 'Marmalade for quokkas.', version: 1 }],
          version: 1,
        },
      ],
      version: 1,
    },
  }

  it('indexes a published post with its title, meta description and rich-text body', () => {
    const entry = searchEntryFor(
      payload,
      'posts',
      {
        _status: 'published',
        content,
        id: 5,
        meta: { description: 'All about jam' },
        slug: 'jam',
        title: 'Jam',
      },
      options,
    )
    expect(entry).toMatchObject({
      body: expect.stringContaining('Marmalade for quokkas.'),
      collection: 'posts',
      description: 'All about jam',
      id: 5,
      path: '/blog/jam',
      title: 'Jam',
    })
  })

  it('leaves drafts and noindex posts out', () => {
    expect(
      searchEntryFor(payload, 'posts', { _status: 'draft', id: 1, slug: 'a', title: 'A' }, options),
    ).toBeNull()
    expect(
      searchEntryFor(
        payload,
        'posts',
        { _status: 'published', id: 1, noindex: true, slug: 'a', title: 'A' },
        options,
      ),
    ).toBeNull()
  })
})

describe('postSocialContext', () => {
  it('uses the SEO meta, else the title and excerpt, links the post and offers its images', () => {
    const cover = {
      id: 3,
      mimeType: 'image/png',
      url: '/api/media/file/cover.png',
    } as never
    expect(
      postSocialContext(
        { cover, excerpt: 'Short', id: 4, meta: {}, slug: 'hello', title: 'Hello' },
        'https://example.com/',
      ),
    ).toEqual({
      baseDescription: 'Short',
      baseTitle: 'Hello',
      images: [
        {
          format: 'png',
          role: 'main',
          url: 'https://example.com/api/media/file/cover.png',
        },
      ],
      link: 'https://example.com/blog/hello',
      sourceId: '4',
      sourceKind: 'post',
    })
  })
})

describe('formatPostDate', () => {
  it('formats in UTC, whatever the time zone, and ignores bad values', () => {
    expect(formatPostDate('2026-11-08T23:30:00.000Z')).toBe('8 November 2026')
    expect(formatPostDate('nope')).toBeNull()
    expect(formatPostDate(null)).toBeNull()
  })
})
