/**
 * Applies the forms store's schema (src/forms/store.ts) to the FORMS_D1 database ahead of time.
 *
 *   pnpm forms-store:migrate          # local D1 in .wrangler/state (dev, preview, tests)
 *   pnpm forms-store:migrate:remote   # the real database (part of `pnpm run deploy`)
 *
 * Optional: the store also applies pending migrations on its first query in each isolate.
 * Idempotent: applied migrations are recorded in `forms_store_migrations`. Nothing here touches
 * the main D1.
 */
import { cloudflareEnv } from '#cloudflare-runtime'
import { migrateFormsStore } from '@/forms/store'

const target = process.env.PAYLOAD_MIGRATE_REMOTE === 'true' ? 'remote' : 'local'

try {
  const applied = await migrateFormsStore(cloudflareEnv.FORMS_D1)
  console.log(
    applied.length
      ? `[forms-store] ${target} FORMS_D1: applied ${applied.join(', ')}`
      : `[forms-store] ${target} FORMS_D1: up to date`,
  )
  process.exit(0)
} catch (error) {
  console.error(`[forms-store] ${target} FORMS_D1: migration failed`, error)
  process.exit(1)
}
