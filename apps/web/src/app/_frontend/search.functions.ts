import { createServerFn } from '@tanstack/react-start'

import { MAX_QUERY_LENGTH } from '@/search/matchQuery'
import { MAX_SEARCH_LIMIT, type SearchResult } from '@/search/types'

export type SearchPageResult = {
  query: string
  results: SearchResult[]
  status: 'ok' | 'limited' | 'error'
}

/**
 * The `/search` page's results: the same index and rate limit as `GET /api/search`. The
 * response keeps the default `private, no-cache` (src/server.ts): results are per query, and
 * nothing here opts into the edge cache.
 */
export const searchSite = createServerFn({ method: 'GET' })
  .validator((data: { locale?: string; q?: string }) => ({
    locale: data?.locale,
    q: String(data?.q ?? '').slice(0, MAX_QUERY_LENGTH),
  }))
  .handler(async ({ data }): Promise<SearchPageResult> => {
    const query = data.q.trim()
    if (!query) return { query, results: [], status: 'ok' }

    const { getRequestHeaders } = await import('@tanstack/react-start/server')
    const { cloudflareEnv } = await import('#cloudflare-runtime')
    const { searchRateLimit } = await import('@/plugins/searchRateLimit')
    const { siteSearchIndex } = await import('@/search/siteIndex')
    const { indexLocale } = await import('@/search/searchIndex')
    const { defaultLocale } = await import('@/i18n/locales')
    const { requestLocale } = await import('@/i18n/server')

    const allowed = await searchRateLimit(cloudflareEnv.SEARCH_RATE_LIMIT)(
      new Headers(getRequestHeaders()),
    )
    if (!allowed) return { query, results: [], status: 'limited' }
    try {
      return {
        query,
        // The visitor's locale's rows: pages published in it, at their prefixed paths.
        results: await siteSearchIndex.search(query, {
          limit: MAX_SEARCH_LIMIT,
          locale: indexLocale(requestLocale(data.locale), defaultLocale),
        }),
        status: 'ok',
      }
    } catch (error) {
      console.error('[search] query failed', error)
      return { query, results: [], status: 'error' }
    }
  })
