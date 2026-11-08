/**
 * Site search sync (#157): the Pages hooks keep the FTS5 index in SEO_D1 in line with what
 * visitors see. Writes happen in the background after the save, so each check polls.
 *
 * Not a spec file of its own: `api.int.spec.ts` runs it with its Payload instance (two Payload
 * instances on the local D1 fail with `SQLITE_BUSY`). Pages get a word no other page has, and
 * are deleted afterwards.
 */
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { paragraph, richText } from '@/blocks/shared/lexical'
import type { Page, Section } from '@/payload-types'
import { referencesSection } from '@/blocks/GlobalSection/references'
import { reindexSearch, reindexSearchBatch } from '@/plugins/siteSearch'
import { siteSearchIndex } from '@/search/siteIndex'

const stamp = Date.now()
// Letters only: the tokenizer would split a word at the digits.
const unique = (n: number) =>
  `zx${[...String(stamp + n)].map((d) => 'abcdefghij'[Number(d)]).join('')}`

const layout = (text: string): Page['layout'] => [
  {
    blockType: 'richText',
    variant: 'narrow',
    richText: richText(paragraph(text)),
    section: { background: 'default', spacing: 'md' },
  },
]

const paths = async (q: string) => (await siteSearchIndex.search(q)).map((r) => r.path)
const eventually = (assertion: () => Promise<void>) =>
  vi.waitFor(assertion, { timeout: 10_000, interval: 100 })

export const siteSearch = (getPayload: () => Payload) =>
  describe('site search sync', () => {
    let payload: Payload
    const ids: number[] = []

    const create = async (n: number, data: Record<string, unknown> = {}) => {
      const word = unique(n)
      const slug = `search-test-${stamp}-${n}`
      const page = await payload.create({
        collection: 'pages',
        data: {
          title: `Search test ${n}`,
          slug,
          layout: layout(`Body copy with ${word}.`),
          _status: 'published',
          ...data,
        },
        overrideAccess: true,
      })
      ids.push(page.id)
      return { id: page.id, word, path: `/${slug}` }
    }

    beforeAll(() => {
      payload = getPayload()
    })

    afterAll(async () => {
      for (const id of ids) {
        await payload
          .delete({ collection: 'pages', id, overrideAccess: true })
          .catch(() => undefined)
      }
    })

    it('indexes a published page with its title, description and block text', async () => {
      const { word, path } = await create(1, {
        meta: { description: 'Opening hours and directions.' },
      })
      await eventually(async () => expect(await paths(word)).toEqual([path]))
      expect(await paths(`search test 1 ${word}`)).toEqual([path])
      expect(await paths(`directions ${word}`)).toEqual([path])
    })

    it('leaves out drafts until they are published', async () => {
      const { id, word, path } = await create(2, { _status: 'draft' })
      await payload.update({
        collection: 'pages',
        id,
        data: { title: 'Changed' },
        overrideAccess: true,
        draft: true,
      })
      // Nothing to wait for: give a background write the chance to (wrongly) happen.
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(await paths(word)).toEqual([])

      await payload.update({
        collection: 'pages',
        id,
        data: { _status: 'published' },
        overrideAccess: true,
      })
      await eventually(async () => expect(await paths(word)).toEqual([path]))
    })

    it('keeps the published page through a draft save, drops it on unpublish', async () => {
      const { id, word, path } = await create(3)
      await eventually(async () => expect(await paths(word)).toEqual([path]))

      const draftWord = unique(30)
      await payload.update({
        collection: 'pages',
        id,
        data: { layout: layout(`Draft copy with ${draftWord}.`), _status: 'draft' },
        draft: true,
        overrideAccess: true,
      })
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(await paths(word)).toEqual([path])
      expect(await paths(draftWord)).toEqual([])

      await payload.update({
        collection: 'pages',
        id,
        data: { _status: 'draft' },
        overrideAccess: true,
      })
      await eventually(async () => expect(await paths(word)).toEqual([]))
    })

    it('drops a page marked noindex', async () => {
      const { id, word, path } = await create(4)
      await eventually(async () => expect(await paths(word)).toEqual([path]))
      await payload.update({
        collection: 'pages',
        id,
        data: { noindex: true },
        overrideAccess: true,
      })
      await eventually(async () => expect(await paths(word)).toEqual([]))
    })

    it('never indexes an A/B variant', async () => {
      const original = await create(5)
      await eventually(async () => expect(await paths(original.word)).toEqual([original.path]))
      const variant = await create(6, { _abVariantOf: original.id })
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(await paths(variant.word)).toEqual([])
    })

    it('drops a deleted page', async () => {
      const { id, word, path } = await create(7)
      await eventually(async () => expect(await paths(word)).toEqual([path]))
      await payload.delete({ collection: 'pages', id, overrideAccess: true })
      await eventually(async () => expect(await paths(word)).toEqual([]))
    })

    it('reindexes every listed page and removes rows of pages that are gone', async () => {
      const { id, word, path } = await create(8)
      await eventually(async () => expect(await paths(word)).toEqual([path]))
      // A row the hooks didn't write, for a page that doesn't exist.
      const stale = unique(80)
      await siteSearchIndex.upsert({
        collection: 'pages',
        id: -stamp,
        path: '/gone',
        title: stale,
        description: '',
        body: '',
      })
      await siteSearchIndex.remove('pages', id)

      const result = await reindexSearch(payload)
      expect(result.pages.removed).toBeGreaterThanOrEqual(1)
      expect(await paths(word)).toEqual([path])
      expect(await paths(stale)).toEqual([])
    })

    it('reindexes one batch per call, ending with next: null', async () => {
      const { id, word, path } = await create(9)
      await eventually(async () => expect(await paths(word)).toEqual([path]))
      await siteSearchIndex.remove('pages', id)

      let cursor: { collection: string; page: number } | null = { collection: 'pages', page: 1 }
      const pages: Record<string, number[]> = {}
      while (cursor) {
        const step = await reindexSearchBatch(payload, cursor)
        ;(pages[step.collection] ??= []).push(step.page)
        cursor = step.next
      }
      // Every indexed collection in turn (pages, then posts), each from its first page on.
      expect(Object.keys(pages)).toEqual(['pages', 'posts'])
      for (const list of Object.values(pages)) expect(list).toEqual(list.map((_, i) => i + 1))
      expect(await paths(word)).toEqual([path])
    })

    it('syncs the pages that show a reusable section when the section changes', async () => {
      const before = unique(100)
      const after = unique(101)
      const section = await payload.create({
        collection: 'sections',
        // A section's blocks are a page's minus the Global section block.
        data: {
          title: `Search test section ${stamp}`,
          layout: layout(`Section copy ${before}.`) as Section['layout'],
        },
        overrideAccess: true,
      })
      try {
        const { path } = await create(10, {
          layout: [{ blockType: 'globalSection', reusableSection: section.id }],
        })
        await eventually(async () => expect(await paths(before)).toEqual([path]))

        await payload.update({
          collection: 'sections',
          id: section.id,
          data: { layout: layout(`Section copy ${after}.`) as Section['layout'] },
          overrideAccess: true,
        })
        await eventually(async () => expect(await paths(after)).toEqual([path]))
        expect(await paths(before)).toEqual([])
      } finally {
        await payload.delete({ collection: 'sections', id: section.id, overrideAccess: true })
      }
    })

    it('finds a reusable section anywhere in a stored page', () => {
      const page = {
        layout: [
          { blockType: 'richText' },
          { blockType: 'columns', columns: [{ blocks: [{ reusableSection: 7 }] }] },
        ],
      }
      expect(referencesSection(page, 7)).toBe(true)
      expect(referencesSection(page, '7')).toBe(true)
      expect(referencesSection({ layout: [{ reusableSection: { id: 3 } }] }, 3)).toBe(true)
      expect(referencesSection(page, 8)).toBe(false)
      expect(referencesSection(null, 7)).toBe(false)
    })
  })
