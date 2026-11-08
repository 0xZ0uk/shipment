/**
 * Applies the SEO_D1 database's schemas ahead of time: the SEO analyzer's data store and the
 * site search index (src/search/schema.ts).
 *
 *   pnpm seo-store:migrate          # local D1 in .wrangler/state (dev, preview, tests)
 *   pnpm seo-store:migrate:remote   # the real database (part of `pnpm run deploy`)
 *
 * Optional: both stores also apply pending migrations on their first query in each isolate.
 * Running it here keeps that off the first request after a deploy. Idempotent: applied
 * migrations are recorded in `seo_store_migrations` and `search_index_migrations`. The SEO
 * store's SQL lives in the plugin (`SEO_STORE_MIGRATIONS`), the search index's in the app; this
 * app adds no tables to the main D1 for these features.
 */
import { migrateSeoStore } from '@shipment/payload-seo-analyzer'

import { cloudflareEnv } from '#cloudflare-runtime'

import { migrateSearchIndex } from '../search/schema'

const target = process.env.PAYLOAD_MIGRATE_REMOTE === 'true' ? 'remote' : 'local'

try {
  const applied = [
    ...(await migrateSeoStore(cloudflareEnv.SEO_D1)),
    ...(await migrateSearchIndex(cloudflareEnv.SEO_D1)),
  ]
  console.log(
    applied.length
      ? `[seo-store] ${target} SEO_D1: applied ${applied.join(', ')}`
      : `[seo-store] ${target} SEO_D1: up to date`,
  )
  process.exit(0)
} catch (error) {
  console.error(`[seo-store] ${target} SEO_D1: migration failed`, error)
  process.exit(1)
}
