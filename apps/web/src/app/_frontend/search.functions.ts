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
  .validator((data: { q?: string }) => ({ q: String(data?.q ?? '').slice(0, MAX_QUERY_LENGTH) }))
  .handler(async ({ data }): Promise<SearchPageResult> => {
    const query = data.q.trim()
    if (!query) return { query, results: [], status: 'ok' }

    const { getRequestHeaders } = await import('@tanstack/react-start/server')
    const { cloudflareEnv } = await import('#cloudflare-runtime')
    const { searchRateLimit } = await import('@/plugins/searchRateLimit')
    const { siteSearchIndex } = await import('@/search/siteIndex')

    const allowed = await searchRateLimit(cloudflareEnv.SEARCH_RATE_LIMIT)(
      new Headers(getRequestHeaders()),
    )
    if (!allowed) return { query, results: [], status: 'limited' }
    try {
      return {
        query,
        results: await siteSearchIndex.search(query, { limit: MAX_SEARCH_LIMIT }),
        status: 'ok',
      }
    } catch (error) {
      console.error('[search] query failed', error)
      return { query, results: [], status: 'error' }
    }
  })
