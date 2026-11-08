/**
 * Schema of the site search index, as ordered migrations, in the SEO_D1 database (never the
 * main D1: AGENTS.md). An FTS5 virtual table isn't something Drizzle knows, so it isn't in the
 * Payload snapshot and needs no `migrate:create`.
 *
 * Applied ahead of time by `pnpm seo-store:migrate` (and its `:remote` / `:staging` variants,
 * part of `pnpm run deploy`), and lazily on the index's first query in each isolate. Recorded
 * in `search_index_migrations`. Rules, as for the SEO store's list:
 * - append only; never edit an applied migration;
 * - every statement must be safe to run twice (`IF NOT EXISTS`…): two isolates can start the
 *   same migration at once.
 *
 * Tokenizer: `unicode61 remove_diacritics 2` folds case and accents for every script, so
 * "cafe" finds "Café" (`2` also handles the combining-mark forms `1` misses). No stemming
 * (`porter` is English only, and #158 adds a second locale), so prefix queries stand in for it.
 *
 * `locale` is the extension point for a second locale (#158): one row per document and
 * locale. With one locale it is always `''`. `collection`, `doc_id`, `locale` and `path` are
 * `UNINDEXED`: stored and filterable, never matched.
 */
export interface SearchMigration {
  id: string
  statements: string[]
}

export const SEARCH_MIGRATIONS: readonly SearchMigration[] = [
  {
    id: '0001_search_index',
    statements: [
      `CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
        title,
        description,
        body,
        collection UNINDEXED,
        doc_id UNINDEXED,
        locale UNINDEXED,
        path UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 2'
      )`,
    ],
  },
]

const MIGRATIONS_TABLE = 'search_index_migrations'

/**
 * Apply the pending migrations. Idempotent and safe to run concurrently: each migration is one
 * batch (one transaction on D1) of re-runnable statements. Returns the ids applied by this call.
 */
export async function migrateSearchIndex(db: D1Database): Promise<string[]> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`,
    )
    .run()
  const { results } = await db.prepare(`SELECT id FROM ${MIGRATIONS_TABLE}`).all<{ id: string }>()
  const applied = new Set(results.map((row) => row.id))

  const done: string[] = []
  for (const migration of SEARCH_MIGRATIONS) {
    if (applied.has(migration.id)) continue
    await db.batch([
      ...migration.statements.map((sql) => db.prepare(sql)),
      db
        .prepare(`INSERT OR IGNORE INTO ${MIGRATIONS_TABLE} (id, applied_at) VALUES (?, ?)`)
        .bind(migration.id, new Date().toISOString()),
    ])
    done.push(migration.id)
  }
  return done
}
