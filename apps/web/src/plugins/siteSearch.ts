import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionConfig,
  Endpoint,
  Payload,
  PayloadRequest,
  Plugin,
} from 'payload'

import { isListedDoc, searchTextFromDoc } from '@shipment/payload-seo-analyzer'

import { MAX_QUERY_LENGTH } from '@/search/matchQuery'
import type { SearchEntry, SearchIndex } from '@/search/searchIndex'
import type { SearchResponse } from '@/search/types'

import { isRestDraftSave } from './edgeCachePurge'

type Doc = Record<string, unknown>

export type SearchCollectionOptions = {
  /** Where the document is served (`/pricing`), or null when it has no URL (never indexed). */
  path: (doc: Doc) => string | null
  /** Documents to leave out on top of drafts and `noindex` (the sitemap's own filter). */
  exclude?: (doc: Doc) => boolean
}

export type SiteSearchOptions = {
  /** The collections to index, by slug. Each needs drafts or none; Pages has drafts. */
  collections: Record<string, SearchCollectionOptions>
  index: SearchIndex
  /** Keeps index writes alive after the response (`waitUntil` from `#cloudflare-runtime`). */
  waitUntil?: (promise: Promise<unknown>) => void
  /** False when the caller is over its limit (`searchRateLimit`). Without it, no limit. */
  rateLimit?: (headers: Headers) => Promise<boolean>
}

/**
 * Site search (#157): an FTS5 index in SEO_D1 (`src/search`), kept in sync with the listed
 * collections, and `GET /api/search?q=` for the header's palette and `/search`.
 *
 * A document is indexed while it is published, not `noindex` (both as the sitemap reads them,
 * `isListedDoc`) and not excluded by its collection (A/B variants), with its title, meta
 * description and the analyzer's plain text of its blocks (`searchTextFromDoc`).
 *
 * Saves never wait on or fail because of the index: the hooks re-read the published document
 * and write the index in the background (`waitUntil`), logging failures. Autosaves and other
 * REST draft saves are skipped: they change nothing visitors see. `POST /api/search/reindex`
 * (signed-in users) and `pnpm search:reindex` rebuild the index from every document.
 */
export const siteSearch =
  (options: SiteSearchOptions): Plugin =>
  (config) => ({
    ...config,
    collections: (config.collections ?? []).map((collection) =>
      options.collections[collection.slug] ? withSearchHooks(collection, options) : collection,
    ),
    endpoints: [...(config.endpoints ?? []), searchEndpoint(options), reindexEndpoint],
    custom: { ...config.custom, siteSearch: options },
  })

const optionsOf = (payload: Payload): SiteSearchOptions => {
  const options = (payload.config.custom as { siteSearch?: SiteSearchOptions } | undefined)
    ?.siteSearch
  if (!options) throw new Error('siteSearch: the plugin is not in the Payload config')
  return options
}

/** The index row for a document as read, or null when it must not be searchable. */
export function searchEntryFor(
  payload: Payload,
  collection: string,
  doc: Doc | null | undefined,
  options: SearchCollectionOptions,
): SearchEntry | null {
  if (!doc || !isListedDoc(doc) || options.exclude?.(doc)) return null
  const path = options.path(doc)
  if (!path) return null
  const text = searchTextFromDoc(doc, collection, { extractors: payload })
  return { collection, id: doc.id as number | string, path, ...text }
}

/**
 * Brings one document's row in line with its published version: the main document as stored
 * (`draft: false`), populated one level for reusable sections and links. Missing, draft,
 * `noindex` or excluded: its row goes.
 */
export async function syncSearchDoc(
  payload: Payload,
  collection: string,
  id: number | string,
): Promise<void> {
  const { collections, index } = optionsOf(payload)
  const doc = await payload.findByID({
    collection: collection as never,
    id,
    depth: 1,
    draft: false,
    overrideAccess: true,
    disableErrors: true,
  })
  const entry = searchEntryFor(payload, collection, doc as Doc | null, collections[collection]!)
  if (entry) await index.upsert(entry)
  else await index.remove(collection, id)
}

export type ReindexResult = Record<string, { indexed: number; removed: number }>

/** Rebuilds the index from every document of the listed collections (the backfill). */
export async function reindexSearch(payload: Payload): Promise<ReindexResult> {
  const { collections, index } = optionsOf(payload)
  const result: ReindexResult = {}
  for (const [collection, options] of Object.entries(collections)) {
    const listed = new Set<string>()
    for (let page = 1, hasNextPage = true; hasNextPage; page++) {
      const batch = await payload.find({
        collection: collection as never,
        depth: 1,
        draft: false,
        limit: 50,
        page,
        overrideAccess: true,
      })
      for (const doc of batch.docs as Doc[]) {
        const entry = searchEntryFor(payload, collection, doc, options)
        if (!entry) continue
        await index.upsert(entry)
        listed.add(String(entry.id))
      }
      hasNextPage = batch.hasNextPage
    }
    const stale = (await index.ids(collection)).filter((id) => !listed.has(id))
    for (const id of stale) await index.remove(collection, id)
    result[collection] = { indexed: listed.size, removed: stale.length }
  }
  return result
}

const inBackground = (
  options: SiteSearchOptions,
  payload: Payload,
  task: () => Promise<unknown>,
) => {
  const promise = task().catch((error: unknown) =>
    payload.logger.error({ err: error, msg: '[search] index update failed' }),
  )
  // Under Node (`waitUntil` undefined) the process outlives the response on its own.
  options.waitUntil?.(promise)
}

function withSearchHooks(
  collection: CollectionConfig,
  options: SiteSearchOptions,
): CollectionConfig {
  const afterChange: CollectionAfterChangeHook = ({ data, doc, operation, req }) => {
    // A draft save (autosave, live preview, on-page editing) leaves the published page as is.
    if (isRestDraftSave(req, data)) return doc
    if (operation === 'create' && doc._status === 'draft') return doc
    // A publish, an unpublish or a local-API save: re-read what visitors see.
    inBackground(options, req.payload, () => syncSearchDoc(req.payload, collection.slug, doc.id))
    return doc
  }
  const afterDelete: CollectionAfterDeleteHook = ({ id, req }) => {
    inBackground(options, req.payload, () => options.index.remove(collection.slug, id))
  }
  return {
    ...collection,
    hooks: {
      ...collection.hooks,
      afterChange: [...(collection.hooks?.afterChange ?? []), afterChange],
      afterDelete: [...(collection.hooks?.afterDelete ?? []), afterDelete],
    },
  }
}

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers })

/**
 * `GET /api/search?q=<query>&limit=<n>`: the best matches, `SearchResponse`. Public, rate
 * limited per client IP, and private like every response that doesn't opt in (the answer
 * depends on the query string only, but nothing gains from caching it at the edge).
 */
const searchEndpoint = (options: SiteSearchOptions): Endpoint => ({
  path: '/search',
  method: 'get',
  handler: async (req) => {
    const params = req.searchParams ?? new URL(req.url ?? '', 'http://localhost').searchParams
    const query = (params.get('q') ?? '').slice(0, MAX_QUERY_LENGTH)
    if (!query.trim()) return json({ query, results: [] } satisfies SearchResponse)
    if (options.rateLimit && !(await options.rateLimit(req.headers))) {
      return json({ error: 'Too many searches. Try again in a minute.' }, 429, {
        'Retry-After': '60',
      })
    }
    try {
      const results = await options.index.search(query, {
        limit: Number(params.get('limit')) || undefined,
      })
      return json({ query, results } satisfies SearchResponse)
    } catch (error) {
      req.payload.logger.error({ err: error, msg: '[search] query failed' })
      return json({ error: 'Search is unavailable right now.' }, 503)
    }
  },
})

/** `POST /api/search/reindex`: the backfill, for signed-in users. Answers with the counts. */
const reindexEndpoint: Endpoint = {
  path: '/search/reindex',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!req.user) return json({ error: 'Unauthorized' }, 401)
    return json(await reindexSearch(req.payload))
  },
}
