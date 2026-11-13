/**
 * The seed endpoint (`POST /api/seed/home`, src/endpoints/seed): signed-in users only, creates
 * and publishes the landing page, and never replaces an existing page unless asked to.
 *
 * Runs `seedPage` with the homepage's content under a throwaway slug, so the local D1's real
 * homepage is untouched. Not a spec file of its own: `api.int.spec.ts` runs it with its Payload
 * instance (two Payload instances on the local D1 fail with `SQLITE_BUSY`).
 */
import { createPayloadRequest, type Payload, type PayloadRequest } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { seedHomeEndpoint, seedNavigation, seedPage } from '@/endpoints/seed'
import { homePage, navigation } from '@/endpoints/seed/home'

const stamp = Date.now()
const slug = `seed-test-${stamp}`

export const seedHome = (getPayload: () => Payload) =>
  describe('seed endpoint', () => {
    let payload: Payload
    let req: PayloadRequest
    let userId: number
    let pageId: number | undefined

    beforeAll(async () => {
      payload = getPayload()
      const user = await payload.create({
        collection: 'users',
        data: { email: `seed-${stamp}@example.com`, password: 'seed-test-password', role: 'admin' },
        overrideAccess: true,
      })
      userId = user.id
      req = await createPayloadRequest({
        payload,
        user: { ...user, collection: 'users' } as never,
        req: {} as never,
      })
    })

    afterAll(async () => {
      if (pageId) await payload.delete({ collection: 'pages', id: pageId, overrideAccess: true }).catch(() => undefined)
      await payload.delete({ collection: 'users', id: userId, overrideAccess: true }).catch(() => undefined)
    })

    it('refuses anonymous requests', async () => {
      const anonymous = await createPayloadRequest({ payload, req: {} as never })
      const response = await seedHomeEndpoint.handler(anonymous)
      expect(response.status).toBe(401)
    })

    it('creates and publishes the page, and leaves it alone on a second run', async () => {
      const data = { ...homePage, slug }
      const first = await seedPage(req, data)
      expect(first.status).toBe('created')
      pageId = first.id

      const page = await payload.findByID({ collection: 'pages', id: first.id, depth: 0, overrideAccess: true })
      expect(page._status).toBe('published')
      expect(page.layout.map(({ blockType }) => blockType)).toEqual(homePage.layout.map(({ blockType }) => blockType))

      // An editor changes the page; seeding again keeps their change.
      await payload.update({ collection: 'pages', id: first.id, data: { title: 'Edited' }, overrideAccess: true })
      expect(await seedPage(req, data)).toEqual({ status: 'exists', id: first.id })
      expect((await payload.findByID({ collection: 'pages', id: first.id, overrideAccess: true })).title).toBe('Edited')
    })

    it('replaces the page with overwrite', async () => {
      const result = await seedPage(req, { ...homePage, slug }, { overwrite: true })
      expect(result).toEqual({ status: 'updated', id: pageId })
      expect((await payload.findByID({ collection: 'pages', id: pageId!, overrideAccess: true })).title).toBe(homePage.title)
    })

    it('fills an empty header or footer and leaves links an editor added', async () => {
      const original = {
        header: (await payload.findGlobal({ slug: 'header', depth: 0 })).navItems ?? [],
        footer: (await payload.findGlobal({ slug: 'footer', depth: 0 })).navItems ?? [],
      }
      const strip = (items: typeof original.header) => items.map(({ link }) => ({ link }))
      const editorLinks = [{ link: { type: 'custom' as const, url: '/about', label: 'About' } }]
      try {
        await payload.updateGlobal({ slug: 'header', data: { navItems: [] }, overrideAccess: true })
        await payload.updateGlobal({ slug: 'footer', data: { navItems: editorLinks }, overrideAccess: true })

        expect(await seedNavigation(req)).toEqual(['header'])

        const header = await payload.findGlobal({ slug: 'header', depth: 0 })
        expect(header.navItems?.map(({ link }) => link.url)).toEqual(navigation.header.map(({ link }) => link.url))
        const footer = await payload.findGlobal({ slug: 'footer', depth: 0 })
        expect(footer.navItems?.map(({ link }) => link.label)).toEqual(['About'])
      } finally {
        await payload.updateGlobal({ slug: 'header', data: { navItems: strip(original.header) }, overrideAccess: true })
        await payload.updateGlobal({ slug: 'footer', data: { navItems: strip(original.footer) }, overrideAccess: true })
      }
    })
  })
