import { createFileRoute } from '@tanstack/react-router'

import { POSTS_TAG, PRIVATE_CACHE_CONTROL, publicPageHeaders } from '@/utilities/cacheControl'
import { BLOG_FEED_PATH, BLOG_FEED_SIZE } from '@/utilities/postPath'
import { siteName } from '@/utilities/siteName'

/**
 * The blog's RSS 2.0 feed: the latest `BLOG_FEED_SIZE` published posts (`buildRssFeed`).
 *
 * It's the same for everyone (published posts, read without a user), so with `SITE_URL` set it
 * opts in to Workers Cache like a published page, tagged `posts` for the purge hooks. Without
 * `SITE_URL` its absolute URLs come from the request's host, which the cache key doesn't
 * include, so it stays private.
 */
export const Route = createFileRoute('/blog/rss.xml')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getPayload } = await import('payload')
        const payload = await getPayload({ config: (await import('@payload-config')).default })
        const { cloudflareEnv } = await import('#cloudflare-runtime')
        const { findPostSummaries } = await import('@/utilities/postQueries')
        const { buildRssFeed } = await import('@/utilities/rss')

        const configuredSiteUrl = process.env.SITE_URL || cloudflareEnv.SITE_URL
        const { docs } = await findPostSummaries(payload, { limit: BLOG_FEED_SIZE })
        const xml = buildRssFeed({
          description: `The latest posts from ${siteName}.`,
          posts: docs,
          siteUrl: configuredSiteUrl || new URL(request.url).origin,
          title: `${siteName} blog`,
        })

        return new Response(xml, {
          headers: {
            'Content-Type': 'application/rss+xml; charset=utf-8',
            ...(configuredSiteUrl
              ? publicPageHeaders(BLOG_FEED_PATH, [POSTS_TAG])
              : { 'Cache-Control': PRIVATE_CACHE_CONTROL }),
          },
        })
      },
    },
  },
})
