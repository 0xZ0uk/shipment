/** Longest query read; the rest is ignored. */
export const MAX_QUERY_LENGTH = 200

/** Terms per query; more add nothing a visitor would notice and cost FTS work. */
const MAX_TERMS = 8

/**
 * A visitor's query as an FTS5 `MATCH` expression that can never be a syntax error: every run
 * of letters, digits and combining marks becomes a quoted prefix term (`"pric"*`), and the
 * terms are ANDed. Everything else (quotes, `*`, `-`, `:`, `^`, parentheses, `NEAR`, `OR`…) is
 * either dropped as punctuation or, inside quotes, matched as a plain word. `null` when nothing
 * searchable is left.
 */
export function toMatchQuery(query: string): string | null {
  const terms = query
    .slice(0, MAX_QUERY_LENGTH)
    .normalize('NFKC')
    .match(/[\p{L}\p{N}\p{M}]+/gu)
  if (!terms) return null
  const unique = [...new Set(terms.map((term) => term.toLowerCase()))].slice(0, MAX_TERMS)
  return unique.map((term) => `"${term}"*`).join(' ')
}
