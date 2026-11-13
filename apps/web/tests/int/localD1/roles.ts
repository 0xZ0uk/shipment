/**
 * Roles (src/access/roles.ts) through the Local API with access enforced: what admins, editors and
 * authors may do, and that authors only touch what they created (Payload's `createdBy`). Run from
 * `api.int.spec.ts` with its Payload instance (two instances on the local D1 hit SQLITE_BUSY).
 */
import { createPayloadRequest, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { hasRole, type Role } from '@/access/roles'
import { seedBlogEndpoint } from '@/endpoints/seed'
import { Header } from '@/Header/config'
import type { User } from '@/payload-types'

const stamp = Date.now()

type Actor = User & { collection: 'users' }

export const roles = (getPayload: () => Payload) =>
  describe('roles', () => {
    let payload: Payload
    const actors = {} as Record<'admin' | 'otherAdmin' | 'editor' | 'author' | 'otherAuthor', Actor>
    const created: Array<{ collection: 'pages' | 'posts' | 'users'; id: number }> = []

    const as = (user: Actor) => ({ user, overrideAccess: false }) as const
    // Denied by access control, not by validation or a missing document.
    const forbidden = { status: 403 }

    beforeAll(async () => {
      payload = getPayload()
      const make = async (key: keyof typeof actors, role: Role) => {
        const user = await payload.create({
          collection: 'users',
          data: { email: `roles-${key}-${stamp}@example.com`, password: 'roles-test-password', role },
          overrideAccess: true,
        })
        created.push({ collection: 'users', id: user.id })
        actors[key] = { ...user, collection: 'users' }
      }
      await make('admin', 'admin')
      await make('otherAdmin', 'admin')
      await make('editor', 'editor')
      await make('author', 'author')
      await make('otherAuthor', 'author')
    })

    afterAll(async () => {
      // No `user`: a trusted call, which the admin self-guard doesn't apply to.
      for (const { collection, id } of created.reverse()) {
        await payload.delete({ collection, id, overrideAccess: true })
      }
    })

    it('ranks admin over editor over author', () => {
      expect(hasRole(actors.admin, 'editor')).toBe(true)
      expect(hasRole(actors.editor, 'editor')).toBe(true)
      expect(hasRole(actors.editor, 'admin')).toBe(false)
      expect(hasRole(actors.author, 'author')).toBe(true)
      expect(hasRole(actors.author, 'editor')).toBe(false)
      expect(hasRole({ role: 'owner' }, 'author')).toBe(false)
      expect(hasRole(null, 'author')).toBe(false)
    })

    it('gives new users the author role', async () => {
      const user = await payload.create({
        collection: 'users',
        // No role sent: the field's default applies (the type requires it, the API doesn't).
        data: { email: `roles-default-${stamp}@example.com`, password: 'roles-test-password' } as {
          email: string
          password: string
          role: Role
        },
        overrideAccess: true,
      })
      created.push({ collection: 'users', id: user.id })
      expect(user.role).toBe('author')
    })

    it('lets authors edit and delete only the posts they created', async () => {
      const post = await payload.create({
        collection: 'posts',
        data: { title: `Author post ${stamp}`, slug: `roles-post-${stamp}` },
        ...as(actors.author),
      })
      created.push({ collection: 'posts', id: post.id })
      expect(post.createdBy).toMatchObject({ relationTo: 'users' })
      const createdBy = post.createdBy?.value
      expect(typeof createdBy === 'object' ? createdBy?.id : createdBy).toBe(actors.author.id)

      const updated = await payload.update({
        collection: 'posts',
        id: post.id,
        data: { title: `Author post ${stamp} (edited)` },
        ...as(actors.author),
      })
      expect(updated.title).toBe(`Author post ${stamp} (edited)`)

      await expect(
        payload.update({ collection: 'posts', id: post.id, data: { title: 'Hijacked' }, ...as(actors.otherAuthor) }),
      ).rejects.toMatchObject(forbidden)
      await expect(payload.delete({ collection: 'posts', id: post.id, ...as(actors.otherAuthor) })).rejects.toMatchObject(forbidden)

      const byEditor = await payload.update({
        collection: 'posts',
        id: post.id,
        data: { title: `Author post ${stamp} (copy-edited)` },
        ...as(actors.editor),
      })
      expect(byEditor.title).toBe(`Author post ${stamp} (copy-edited)`)
    })

    it('keeps pages, sections and site settings to editors', async () => {
      await expect(
        payload.create({
          collection: 'pages',
          data: { title: 'Author page', slug: `roles-author-page-${stamp}`, layout: [] },
          draft: true,
          ...as(actors.author),
        }),
      ).rejects.toMatchObject(forbidden)
      await expect(
        payload.create({ collection: 'sections', data: { title: 'Author section', layout: [] }, ...as(actors.author) }),
      ).rejects.toMatchObject(forbidden)

      const page = await payload.create({
        collection: 'pages',
        data: { title: 'Editor page', slug: `roles-editor-page-${stamp}`, layout: [] },
        draft: true,
        ...as(actors.editor),
      })
      created.push({ collection: 'pages', id: page.id })

      const update = Header.access?.update
      if (typeof update !== 'function') throw new Error('Header has no update access')
      const canUpdate = async (user: Actor) =>
        update({ req: await createPayloadRequest({ payload, user: user as never, req: {} as never }) } as never)
      expect(await canUpdate(actors.author)).toBe(false)
      expect(await canUpdate(actors.editor)).toBe(true)
    })

    it("shows authors only their own account, and doesn't let them change their role", async () => {
      const seen = await payload.find({ collection: 'users', depth: 0, limit: 0, ...as(actors.author) })
      expect(seen.docs.map(({ id }) => id)).toEqual([actors.author.id])

      const others = await payload.find({
        collection: 'users',
        depth: 0,
        where: { id: { equals: actors.author.id } },
        ...as(actors.editor),
      })
      expect(others.totalDocs).toBe(1)

      const self = await payload.update({
        collection: 'users',
        id: actors.author.id,
        data: { role: 'admin' },
        ...as(actors.author),
      })
      expect(self.role).toBe('author')
    })

    it('lets only admins add users and change roles', async () => {
      await expect(
        payload.create({
          collection: 'users',
          data: { email: `roles-by-editor-${stamp}@example.com`, password: 'roles-test-password', role: 'author' },
          ...as(actors.editor),
        }),
      ).rejects.toMatchObject(forbidden)

      const promoted = await payload.update({
        collection: 'users',
        id: actors.otherAuthor.id,
        data: { role: 'editor' },
        ...as(actors.admin),
      })
      expect(promoted.role).toBe('editor')
    })

    it("doesn't let admins demote or delete their own account", async () => {
      await expect(
        payload.update({ collection: 'users', id: actors.admin.id, data: { role: 'editor' }, ...as(actors.admin) }),
      ).rejects.toMatchObject({ data: { errors: [{ path: 'role' }] } })
      await expect(payload.delete({ collection: 'users', id: actors.admin.id, ...as(actors.admin) })).rejects.toThrow(
        'own admin account',
      )

      // A bulk edit or delete of every admin, the acting one included, still leaves the acting one.
      const everyAdmin = { id: { in: [actors.admin.id, actors.otherAdmin.id] } }
      const demoted = await payload.update({
        collection: 'users',
        where: everyAdmin,
        data: { role: 'editor' },
        ...as(actors.admin),
      })
      expect(demoted.docs.map(({ id }) => id)).toEqual([actors.otherAdmin.id])
      expect(demoted.errors.map(({ id }) => id)).toEqual([actors.admin.id])

      await payload.update({
        collection: 'users',
        id: actors.otherAdmin.id,
        data: { role: 'admin' },
        ...as(actors.admin),
      })
      const removed = await payload.delete({ collection: 'users', where: everyAdmin, ...as(actors.admin) })
      expect(removed.errors.map(({ id }) => id)).toEqual([actors.admin.id])
      const left = await payload.find({ collection: 'users', depth: 0, where: everyAdmin, overrideAccess: true })
      expect(left.docs.map(({ id, role }) => ({ id, role }))).toEqual([{ id: actors.admin.id, role: 'admin' }])
      created.splice(
        created.findIndex(({ collection, id }) => collection === 'users' && id === actors.otherAdmin.id),
        1,
      )
    })

    it('keeps the seed endpoints to admins', async () => {
      const req = await createPayloadRequest({ payload, user: actors.editor as never, req: {} as never })
      const response = await seedBlogEndpoint.handler(req)
      expect(response.status).toBe(403)
    })
  })
