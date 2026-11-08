import { LAYOUT_TAG } from './cacheControl'

/** The part of `cloudflare:workers`' `cache` this module uses. */
export type EdgeCacheContext = {
  purge(options: { tags?: string[] }): Promise<{
    success: boolean
    errors: { code: number; message: string }[]
  }>
}

type Logger = {
  error: (obj: object, msg?: string) => void
  warn: (obj: object, msg?: string) => void
}

export type EdgeCachePurgerOptions = {
  /** Workers Cache, or undefined where there is none (Node dev server, vitest, CLI). */
  cache: () => EdgeCacheContext | undefined
  /** Keeps the purge alive after the response (`#cloudflare-runtime`); undefined under Node. */
  waitUntil?: (promise: Promise<unknown>) => void
  /** Quiet time after the last tag of a batch before it's purged. */
  debounceMs?: number
  /** Longest a batch waits, however busy the request keeps it. */
  maxWaitMs?: number
}

export type PurgeOptions = {
  /**
   * Batches tags per object (the Payload `req`): a bulk edit through the REST API, MCP, the
   * assistant or the seed endpoint touches many documents in one request, and their tags go out
   * in one purge. Without it, the tags get a batch of their own.
   */
  scope?: object
  logger?: Logger
}

export type EdgeCachePurger = {
  /** False where there is no Workers Cache: `purge` does nothing, and callers can skip work. */
  readonly available: boolean
  /** Queues `tags` for a purge; never throws, never waits. */
  purge(tags: Iterable<string>, options?: PurgeOptions): void
}

/**
 * A batch with more page tags than this purges `layout` instead, which every page view carries:
 * one purge call, whatever the size of the edit (purge limits are always the Free-plan ones).
 */
export const MAX_TAGS_PER_PURGE = 30

type Batch = {
  tags: Set<string>
  logger: Logger
  startedAt: number
  timer?: ReturnType<typeof setTimeout>
  resolve: () => void
}

/**
 * Purges Workers Cache by tag from inside the Worker (`cache.purge`, no API token). Tags are
 * collected per request and purged once, in `waitUntil`, after the request stops adding them.
 * A failed purge is logged, never thrown: the write that caused it has already succeeded, and
 * the edge TTL (`PUBLIC_PAGE_CDN_CACHE_CONTROL`) bounds how long the old page can show.
 *
 * Purges only clear the cache of the entrypoint that issues them. Every write that changes page
 * HTML runs in this Worker's default entrypoint, the one whose `fetch` serves pages: the admin,
 * REST and MCP requests; the assistant's tool calls, which reach `fetch` through the
 * `ASSISTANT_SELF` service binding (no `entrypoint`, so the default one; its Durable Object only
 * calls that binding, it writes no content itself); and the Cron Trigger's jobs, which run in
 * the default export's `scheduled` handler.
 */
export function createEdgeCachePurger({
  cache,
  waitUntil,
  debounceMs = 50,
  maxWaitMs = 5000,
}: EdgeCachePurgerOptions): EdgeCachePurger {
  const batches = new WeakMap<object, Batch>()

  const flush = async (batch: Batch) => {
    const context = cache()
    if (!context || batch.tags.size === 0) return
    const tags =
      batch.tags.size > MAX_TAGS_PER_PURGE || batch.tags.has(LAYOUT_TAG)
        ? // `layout` is on every page view, so it covers every other tag in the batch.
          [LAYOUT_TAG]
        : [...batch.tags]
    try {
      const result = await context.purge({ tags })
      if (!result.success) {
        batch.logger.warn({ errors: result.errors, tags }, 'Workers Cache purge failed')
      }
    } catch (error) {
      batch.logger.error({ err: error, tags }, 'Workers Cache purge failed')
    }
  }

  const schedule = (batch: Batch) => {
    if (batch.timer) clearTimeout(batch.timer)
    const wait = Math.min(debounceMs, Math.max(0, batch.startedAt + maxWaitMs - Date.now()))
    batch.timer = setTimeout(batch.resolve, wait)
  }

  return {
    get available() {
      try {
        return cache() !== undefined
      } catch {
        return false
      }
    },
    purge(tags, { scope, logger = console } = {}) {
      try {
        if (!cache()) return
        const list = [...tags].filter(Boolean)
        if (list.length === 0) return

        const existing = scope ? batches.get(scope) : undefined
        if (existing) {
          for (const tag of list) existing.tags.add(tag)
          schedule(existing)
          return
        }

        let resolve!: () => void
        const ready = new Promise<void>((r) => (resolve = r))
        const batch: Batch = { tags: new Set(list), logger, startedAt: Date.now(), resolve }
        if (scope) batches.set(scope, batch)
        const done = ready.then(() => {
          if (scope) batches.delete(scope)
          return flush(batch)
        })
        // Workers cancel work the response doesn't wait for; Node keeps it running on its own.
        waitUntil?.(done)
        schedule(batch)
      } catch (error) {
        logger.error({ err: error }, 'Workers Cache purge failed')
      }
    },
  }
}
