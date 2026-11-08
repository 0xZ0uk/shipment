import type { CollectionConfig, Config, GlobalConfig, PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { edgeCachePurge, pageChangeTags, postChangeTags } from '@/plugins/edgeCachePurge'
import type { EdgeCachePurger } from '@/utilities/edgeCache'

/** A purger that records what it was asked to purge, per call (empty calls are no-ops, as in the real one). */
function fakePurger(available = true) {
  const calls: string[][] = []
  const purger: EdgeCachePurger = {
    available,
    purge: (tags) => {
      const list = [...tags]
      if (available && list.length) calls.push(list.sort())
    },
  }
  return { calls, purger }
}

type AnyHook = (args: Record<string, unknown>) => unknown

function hooksOf(purger: EdgeCachePurger) {
  const config = edgeCachePurge(purger)({
    collections: [
      'pages',
      'posts',
      'authors',
      'categories',
      'media',
      'sections',
      'seo-redirects',
      'ab-manifest',
      'users',
    ].map((slug) => ({ slug, fields: [] }) as CollectionConfig),
    globals: ['header', 'footer'].map((slug) => ({ slug, fields: [] }) as GlobalConfig),
  } as Config) as Config
  const collection = (slug: string) => {
    const hooks = config.collections!.find((c) => c.slug === slug)!.hooks ?? {}
    return {
      afterChange: (hooks.afterChange ?? []) as unknown as AnyHook[],
      afterDelete: (hooks.afterDelete ?? []) as unknown as AnyHook[],
      beforeChange: (hooks.beforeChange ?? []) as unknown as AnyHook[],
    }
  }
  const global = (slug: string) =>
    (config.globals!.find((g) => g.slug === slug)!.hooks?.afterChange ?? []) as unknown as AnyHook[]
  return { collection, global }
}

/** A Payload request whose database holds `published` as the stored (published) page. */
function fakeReq(published: Record<string, unknown> | null, query: Record<string, unknown> = {}) {
  const findOne = vi.fn(async () => published)
  const req = {
    context: {},
    payload: { db: { findOne }, logger: { error: vi.fn(), warn: vi.fn() } },
    query,
  } as unknown as PayloadRequest
  return { findOne, req }
}

const run = async (hooks: AnyHook[], args: Record<string, unknown>) => {
  for (const hook of hooks) await hook(args)
}

/** Runs a Pages (or Posts) update through beforeChange and afterChange, as Payload does. */
async function updatePage(
  purger: EdgeCachePurger,
  {
    collection = 'pages',
    before,
    after,
    data,
    query,
    doc,
  }: {
    collection?: string
    before: Record<string, unknown> | null
    after?: Record<string, unknown> | null
    data: Record<string, unknown>
    query?: Record<string, unknown>
    doc: Record<string, unknown>
  },
) {
  const pages = hooksOf(purger).collection(collection)
  const { findOne, req } = fakeReq(before, query)
  await run(pages.beforeChange, { data, operation: 'update', originalDoc: { id: 1 }, req })
  // What the database holds once the write is done.
  findOne.mockImplementation(async () => after ?? null)
  await run(pages.afterChange, { data, doc: { id: 1, ...doc }, operation: 'update', req })
  return { findOne }
}

const live = (slug: string, title = 'Title') => ({ _status: 'published', slug, title })
const draft = (slug: string, title = 'Title') => ({ _status: 'draft', slug, title })

let calls: string[][]
let purger: EdgeCachePurger
beforeEach(() => {
  ;({ calls, purger } = fakePurger())
})

describe('pageChangeTags', () => {
  const state = (live: boolean, slug: string | null, title = 'T') => ({ live, slug, title })

  it('purges nothing for a page nobody can see, before or after', () => {
    expect(pageChangeTags(state(false, 'a'), state(false, 'b'))).toEqual([])
  })

  it('purges the page alone when only its content changed', () => {
    expect(pageChangeTags(state(true, 'about'), state(true, 'about'))).toEqual(['page:/about'])
    expect(pageChangeTags(state(true, 'home'), state(true, 'home'))).toEqual(['page:/'])
  })

  it('purges the layout when the page appears, disappears, moves or is renamed', () => {
    expect(pageChangeTags(state(false, 'a'), state(true, 'a')).sort()).toEqual([
      'layout',
      'page:/a',
    ])
    expect(pageChangeTags(state(true, 'a'), state(false, 'a')).sort()).toEqual([
      'layout',
      'page:/a',
    ])
    expect(pageChangeTags(state(true, 'a'), state(true, 'b')).sort()).toEqual([
      'layout',
      'page:/a',
      'page:/b',
    ])
    expect(pageChangeTags(state(true, 'a', 'Old'), state(true, 'a', 'New')).sort()).toEqual([
      'layout',
      'page:/a',
    ])
  })
})

describe('Pages purge hooks', () => {
  it('purges nothing, and reads nothing, for a REST draft save (autosave, on-page editing)', async () => {
    const { findOne } = await updatePage(purger, {
      before: live('about'),
      data: { _status: 'draft', title: 'Typing' },
      doc: draft('about', 'Typing'),
      query: { autosave: 'true', draft: 'true' },
    })
    expect(findOne).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('purges the page on publish, and the layout when the published title changes', async () => {
    await updatePage(purger, {
      before: live('about'),
      data: { _status: 'published' },
      doc: live('about'),
    })
    expect(calls).toEqual([['page:/about']])

    calls.length = 0
    // The draft already had the new title: the comparison is with the published document.
    await updatePage(purger, {
      before: live('about', 'Old'),
      data: { _status: 'published' },
      doc: live('about', 'New'),
    })
    expect(calls).toEqual([['layout', 'page:/about']])
  })

  it('purges the old and the new path when a published slug changes', async () => {
    await updatePage(purger, {
      before: live('about'),
      data: { _status: 'published' },
      doc: live('company'),
    })
    expect(calls).toEqual([['layout', 'page:/about', 'page:/company']])
  })

  it('purges page and layout on unpublish, and nothing for a local-API draft save', async () => {
    await updatePage(purger, {
      after: draft('about'),
      before: live('about'),
      data: { _status: 'draft' },
      doc: draft('about'),
    })
    expect(calls).toEqual([['layout', 'page:/about']])

    calls.length = 0
    // `payload.update({ draft: true })` (MCP, the assistant): the published page is untouched.
    await updatePage(purger, {
      after: live('about'),
      before: live('about'),
      data: { _status: 'draft', title: 'Draft title' },
      doc: draft('about', 'Draft title'),
    })
    expect(calls).toEqual([])
  })

  it('purges a published page on create and on delete, never a draft', async () => {
    const pages = hooksOf(purger).collection('pages')
    const { req } = fakeReq(null)
    await run(pages.afterChange, {
      data: {},
      doc: { id: 2, ...draft('new') },
      operation: 'create',
      req,
    })
    await run(pages.afterDelete, { doc: { id: 2, ...draft('new') }, req })
    expect(calls).toEqual([])

    await run(pages.afterChange, {
      data: {},
      doc: { id: 3, ...live('home') },
      operation: 'create',
      req,
    })
    await run(pages.afterDelete, { doc: { id: 4, ...live('old') }, req })
    expect(calls).toEqual([
      ['layout', 'page:/'],
      ['layout', 'page:/old'],
    ])
  })

  it('skips the read and the purge where there is no Workers Cache', async () => {
    const off = fakePurger(false)
    const { findOne } = await updatePage(off.purger, {
      before: live('about'),
      data: { _status: 'published' },
      doc: live('about'),
    })
    expect(findOne).not.toHaveBeenCalled()
    expect(off.calls).toEqual([])
  })
})

describe('postChangeTags', () => {
  const state = (live: boolean, slug: string | null) => ({ live, slug, title: 'T' })

  it('purges nothing for a post nobody can see, before or after', () => {
    expect(postChangeTags(state(false, 'a'), state(false, 'b'))).toEqual([])
  })

  it('purges the post and every list of posts, never the layout', () => {
    expect(postChangeTags(state(true, 'a'), state(true, 'a')).sort()).toEqual([
      'page:/blog/a',
      'posts',
    ])
    expect(postChangeTags(state(false, 'a'), state(true, 'a')).sort()).toEqual([
      'page:/blog/a',
      'posts',
    ])
    expect(postChangeTags(state(true, 'a'), state(true, 'b')).sort()).toEqual([
      'page:/blog/a',
      'page:/blog/b',
      'posts',
    ])
  })
})

describe('Posts purge hooks', () => {
  it('purges nothing for a REST draft save', async () => {
    const { findOne } = await updatePage(purger, {
      before: live('hello'),
      collection: 'posts',
      data: { _status: 'draft', title: 'Typing' },
      doc: draft('hello', 'Typing'),
      query: { autosave: 'true', draft: 'true' },
    })
    expect(findOne).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })

  it('reads the published post and purges its path and `posts` on publish and unpublish', async () => {
    const { findOne } = await updatePage(purger, {
      before: live('hello'),
      collection: 'posts',
      data: { _status: 'published' },
      doc: live('hello-world'),
    })
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ collection: 'posts' }))
    expect(calls).toEqual([['page:/blog/hello', 'page:/blog/hello-world', 'posts']])

    calls.length = 0
    await updatePage(purger, {
      after: draft('hello'),
      before: live('hello'),
      collection: 'posts',
      data: { _status: 'draft' },
      doc: draft('hello'),
    })
    expect(calls).toEqual([['page:/blog/hello', 'posts']])
  })

  it('purges a published post on create and on delete, never a draft', async () => {
    const posts = hooksOf(purger).collection('posts')
    const { req } = fakeReq(null)
    await run(posts.afterChange, { data: {}, doc: { id: 2, ...draft('d') }, operation: 'create', req })
    await run(posts.afterDelete, { doc: { id: 2, ...draft('d') }, req })
    expect(calls).toEqual([])
    await run(posts.afterChange, { data: {}, doc: { id: 3, ...live('n') }, operation: 'create', req })
    await run(posts.afterDelete, { doc: { id: 4, ...live('o') }, req })
    expect(calls).toEqual([
      ['page:/blog/n', 'posts'],
      ['page:/blog/o', 'posts'],
    ])
  })

  it('purges `posts` and the author or category tag when one changes or goes', async () => {
    const { req } = fakeReq(null)
    for (const [slug, tag] of [
      ['authors', 'author:5'],
      ['categories', 'category:5'],
    ] as const) {
      calls.length = 0
      const hooks = hooksOf(purger).collection(slug)
      await run(hooks.afterChange, { doc: { id: 5 }, operation: 'create', req })
      expect(calls).toEqual([])
      await run(hooks.afterChange, { doc: { id: 5 }, operation: 'update', req })
      await run(hooks.afterDelete, { doc: { id: 5 }, req })
      expect(calls).toEqual([
        [tag, 'posts'],
        [tag, 'posts'],
      ])
    }
  })
})

describe('other purge hooks', () => {
  it('purges the layout when the header or footer changes', async () => {
    const { global } = hooksOf(purger)
    const { req } = fakeReq(null)
    await run(global('header'), { doc: {}, req })
    await run(global('footer'), { doc: {}, req })
    expect(calls).toEqual([['layout'], ['layout']])
  })

  it('purges the layout when a file changes or goes, not when one is uploaded', async () => {
    const media = hooksOf(purger).collection('media')
    const { req } = fakeReq(null)
    await run(media.afterChange, { doc: { id: 1 }, operation: 'create', req })
    expect(calls).toEqual([])
    await run(media.afterChange, { doc: { id: 1 }, operation: 'update', req })
    await run(media.afterDelete, { doc: { id: 1 }, req })
    expect(calls).toEqual([['layout'], ['layout']])
  })

  it('purges the layout when a reusable section changes or goes, not when one is created', async () => {
    const sections = hooksOf(purger).collection('sections')
    const { req } = fakeReq(null)
    await run(sections.afterChange, { doc: { id: 1 }, operation: 'create', req })
    expect(calls).toEqual([])
    await run(sections.afterChange, { doc: { id: 1 }, operation: 'update', req })
    await run(sections.afterDelete, { doc: { id: 1 }, req })
    expect(calls).toEqual([['layout'], ['layout']])
  })

  it('purges the paths a redirect touches', async () => {
    const redirects = hooksOf(purger).collection('seo-redirects')
    const { req } = fakeReq(null)
    await run(redirects.afterChange, {
      doc: { from: '/New-Path/' },
      previousDoc: { from: '/old-path' },
      req,
    })
    await run(redirects.afterDelete, { doc: { from: '/gone' }, req })
    expect(calls).toEqual([['page:/new-path', 'page:/old-path'], ['page:/gone']])
  })

  it('purges the page whose A/B manifest changed', async () => {
    const manifest = hooksOf(purger).collection('ab-manifest')
    const { req } = fakeReq(null)
    await run(manifest.afterChange, { doc: { key: '/pricing' }, previousDoc: null, req })
    await run(manifest.afterDelete, { doc: { key: '/' }, req })
    expect(calls).toEqual([['page:/pricing'], ['page:/']])
  })

  it('leaves other collections alone', () => {
    const users = hooksOf(purger).collection('users')
    expect(users.afterChange).toEqual([])
    expect(users.afterDelete).toEqual([])
  })
})
