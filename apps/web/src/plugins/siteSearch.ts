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

import { hasRole } from '@/access/roles'
import { defaultLocale, isMultilingual, type Locale, locales, localizePath } from '@/i18n/locales'
import { readLocale, requestLocale, translatedLocales } from '@/i18n/server'
import { MAX_QUERY_LENGTH } from '@/search/matchQuery'
import { indexLocale, type SearchEntry, type SearchIndex } from '@/search/searchIndex'
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
  /**
   * Collections whose documents show inside indexed ones (reusable sections), by slug, with a
   * test of whether an indexed document (as stored, depth 0) shows a given one. When such a
   * document changes or goes, the indexed documents that show it are synced again.
   */
  referencedBy?: Record<string, (doc: Doc, id: number | string) => boolean>
}

/**
 * Site search (#157): an FTS5 index in SEO_D1 (`src/search`), kept in sync with the listed
 * collections, and `GET /api/search?q=` for the header's palette and `/search`.
 *
 * A document is indexed while it is published, not `noindex` (both as the sitemap reads them,
 * `isListedDoc`) and not excluded by its collection (A/B variants), with its title, meta
 * description and the analyzer's plain text of its blocks (`searchTextFromDoc`).
 *
 * With several locales (#158), once per locale it is published in: the default locale's row as
 * before, and a row per translation, read in that locale (fields it leaves empty fall back to the
 * default locale's) at its prefixed path. A visitor searches their own locale's rows.
 *
 * Saves never wait on or fail because of the index: the hooks re-read the published document
 * and write the index in the background (`waitUntil`), logging failures. Autosaves and other
 * REST draft saves are skipped: they change nothing visitors see. A change to a document they
 * show (a reusable section, `referencedBy`) syncs the indexed documents that show it.
 * `pnpm search:reindex` rebuilds the index from every document; `POST /api/search/reindex`
 * (signed-in users) does the same one batch per request.
 */
export const siteSearch =
  (options: SiteSearchOptions): Plugin =>
  (config) => ({
    ...config,
    collections: (config.collections ?? []).map((collection) =>
      options.collections[collection.slug]
        ? withSearchHooks(collection, options)
        : options.referencedBy?.[collection.slug]
          ? withReferenceHooks(collection, options)
          : collection,
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

/**
 * The index row for a document as read (in `locale`, the default locale's by default), or null
 * when it must not be searchable.
 */
export function searchEntryFor(
  payload: Payload,
  collection: string,
  doc: Doc | null | undefined,
  options: SearchCollectionOptions,
  locale: Locale = defaultLocale,
): SearchEntry | null {
  if (!doc || !isListedDoc(doc) || options.exclude?.(doc)) return null
  const path = options.path(doc)
  if (!path) return null
  const text = searchTextFromDoc(doc, collection, { extractors: payload })
  const id = doc.id as number | string
  if (locale === defaultLocale) return { collection, id, path, ...text }
  return {
    collection,
    id,
    locale: indexLocale(locale, defaultLocale),
    path: localizePath(path, locale),
    ...text,
  }
}

/**
 * A document's rows in the locales other than the default (#158): one per locale it is published
 * in (`translatedLocales`), read in it; the others' rows go. Nothing with one locale.
 */
async function syncTranslations(
  payload: Payload,
  collection: string,
  id: number | string,
  options: SearchCollectionOptions,
): Promise<void> {
  if (!isMultilingual) return
  const { index } = optionsOf(payload)
  const live = await translatedLocales(payload, collection as 'pages', id)
  for (const locale of locales) {
    if (locale === defaultLocale) continue
    const key = indexLocale(locale, defaultLocale)
    const doc = live.includes(locale)
      ? await payload.findByID({
          collection: collection as never,
          id,
          depth: 1,
          draft: false,
          overrideAccess: true,
          disableErrors: true,
          ...readLocale(locale),
        })
      : null
    const entry = searchEntryFor(payload, collection, doc as Doc | null, options, locale)
    if (entry) await index.upsert(entry)
    else await index.remove(collection, id, key)
  }
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
  // After the default locale's: removing that row removes the document's every row.
  await syncTranslations(payload, collection, id, collections[collection]!)
}

export type ReindexResult = Record<string, { indexed: number; removed: number }>

/** Where a backfill stands: the next batch to run. */
export type ReindexCursor = { collection: string; page: number }

export type ReindexStep = ReindexCursor & {
  indexed: number
  removed: number
  /** The batch to run next, or null when the backfill is done. */
  next: ReindexCursor | null
}

const REINDEX_BATCH = 50

/**
 * One batch of the backfill: indexes the listed documents of one page of a collection and
 * removes the rows of its unlisted ones. After a collection's last page it also removes rows of
 * documents that no longer exist. Small enough for one Worker request.
 */
export async function reindexSearchBatch(
  payload: Payload,
  { collection, page }: ReindexCursor,
): Promise<ReindexStep> {
  const { collections, index } = optionsOf(payload)
  const options = collections[collection]
  if (!options) throw new Error(`siteSearch: "${collection}" is not indexed`)
  const rows = new Set(await index.ids(collection))
  const batch = await payload.find({
    collection: collection as never,
    depth: 1,
    draft: false,
    limit: REINDEX_BATCH,
    page,
    sort: 'id',
    overrideAccess: true,
  })
  let indexed = 0
  let removed = 0
  for (const doc of batch.docs as Doc[]) {
    const entry = searchEntryFor(payload, collection, doc, options)
    if (entry) {
      await index.upsert(entry)
      indexed++
    } else if (rows.has(String(doc.id))) {
      await index.remove(collection, doc.id as number | string)
      removed++
    }
    await syncTranslations(payload, collection, doc.id as number | string, options)
  }
  if (!batch.hasNextPage) removed += await removeMissing(payload, collection, [...rows])

  const slugs = Object.keys(collections)
  const following = slugs[slugs.indexOf(collection) + 1]
  const next = batch.hasNextPage
    ? { collection, page: page + 1 }
    : following
      ? { collection: following, page: 1 }
      : null
  return { collection, page, indexed, removed, next }
}

/** Removes the rows among `ids` whose documents no longer exist. */
async function removeMissing(payload: Payload, collection: string, ids: string[]) {
  const { index } = optionsOf(payload)
  let removed = 0
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const found = await payload.find({
      collection: collection as never,
      where: { id: { in: chunk } },
      depth: 0,
      draft: false,
      pagination: false,
      overrideAccess: true,
    })
    const existing = new Set((found.docs as Doc[]).map((doc) => String(doc.id)))
    for (const id of chunk) {
      if (existing.has(id)) continue
      await index.remove(collection, id)
      removed++
    }
  }
  return removed
}

/** Rebuilds the index from every document of the listed collections (the backfill script). */
export async function reindexSearch(payload: Payload): Promise<ReindexResult> {
  const result: ReindexResult = {}
  const first = Object.keys(optionsOf(payload).collections)[0]
  for (let cursor = first ? { collection: first, page: 1 } : null; cursor; ) {
    const step = await reindexSearchBatch(payload, cursor)
    const total = (result[step.collection] ??= { indexed: 0, removed: 0 })
    total.indexed += step.indexed
    total.removed += step.removed
    cursor = step.next
  }
  return result
}

/**
 * Syncs the indexed documents that show document `id` of `source` (a reusable section): reads
 * each indexed collection as stored, a page at a time, and syncs only the documents that
 * reference it.
 */
export async function syncReferencing(
  payload: Payload,
  source: string,
  id: number | string,
): Promise<number> {
  const { collections, referencedBy } = optionsOf(payload)
  const references = referencedBy?.[source]
  if (!references) return 0
  let synced = 0
  for (const collection of Object.keys(collections)) {
    for (let page = 1, hasNextPage = true; hasNextPage; page++) {
      const batch = await payload.find({
        collection: collection as never,
        depth: 0,
        draft: false,
        limit: 100,
        page,
        sort: 'id',
        overrideAccess: true,
      })
      for (const doc of batch.docs as Doc[]) {
        if (!references(doc, id)) continue
        await syncSearchDoc(payload, collection, doc.id as number | string)
        synced++
      }
      hasNextPage = batch.hasNextPage
    }
  }
  return synced
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

function withReferenceHooks(
  collection: CollectionConfig,
  options: SiteSearchOptions,
): CollectionConfig {
  const sync = (req: PayloadRequest, id: number | string) =>
    inBackground(options, req.payload, () => syncReferencing(req.payload, collection.slug, id))
  // A document just created isn't shown anywhere yet.
  const afterChange: CollectionAfterChangeHook = ({ data, doc, operation, req }) => {
    if (operation === 'update' && !isRestDraftSave(req, data)) sync(req, doc.id)
    return doc
  }
  const afterDelete: CollectionAfterDeleteHook = ({ id, req }) => sync(req, id)
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
 * `GET /api/search?q=<query>&limit=<n>&locale=<code>`: the best matches in a locale (the default
 * without, or for an unknown code), `SearchResponse`. Public, rate
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
        locale: indexLocale(requestLocale(params.get('locale')), defaultLocale),
      })
      return json({ query, results } satisfies SearchResponse)
    } catch (error) {
      req.payload.logger.error({ err: error, msg: '[search] query failed' })
      return json({ error: 'Search is unavailable right now.' }, 503)
    }
  },
})

/**
 * `POST /api/search/reindex?collection=<slug>&page=<n>`: one batch of the backfill, for admins
 * (`ReindexStep`). Without parameters it starts at the first page of the first
 * collection; call it again with `next` until `next` is null. One batch per request keeps each
 * within a Worker's limits; `pnpm search:reindex` runs the whole backfill at once.
 */
const reindexEndpoint: Endpoint = {
  path: '/search/reindex',
  method: 'post',
  handler: async (req: PayloadRequest) => {
    if (!req.user) return json({ error: 'Unauthorized' }, 401)
    if (!hasRole(req.user, 'admin')) return json({ error: 'Admins only.' }, 403)
    const params = req.searchParams ?? new URL(req.url ?? '', 'http://localhost').searchParams
    const { collections } = optionsOf(req.payload)
    const collection = params.get('collection') ?? Object.keys(collections)[0]
    const page = Number(params.get('page') ?? 1)
    if (!collection || !collections[collection] || !Number.isInteger(page) || page < 1) {
      return json({ error: 'Unknown collection or page.' }, 400)
    }
    return json(await reindexSearchBatch(req.payload, { collection, page }))
  },
}
