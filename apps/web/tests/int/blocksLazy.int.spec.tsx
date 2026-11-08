import React from 'react'
import { renderToPipeableStream, renderToStaticMarkup } from 'react-dom/server'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

import {
  getLoadedBlock,
  preloadBlocks,
  reloadForStaleChunk,
  type LayoutBlock,
} from '@/blocks/components'
import { RenderBlocks } from '@/blocks/RenderBlocks'

// A separate file from `blocks.int.spec.tsx`: that one preloads every block, and this one needs
// a block that nothing has loaded yet (each spec file has its own module registry).
const block = (blockType: string) =>
  ({ blockType, id: blockType, section: { background: 'default', spacing: 'md' } }) as LayoutBlock

/** Renders to HTML the way the server does, waiting for every Suspense boundary. */
const renderStreamed = (element: React.ReactElement) =>
  new Promise<string>((resolve, reject) => {
    const stream = new PassThrough()
    let html = ''
    stream.on('data', (chunk: Buffer) => (html += chunk.toString()))
    stream.on('end', () => resolve(html))
    const { pipe } = renderToPipeableStream(element, {
      onAllReady: () => pipe(stream),
      onError: reject,
    })
  })

describe('block loading on demand', () => {
  it('loads the chunk of a block nothing preloaded, when it first renders', async () => {
    expect(getLoadedBlock('richText')).toBeUndefined()

    const html = await renderStreamed(<RenderBlocks blocks={[block('richText')]} />)

    expect(html).toContain('data-block="richText"')
    expect(getLoadedBlock('richText')).toBeTypeOf('function')
  })

  it('renders a preloaded block in one synchronous pass, with no Suspense fallback', async () => {
    await preloadBlocks([block('stats')])

    // `renderToStaticMarkup` cannot wait: a block that suspended would be missing.
    const html = renderToStaticMarkup(<RenderBlocks blocks={[block('stats')]} />)

    expect(html).toContain('data-block="stats"')
  })
})

describe('reloadForStaleChunk', () => {
  const memoryStorage = () => {
    const items = new Map<string, string>()
    return {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
    }
  }

  it('reloads once for a failed chunk, then lets the next failure within a minute through', () => {
    const storage = memoryStorage()
    const reload = vi.fn()

    expect(reloadForStaleChunk(storage, reload, 1_000)).toBe(true)
    expect(reloadForStaleChunk(storage, reload, 30_000)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads again after a minute (a later deploy)', () => {
    const storage = memoryStorage()
    const reload = vi.fn()

    reloadForStaleChunk(storage, reload, 1_000)
    expect(reloadForStaleChunk(storage, reload, 62_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload when storage is unavailable', () => {
    const reload = vi.fn()
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }

    expect(reloadForStaleChunk(blocked, reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
