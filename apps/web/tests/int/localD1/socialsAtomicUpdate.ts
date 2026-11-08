/**
 * The socials ledger's guarded writes on D1 (#144): a claim, a new schedule or a cancel is one
 * `UPDATE … WHERE id = ? AND status … RETURNING`, so of several callers racing for one
 * `social-posts` row exactly one wins. Payload's Local API `update` with a `where` reads and then
 * writes, which let every racer win.
 *
 * Drives `cancelQueuedSocialPost` (exported, and the same compare-and-swap the publish task's claim
 * uses) on the local D1 through workerd, like production; the package's own tests cover the claims
 * on `@payloadcms/db-sqlite`. Not a spec file of its own: `api.int.spec.ts` runs it with its
 * Payload instance (two Payload instances on the local D1 fail with `SQLITE_BUSY`).
 */
import { cancelQueuedSocialPost } from '@shipment/payload-plugin-socials'
import type { Payload } from 'payload'
import { afterAll, describe, expect, it } from 'vitest'

export const socialsAtomicUpdate = (getPayload: () => Payload) =>
  describe('socials ledger guarded writes on D1', () => {
    const created: number[] = []

    afterAll(async () => {
      const payload = getPayload()
      for (const id of created) {
        await payload.delete({ collection: 'social-posts', id, overrideAccess: true }).catch(() => undefined)
      }
    })

    it('lets exactly one of several concurrent cancels take a queued post', async () => {
      const payload = getPayload()
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const post = await payload.create({
        collection: 'social-posts',
        data: {
          idempotencyKey: `atomic-${stamp}`,
          meta: { queuedInput: { boardId: 'board' }, scheduleToken: 'token' },
          platform: 'pinterest',
          sourceHash: 'hash',
          sourceId: `atomic-${stamp}`,
          sourceKind: 'pages',
          status: 'queued',
        },
        overrideAccess: true,
      })
      created.push(post.id)

      const results = await Promise.allSettled(
        Array.from({ length: 4 }, (_, userId) => cancelQueuedSocialPost({ payload, postId: post.id, userId })),
      )

      expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
      for (const result of results) {
        if (result.status === 'rejected') expect(result.reason).toMatchObject({ statusCode: 409 })
      }
      const row = await payload.findByID({ collection: 'social-posts', id: post.id, depth: 0, overrideAccess: true })
      expect(row.status).toBe('cancelled')
      expect(row.meta).toMatchObject({ cancelledAt: expect.any(String), queuedInput: { boardId: 'board' } })
      expect(row.updatedAt > post.updatedAt).toBe(true)
    })
  })
