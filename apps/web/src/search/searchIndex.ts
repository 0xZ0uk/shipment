import { toMatchQuery } from './matchQuery'
import { migrateSearchIndex } from './schema'
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  type SearchResult,
  type SnippetPart,
} from './types'

/** One document (in one locale) as the index stores it. */
export type SearchEntry = {
  collection: string
  id: number | string
  /** `''` for the default locale, else the locale's code (`indexLocale`, see `schema.ts`). */
  locale?: string
  path: string
  title: string
  description: string
  body: string
}

export type SearchOptions = { limit?: number; locale?: string }

export interface SearchIndex {
  /** Replaces the document's row (or adds it). */
  upsert(entry: SearchEntry): Promise<void>
  /** Removes the document's rows: in every locale, or in `locale` only (an `indexLocale`). */
  remove(collection: string, id: number | string, locale?: string): Promise<void>
  /** The ids of a collection's indexed documents (the backfill drops those no longer listed). */
  ids(collection: string): Promise<string[]>
  /** Best matches first; `[]` for a query with nothing searchable in it. */
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>
}

/** Body text kept per document. Longer pages are cut: their first 20k characters still match. */
const MAX_BODY_LENGTH = 20_000

// Private-use characters around the matches in `snippet()`, split into parts below. Copy
// that contains them (unlikely) only marks the wrong words; nothing is ever rendered as HTML.
const MARK_START = ''
const MARK_END = ''

/** Column weights for `bm25()`: a title match outranks a description match, then the body. */
const BM25_WEIGHTS = '10.0, 4.0, 1.0'

export function snippetParts(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = []
  for (const [i, piece] of snippet.split(MARK_START).entries()) {
    const [match, rest] = i === 0 ? [undefined, piece] : piece.split(MARK_END)
    if (match) parts.push({ text: match, match: true })
    if (rest) parts.push({ text: rest })
  }
  return parts
}

/**
 * A locale's value in the `locale` column: `''` for the default locale, so rows written while the
 * site had one locale stay valid when a second is added (no reindex); the code for any other.
 */
export const indexLocale = (locale: string, defaultLocale: string): string =>
  locale === defaultLocale ? '' : locale

const clampLimit = (limit: number | undefined) =>
  Math.min(
    Math.max(1, Math.trunc(limit ?? DEFAULT_SEARCH_LIMIT) || DEFAULT_SEARCH_LIMIT),
    MAX_SEARCH_LIMIT,
  )

/**
 * The FTS5 index in `db` (SEO_D1). Applies its migrations on first use in each isolate, like
 * the SEO store; `pnpm seo-store:migrate` applies them ahead of time.
 */
export function createSearchIndex(db: D1Database): SearchIndex {
  let ready: Promise<unknown> | undefined
  const migrated = () =>
    (ready ??= migrateSearchIndex(db).catch((error) => {
      ready = undefined // retry on the next call
      throw error
    }))

  return {
    async upsert(entry) {
      await migrated()
      // One batch, one transaction: concurrent saves of a document leave exactly one row.
      await db.batch([
        db
          .prepare('DELETE FROM search_index WHERE collection = ? AND doc_id = ? AND locale = ?')
          .bind(entry.collection, String(entry.id), entry.locale ?? ''),
        db
          .prepare(
            `INSERT INTO search_index (title, description, body, collection, doc_id, locale, path)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            entry.title,
            entry.description,
            entry.body.slice(0, MAX_BODY_LENGTH),
            entry.collection,
            String(entry.id),
            entry.locale ?? '',
            entry.path,
          ),
      ])
    },

    async remove(collection, id, locale) {
      await migrated()
      await (
        locale === undefined
          ? db
              .prepare('DELETE FROM search_index WHERE collection = ? AND doc_id = ?')
              .bind(collection, String(id))
          : db
              .prepare(
                'DELETE FROM search_index WHERE collection = ? AND doc_id = ? AND locale = ?',
              )
              .bind(collection, String(id), locale)
      ).run()
    },

    async ids(collection) {
      await migrated()
      const { results } = await db
        .prepare('SELECT DISTINCT doc_id FROM search_index WHERE collection = ?')
        .bind(collection)
        .all<{ doc_id: string }>()
      return results.map((row) => row.doc_id)
    },

    async search(query, options = {}) {
      const match = toMatchQuery(query)
      if (!match) return []
      await migrated()
      const { results } = await db
        .prepare(
          `SELECT collection, doc_id, path, title, description,
             snippet(search_index, 2, ?, ?, '…', 16) AS snippet
           FROM search_index
           WHERE search_index MATCH ? AND locale = ?
           ORDER BY bm25(search_index, ${BM25_WEIGHTS})
           LIMIT ?`,
        )
        .bind(MARK_START, MARK_END, match, options.locale ?? '', clampLimit(options.limit))
        .all<{
          collection: string
          doc_id: string
          path: string
          title: string
          description: string
          snippet: string | null
        }>()
      return results.map((row) => ({
        collection: row.collection,
        id: row.doc_id,
        path: row.path,
        title: row.title,
        description: row.description,
        snippet: snippetParts(row.snippet ?? ''),
      }))
    },
  }
}
