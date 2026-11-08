/** Rate-limit key: the client IP, which Cloudflare's edge sets and clients can't forge. */
const clientKey = (headers: Headers) => headers.get('cf-connecting-ip')?.trim() || 'unknown'

/**
 * Site search queries (`GET /api/search`, `/search`), per client IP, through the
 * `SEARCH_RATE_LIMIT` binding (wrangler.jsonc), shared by every isolate in a location. The
 * palette sends a query per typing pause, so the limit only stops scripts. Without the binding
 * (Node dev server, tests), everything passes.
 */
export function searchRateLimit(
  binding: RateLimit | undefined,
): (headers: Headers) => Promise<boolean> {
  return async (headers) => {
    if (!binding) return true
    const { success } = await binding.limit({ key: `search:${clientKey(headers)}` })
    return success
  }
}
