/**
 * Form data in its own D1 database (`FORMS_D1`, wrangler.jsonc), never the main one: personal
 * data with its own retention, and no Payload collection or main-D1 table for it.
 *
 * - `submissions`: one row per contact form post (the fields as JSON), deleted after
 *   FORMS_RETENTION_DAYS by the Cron Trigger.
 * - `newsletter_signups`: one row per address (unique), with what proves consent (the text the
 *   visitor agreed to, the page, when, a hashed IP) and a token for a future unsubscribe link.
 *
 * The schema is applied by `migrateFormsStore`: ahead of time by `pnpm forms-store:migrate`
 * (src/db/formsStoreMigrate.ts) and on the store's first query in each isolate, so a fresh
 * database works either way. Applied migrations are recorded in `forms_store_migrations`.
 */

export type FormsMigration = { name: string; statements: string[] }

/** Append only: never edit a migration that has shipped. */
export const FORMS_STORE_MIGRATIONS: FormsMigration[] = [
  {
    name: '0001_init',
    statements: [
      `CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        form TEXT NOT NULL,
        data TEXT NOT NULL,
        page TEXT,
        ip_hash TEXT,
        created_at TEXT NOT NULL
      )`,
      'CREATE INDEX IF NOT EXISTS submissions_created_at ON submissions (created_at)',
      `CREATE TABLE IF NOT EXISTS newsletter_signups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        consent_text TEXT,
        page TEXT,
        ip_hash TEXT,
        unsubscribe_token TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        unsubscribed_at TEXT
      )`,
      'CREATE INDEX IF NOT EXISTS newsletter_signups_created_at ON newsletter_signups (created_at)',
    ],
  },
]

const MIGRATIONS_TABLE = `CREATE TABLE IF NOT EXISTS forms_store_migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
)`

/** Applies pending migrations; returns the names it applied. Idempotent. */
export async function migrateFormsStore(db: D1Database): Promise<string[]> {
  await db.prepare(MIGRATIONS_TABLE).run()
  const { results } = await db
    .prepare('SELECT name FROM forms_store_migrations')
    .all<{ name: string }>()
  const done = new Set(results.map((row) => row.name))
  const applied: string[] = []
  for (const migration of FORMS_STORE_MIGRATIONS) {
    if (done.has(migration.name)) continue
    // One batch per migration: D1 runs a batch as a transaction.
    await db.batch([
      ...migration.statements.map((sql) => db.prepare(sql)),
      db
        .prepare(
          'INSERT OR IGNORE INTO forms_store_migrations (name, applied_at) VALUES (?, ?)',
        )
        .bind(migration.name, new Date().toISOString()),
    ])
    applied.push(migration.name)
  }
  return applied
}

export type SubmissionRow = {
  id: number
  form: string
  data: string
  page: string | null
  ip_hash: string | null
  created_at: string
}

export type SignupRow = {
  id: number
  email: string
  consent_text: string | null
  page: string | null
  ip_hash: string | null
  created_at: string
  unsubscribed_at: string | null
}

export type FormsStore = {
  insertSubmission(row: {
    form: string
    data: Record<string, unknown>
    page: string | null
    ipHash: string | null
    createdAt: Date
  }): Promise<{ id: number }>
  /** Idempotent per address: `created: false` when it was already signed up. */
  addSignup(row: {
    email: string
    consent: string | null
    page: string | null
    ipHash: string | null
    createdAt: Date
  }): Promise<{ created: boolean }>
  listSubmissions(options?: { limit?: number; offset?: number }): Promise<SubmissionRow[]>
  listSignups(options?: { limit?: number; offset?: number }): Promise<SignupRow[]>
  counts(): Promise<{ submissions: number; signups: number }>
  /** Deletes submissions created before `before`; returns how many. */
  purgeSubmissionsBefore(before: Date): Promise<number>
}

const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The store over `db`. Migrates on first use (once per store; failures retry next call). */
export function createFormsStore(db: D1Database): FormsStore {
  let ready: Promise<unknown> | null = null
  const ensure = () => {
    ready ??= migrateFormsStore(db).catch((error: unknown) => {
      ready = null
      throw error
    })
    return ready
  }

  return {
    async insertSubmission({ createdAt, data, form, ipHash, page }) {
      await ensure()
      const result = await db
        .prepare(
          'INSERT INTO submissions (form, data, page, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)',
        )
        .bind(form, JSON.stringify(data), page, ipHash, createdAt.toISOString())
        .run()
      return { id: Number(result.meta.last_row_id) }
    },

    async addSignup({ consent, createdAt, email, ipHash, page }) {
      await ensure()
      // An existing row (subscribed or not) is left as it is: a stranger re-entering someone's
      // address must not overwrite their consent record or resubscribe them.
      const result = await db
        .prepare(
          `INSERT INTO newsletter_signups
            (email, consent_text, page, ip_hash, unsubscribe_token, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (email) DO NOTHING`,
        )
        .bind(email, consent, page, ipHash, randomToken(), createdAt.toISOString())
        .run()
      return { created: result.meta.changes > 0 }
    },

    async listSubmissions({ limit = 100, offset = 0 } = {}) {
      await ensure()
      const { results } = await db
        .prepare('SELECT * FROM submissions ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
        .bind(limit, offset)
        .all<SubmissionRow>()
      return results
    },

    async listSignups({ limit = 100, offset = 0 } = {}) {
      await ensure()
      const { results } = await db
        .prepare(
          `SELECT id, email, consent_text, page, ip_hash, created_at, unsubscribed_at
          FROM newsletter_signups ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
        )
        .bind(limit, offset)
        .all<SignupRow>()
      return results
    },

    async counts() {
      await ensure()
      const row = await db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM submissions) AS submissions,
            (SELECT COUNT(*) FROM newsletter_signups) AS signups`,
        )
        .first<{ submissions: number; signups: number }>()
      return { submissions: row?.submissions ?? 0, signups: row?.signups ?? 0 }
    },

    async purgeSubmissionsBefore(before) {
      await ensure()
      const result = await db
        .prepare('DELETE FROM submissions WHERE created_at < ?')
        .bind(before.toISOString())
        .run()
      return result.meta.changes
    },
  }
}

export const DEFAULT_RETENTION_DAYS = 90

/** FORMS_RETENTION_DAYS as a whole number of days ≥ 1, else the 90-day default. */
export const retentionDays = (value: unknown): number => {
  const days = Math.floor(Number(value))
  return Number.isFinite(days) && days >= 1 ? days : DEFAULT_RETENTION_DAYS
}

/** Deletes contact submissions older than `days` before `now`. */
export const purgeOldSubmissions = (store: FormsStore, days: number, now = new Date()) =>
  store.purgeSubmissionsBefore(new Date(now.getTime() - days * 24 * 60 * 60 * 1000))
