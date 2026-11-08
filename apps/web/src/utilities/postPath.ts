/**
 * Blog URLs, in one place so a locale prefix (#158) can be added here later. Archive pages are
 * paths, not `?page=`: Workers Cache keys by URL, and page 1 is the bare path (its canonical).
 */

/** The blog archive (page 1). */
export const BLOG_PATH = '/blog'

/** The RSS 2.0 feed of the latest posts. */
export const BLOG_FEED_PATH = `${BLOG_PATH}/rss.xml`

/** Posts per archive page (the blog and category archives). */
export const BLOG_PAGE_SIZE = 9

/** Posts in the RSS feed. */
export const BLOG_FEED_SIZE = 20

/**
 * Slugs a post can't take: they're the archive's own path segments (`/blog/page/2`,
 * `/blog/category/news`, `/blog/rss.xml`), which win over a post's URL.
 */
export const RESERVED_POST_SLUGS = ['page', 'category', 'rss.xml'] as const

/** A post is served at `/blog/<slug>`. */
export const postPath = (slug: string) => `${BLOG_PATH}/${encodeURIComponent(slug)}`

/** A category's archive: `/blog/category/<slug>`. */
export const categoryPath = (slug: string) => `${BLOG_PATH}/category/${encodeURIComponent(slug)}`

/** Page `page` of an archive at `base` (`BLOG_PATH` or `categoryPath(slug)`): page 1 is `base`. */
export const archivePagePath = (base: string, page: number) =>
  page > 1 ? `${base}/page/${page}` : base

/**
 * An archive page number from its URL segment: a positive integer without leading zeros, else
 * null (the route answers 404). `1` is valid; the route redirects it to the bare path.
 */
export const parseArchivePage = (value: string): number | null =>
  /^[1-9]\d{0,5}$/.test(value) ? Number(value) : null

/** Pages an archive of `total` posts has: always at least one (an empty blog shows page 1). */
export const archivePageCount = (total: number, pageSize = BLOG_PAGE_SIZE) =>
  Math.max(1, Math.ceil(total / pageSize))
