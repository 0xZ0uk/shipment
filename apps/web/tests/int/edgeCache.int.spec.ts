import { describe, expect, it, vi } from 'vitest'

import {
  createEdgeCachePurger,
  MAX_TAGS_PER_PURGE,
  type EdgeCacheContext,
} from '@/utilities/edgeCache'

function setup(purgeImpl?: EdgeCacheContext['purge']) {
  const purge = vi.fn<EdgeCacheContext['purge']>(
    purgeImpl ?? (async () => ({ success: true, errors: [] })),
  )
  const pending: Promise<unknown>[] = []
  const waitUntil = vi.fn((p: Promise<unknown>) => void pending.push(p))
  const logger = { error: vi.fn(), warn: vi.fn() }
  const purger = createEdgeCachePurger({ cache: () => ({ purge }), debounceMs: 5, waitUntil })
  const settle = () => Promise.all(pending)
  return { logger, purge, purger, settle, waitUntil }
}

describe('createEdgeCachePurger', () => {
  it('does nothing where there is no Workers Cache (Node, vitest)', () => {
    const waitUntil = vi.fn()
    const purger = createEdgeCachePurger({ cache: () => undefined, waitUntil })
    expect(purger.available).toBe(false)
    purger.purge(['layout'])
    expect(waitUntil).not.toHaveBeenCalled()
  })

  it('purges the tags of one request once, deduplicated, in waitUntil', async () => {
    const { purge, purger, settle, waitUntil } = setup()
    const req = {}
    purger.purge(['page:/a'], { scope: req })
    await new Promise((r) => setTimeout(r, 1))
    purger.purge(['page:/b', 'page:/a'], { scope: req })
    expect(purge).not.toHaveBeenCalled()
    await settle()
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(purge).toHaveBeenCalledTimes(1)
    expect(purge.mock.calls[0]![0].tags!.sort()).toEqual(['page:/a', 'page:/b'])
  })

  it('keeps requests apart, and purges unscoped tags on their own', async () => {
    const { purge, purger, settle } = setup()
    purger.purge(['page:/a'], { scope: {} })
    purger.purge(['page:/b'], { scope: {} })
    purger.purge(['page:/c'])
    await settle()
    expect(purge).toHaveBeenCalledTimes(3)
  })

  it('folds a batch into `layout`, which every page carries', async () => {
    const { purge, purger, settle } = setup()
    const req = {}
    purger.purge(['page:/a', 'layout'], { scope: req })
    await settle()
    expect(purge).toHaveBeenLastCalledWith({ tags: ['layout'] })

    const bulk = {}
    const many = Array.from({ length: MAX_TAGS_PER_PURGE + 1 }, (_, i) => `page:/p${i}`)
    purger.purge(many, { scope: bulk })
    await settle()
    expect(purge).toHaveBeenLastCalledWith({ tags: ['layout'] })
  })

  it('logs, never throws, when a purge fails', async () => {
    const rejected = setup(async () => {
      throw new Error('cache not enabled')
    })
    expect(() => rejected.purger.purge(['layout'], { logger: rejected.logger })).not.toThrow()
    await rejected.settle()
    expect(rejected.logger.error).toHaveBeenCalledTimes(1)

    const refused = setup(async () => ({ success: false, errors: [{ code: 1, message: 'limit' }] }))
    refused.purger.purge(['layout'], { logger: refused.logger })
    await refused.settle()
    expect(refused.logger.warn).toHaveBeenCalledTimes(1)
  })
})
