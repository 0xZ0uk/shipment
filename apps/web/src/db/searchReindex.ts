/**
 * Rebuilds the site search index (SEO_D1) from every published page: the backfill after the
 * index is first deployed, or after a change to what it stores. Saves keep it in sync after that.
 *
 *   pnpm search:reindex           # local databases in .wrangler/state
 *   pnpm search:reindex:remote    # the real databases (after `pnpm run deploy`)
 *
 * Admins can do the same on a running site with `POST /api/search/reindex`, one batch
 * per request (follow `next` until it is null).
 */
import { getPayload } from 'payload'

import config from '@payload-config'

import { reindexSearch } from '../plugins/siteSearch'

const target = process.env.PAYLOAD_MIGRATE_REMOTE === 'true' ? 'remote' : 'local'

try {
  const payload = await getPayload({ config })
  const result = await reindexSearch(payload)
  for (const [collection, { indexed, removed }] of Object.entries(result)) {
    console.log(`[search] ${target} ${collection}: ${indexed} indexed, ${removed} removed`)
  }
  process.exit(0)
} catch (error) {
  console.error(`[search] ${target}: reindex failed`, error)
  process.exit(1)
}
