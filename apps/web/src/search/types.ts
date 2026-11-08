// Client-safe: the shapes `GET /api/search` answers with, shared by the palette and `/search`.

/** A piece of a result's excerpt; `match` marks the words that matched the query. */
export type SnippetPart = { text: string; match?: true }

export type SearchResult = {
  collection: string
  id: string
  /** Where the document is served, e.g. `/pricing`. */
  path: string
  title: string
  description: string
  /** An excerpt of the body around the matches; empty when the body has none. */
  snippet: SnippetPart[]
}

export type SearchResponse = { query: string; results: SearchResult[] }

/** Results per query when the caller doesn't ask, and at most. */
export const DEFAULT_SEARCH_LIMIT = 8
export const MAX_SEARCH_LIMIT = 20

/** Queries shorter than this (trimmed) aren't sent: one letter matches nearly everything. */
export const MIN_QUERY_LENGTH = 2
