import type { Config, Endpoint, PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { searchRateLimit } from '@/plugins/searchRateLimit'
import { siteSearch } from '@/plugins/siteSearch'

import { toMatchQuery } from '@/search/matchQuery'
import { migrateSearchIndex, SEARCH_MIGRATIONS } from '@/search/schema'
import {
  createSearchIndex,
  type SearchEntry,
  type SearchIndex,
  snippetParts,
} from '@/search/searchIndex'

// The site search index (#157) on its own in-memory D1 (workerd, like production, so FTS5 and
// its tokenizer are the real ones). The shared local D1 in `.wrangler/state` stays untouched.

let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ SEO_D1: D1Database }>>>
let db: D1Database
let index: SearchIndex

const entry = (id: number, fields: Partial<SearchEntry>): SearchEntry => ({
  collection: 'pages',
  id,
  path: `/page-${id}`,
  title: '',
  description: '',
  body: '',
  ...fields,
})

beforeAll(async () => {
  proxy = await getPlatformProxy<{ SEO_D1: D1Database }>({ persist: false, remoteBindings: false })
  db = proxy.env.SEO_D1
  index = createSearchIndex(db)
}, 60_000)

afterAll(async () => {
  await proxy?.dispose()
})

describe('search index migrations', () => {
  it('apply once and record themselves', async () => {
    expect(await migrateSearchIndex(db)).toEqual(SEARCH_MIGRATIONS.map(({ id }) => id))
    expect(await migrateSearchIndex(db)).toEqual([])
  })
})

describe('search index', () => {
  it('upserts one row per document and removes it', async () => {
    await index.upsert(entry(1, { title: 'Kayak tours', body: 'Paddle the coast.' }))
    await index.upsert(entry(1, { title: 'Kayak tours', body: 'Paddle the river.' }))
    const results = await index.search('kayak')
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      collection: 'pages',
      id: '1',
      path: '/page-1',
      title: 'Kayak tours',
    })
    expect(await index.search('coast')).toEqual([])
    expect(await index.ids('pages')).toEqual(['1'])

    await index.remove('pages', 1)
    expect(await index.search('kayak')).toEqual([])
    expect(await index.ids('pages')).toEqual([])
  })

  it('ranks title matches above description and body matches', async () => {
    await index.upsert(entry(10, { title: 'About us', body: 'We also sell lanterns.' }))
    await index.upsert(entry(11, { title: 'Lanterns', body: 'Paper lanterns in every colour.' }))
    await index.upsert(entry(12, { title: 'Shop', description: 'Lanterns and lamps.' }))
    const results = await index.search('lantern')
    expect(results.map(({ id }) => id)).toEqual(['11', '12', '10'])
    for (const id of [10, 11, 12]) await index.remove('pages', id)
  })

  it('matches prefixes, every term, and ignores case and accents', async () => {
    await index.upsert(entry(20, { title: 'Café menu', body: 'Espresso and pastries.' }))
    await index.upsert(entry(21, { title: 'Cafeteria', body: 'Soup.' }))
    expect((await index.search('CAFE')).map(({ id }) => id).sort()).toEqual(['20', '21'])
    expect((await index.search('cafe espr')).map(({ id }) => id)).toEqual(['20'])
    expect(await index.search('cafe tea')).toEqual([])
    for (const id of [20, 21]) await index.remove('pages', id)
  })

  it('marks the matched words in the snippet', async () => {
    await index.upsert(entry(30, { title: 'Hours', body: 'We open at nine on weekdays.' }))
    const [result] = await index.search('weekday')
    expect(result.snippet).toEqual([
      { text: 'We open at nine on ' },
      { text: 'weekdays', match: true },
      { text: '.' },
    ])
    await index.remove('pages', 30)
  })

  it('caps the number of results', async () => {
    for (let id = 40; id < 70; id++) await index.upsert(entry(id, { title: `Widget ${id}` }))
    expect(await index.search('widget')).toHaveLength(8)
    expect(await index.search('widget', { limit: 3 })).toHaveLength(3)
    expect(await index.search('widget', { limit: 500 })).toHaveLength(20)
    expect(await index.search('widget', { limit: 0 })).toHaveLength(8)
    for (let id = 40; id < 70; id++) await index.remove('pages', id)
  })

  it('never throws on FTS5 syntax in the query', async () => {
    await index.upsert(entry(80, { title: 'Near the sea', body: 'Not a fan of ORs or ANDs.' }))
    const queries = [
      '"',
      '"near',
      'sea"',
      '*',
      'sea*',
      '* sea',
      'NEAR',
      'NEAR(sea fan)',
      'near(',
      '-sea',
      'sea -fan',
      'sea OR',
      'AND',
      'NOT',
      '(((',
      'sea)',
      'title:sea',
      '^sea',
      '{title body}: sea',
      "'; DROP TABLE search_index; --",
      '',
      '   ',
      '😀',
      'x'.repeat(5000),
    ]
    for (const query of queries) {
      await expect(index.search(query), query).resolves.toBeInstanceOf(Array)
    }
    expect((await index.search('NEAR')).map(({ id }) => id)).toEqual(['80'])
    expect((await index.search('sea -fan')).map(({ id }) => id)).toEqual(['80'])
    await index.remove('pages', 80)
  })
})

describe('toMatchQuery', () => {
  it('quotes every term as a prefix and drops punctuation', () => {
    expect(toMatchQuery('Pricing plans')).toBe('"pricing"* "plans"*')
    expect(toMatchQuery('"NEAR(a b)" -c* OR d')).toBe('"near"* "a"* "b"* "c"* "or"* "d"*')
    expect(toMatchQuery('façade')).toBe('"façade"*')
    expect(toMatchQuery('  ')).toBeNull()
    expect(toMatchQuery('***')).toBeNull()
  })

  it('caps the number of terms', () => {
    expect(toMatchQuery('a b c d e f g h i j')?.split(' ')).toHaveLength(8)
  })
})

describe('snippetParts', () => {
  it('splits marked matches out of the excerpt', () => {
    expect(snippetParts('')).toEqual([])
    expect(snippetParts('plain')).toEqual([{ text: 'plain' }])
    expect(snippetParts('a b c')).toEqual([
      { text: 'a', match: true },
      { text: ' b ' },
      { text: 'c', match: true },
    ])
  })
})

describe('GET /api/search', () => {
  const endpointWith = (rateLimit?: (headers: Headers) => Promise<boolean>) => {
    const config = siteSearch({ collections: {}, index, rateLimit })({} as Config) as Config
    return config.endpoints!.find((e) => e.path === '/search' && e.method === 'get') as Endpoint
  }
  const req = (query: string) => {
    const url = `http://localhost/api/search?${query}`
    return {
      url,
      searchParams: new URL(url).searchParams,
      headers: new Headers({ 'cf-connecting-ip': '203.0.113.9' }),
      payload: { logger: { error: vi.fn() } },
    } as unknown as PayloadRequest
  }

  it('answers with the matches and no Cache-Control of its own (private by default)', async () => {
    await index.upsert(entry(90, { title: 'Ferry timetable' }))
    const response = await endpointWith()!.handler(req('q=ferry'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBeNull()
    expect(await response.json()).toMatchObject({
      query: 'ferry',
      results: [{ id: '90', title: 'Ferry timetable' }],
    })
    await index.remove('pages', 90)
  })

  it('answers 429 when the caller is over the limit', async () => {
    const rateLimit = vi.fn(async () => false)
    const response = await endpointWith(rateLimit).handler(req('q=ferry'))
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('60')
    expect(rateLimit).toHaveBeenCalledOnce()
  })

  it("doesn't count empty queries", async () => {
    const rateLimit = vi.fn(async () => false)
    const response = await endpointWith(rateLimit).handler(req('q=%20'))
    expect(await response.json()).toEqual({ query: ' ', results: [] })
    expect(rateLimit).not.toHaveBeenCalled()
  })
})

describe('searchRateLimit', () => {
  it('limits per client IP through the binding', async () => {
    const limit = vi.fn(async () => ({ success: false }))
    const allowed = await searchRateLimit({ limit } as unknown as RateLimit)(
      new Headers({ 'cf-connecting-ip': '203.0.113.7' }),
    )
    expect(allowed).toBe(false)
    expect(limit).toHaveBeenCalledWith({ key: 'search:203.0.113.7' })
  })

  it('lets everything through without the binding', async () => {
    expect(await searchRateLimit(undefined)(new Headers())).toBe(true)
  })
})
