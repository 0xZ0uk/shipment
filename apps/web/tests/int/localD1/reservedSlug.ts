/**
 * `/blog` belongs to the posts archive, so Pages refuses the slug `blog` (a page there would
 * never be shown). Run from `api.int.spec.ts` with its Payload instance.
 */
import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'

export const reservedSlug = (getPayload: () => Payload) =>
  describe('reserved page slugs', () => {
    it('refuses a page with the slug "blog"', async () => {
      await expect(
        getPayload().create({
          collection: 'pages',
          data: { title: 'Blog', slug: 'blog', layout: [] },
          overrideAccess: true,
        }),
      ).rejects.toMatchObject({
        data: { errors: [{ path: 'slug', message: expect.stringContaining('blog') }] },
      })
    })
  })
