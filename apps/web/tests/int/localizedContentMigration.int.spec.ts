import { sql } from '@payloadcms/db-d1-sqlite'
import { drizzle } from '@payloadcms/db-d1-sqlite/drizzle/d1'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import { migrations } from '@/db/migrations'

// `20261108_121955_localized_content` (#158) on a D1 with content: titles, layouts, post bodies,
// sections, nav labels and the cookie copy move into `_locales` tables, into the `en` rows, and
// nothing else changes. On its own in-memory D1 (workerd, like production), built from the
// committed migrations; the shared local D1 in `.wrangler/state` stays untouched.

const NAME = '20261108_121955_localized_content'
const index = migrations.findIndex((migration) => migration.name === NAME)
const migration = migrations[index]!

let proxy: Awaited<ReturnType<typeof getPlatformProxy<{ D1: D1Database }>>>
let db: ReturnType<typeof drizzle>

type Row = Record<string, unknown>
const all = async (query: string) => (await db.all(sql.raw(query))) as Row[]
const run = (query: string) => db.run(sql.raw(query))
const args = () => ({ db, payload: undefined, req: undefined }) as never

const LAYOUT = JSON.stringify([{ blockType: 'hero', title: 'Hello', id: 'b1' }])
const LAYOUT_V1 = JSON.stringify([{ blockType: 'hero', title: 'Hello v1', id: 'b1' }])
const BODY = JSON.stringify({ root: { type: 'root', children: [] } })
const SECTION = JSON.stringify([{ blockType: 'richText', id: 's1' }])

/** Every table's row count. */
const counts = async () => {
  const tables = await all(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
  )
  const out: Record<string, number> = {}
  for (const { name } of tables) {
    out[name as string] = Number((await all(`SELECT count(*) AS n FROM "${name}"`))[0]!.n)
  }
  return out
}

let before: Record<string, number>

beforeAll(async () => {
  proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false, remoteBindings: false })
  db = drizzle(proxy.env.D1)
  for (const earlier of migrations.slice(0, index)) await earlier.up(args())

  // Content as the single-locale site stored it: the values in the documents' own tables, the
  // SEO meta and status already in `en` locale rows. Page 2 has no locale row at all.
  await run(`INSERT INTO pages (id, title, layout, slug) VALUES
    (1, 'Home', '${LAYOUT}', 'home'), (2, 'About', '${LAYOUT}', 'about')`)
  await run(`INSERT INTO pages_locales (meta_title, _status, _locale, _parent_id) VALUES
    ('Home | Site', 'published', 'en', 1)`)
  // Rows that reference `pages`: a rebuild of it would cascade-delete them on D1.
  await run(`INSERT INTO pages_focus_keywords (_order, _parent_id, id, keyword) VALUES
    (1, 1, 'k1', 'shipment')`)
  await run(`INSERT INTO _pages_v (id, parent_id, version_title, version_layout) VALUES
    (1, 1, 'Home v1', '${LAYOUT_V1}'), (2, 1, 'Home', '${LAYOUT}')`)
  await run(`INSERT INTO _pages_v_locales (version_meta_title, version__status, _locale, _parent_id)
    VALUES ('Home | Site', 'published', 'en', 1), ('Home | Site', 'published', 'en', 2)`)
  await run(`INSERT INTO posts (id, title, excerpt, content, slug) VALUES
    (1, 'Hello', 'Short', '${BODY}', 'hello')`)
  await run(`INSERT INTO posts_locales (_status, _locale, _parent_id) VALUES ('published', 'en', 1)`)
  await run(`INSERT INTO _posts_v (id, parent_id, version_title, version_excerpt, version_content)
    VALUES (1, 1, 'Hello', 'Short', '${BODY}')`)
  await run(`INSERT INTO _posts_v_locales (version__status, _locale, _parent_id)
    VALUES ('published', 'en', 1)`)
  await run(`INSERT INTO sections (id, title, layout) VALUES (1, 'CTA', '${SECTION}')`)
  await run(`INSERT INTO header (id) VALUES (1)`)
  await run(`INSERT INTO header_rels (parent_id, path, pages_id) VALUES (1, 'navItems.0.link.reference', 2)`)
  await run(`INSERT INTO header_nav_items (_order, _parent_id, id, link_type, link_url, link_label)
    VALUES (1, 1, 'h1', 'custom', '/#faq', 'FAQ'), (2, 1, 'h2', 'custom', '/blog', 'Blog')`)
  await run(`INSERT INTO footer (id, cookie_consent_title, cookie_consent_accept_label,
    cookie_consent_privacy_link_label) VALUES (1, 'Cookies?', 'Yes', 'Privacy')`)
  await run(`INSERT INTO footer_nav_items (_order, _parent_id, id, link_type, link_url, link_label)
    VALUES (1, 1, 'f1', 'custom', '/admin', 'Admin')`)

  before = await counts()
  await migration.up(args())
}, 60_000)

afterAll(async () => {
  await proxy?.dispose()
})

describe(NAME, () => {
  it("moves every page's title and layout into its en row, adding the missing row", async () => {
    expect(
      await all('SELECT _parent_id, _locale, title, layout, meta_title, _status FROM pages_locales ORDER BY _parent_id'),
    ).toEqual([
      { _parent_id: 1, _locale: 'en', title: 'Home', layout: LAYOUT, meta_title: 'Home | Site', _status: 'published' },
      // No row before: one now, its status left NULL as it read before.
      { _parent_id: 2, _locale: 'en', title: 'About', layout: LAYOUT, meta_title: null, _status: null },
    ])
  })

  it('moves versions, posts and post versions', async () => {
    expect(
      await all('SELECT _parent_id, version_title, version_layout FROM _pages_v_locales ORDER BY _parent_id'),
    ).toEqual([
      { _parent_id: 1, version_title: 'Home v1', version_layout: LAYOUT_V1 },
      { _parent_id: 2, version_title: 'Home', version_layout: LAYOUT },
    ])
    expect(await all('SELECT _parent_id, title, excerpt, content FROM posts_locales')).toEqual([
      { _parent_id: 1, title: 'Hello', excerpt: 'Short', content: BODY },
    ])
    expect(
      await all('SELECT version_title, version_excerpt, version_content FROM _posts_v_locales'),
    ).toEqual([{ version_title: 'Hello', version_excerpt: 'Short', version_content: BODY }])
  })

  it("moves sections' layouts, nav labels and the cookie copy into new en rows", async () => {
    expect(await all('SELECT _parent_id, _locale, layout FROM sections_locales')).toEqual([
      { _parent_id: 1, _locale: 'en', layout: SECTION },
    ])
    expect(
      await all('SELECT _parent_id, link_label FROM header_nav_items_locales ORDER BY _parent_id'),
    ).toEqual([
      { _parent_id: 'h1', link_label: 'FAQ' },
      { _parent_id: 'h2', link_label: 'Blog' },
    ])
    expect(await all('SELECT _parent_id, link_label FROM footer_nav_items_locales')).toEqual([
      { _parent_id: 'f1', link_label: 'Admin' },
    ])
    expect(
      await all(
        'SELECT cookie_consent_title, cookie_consent_accept_label, cookie_consent_reject_label, cookie_consent_privacy_link_label FROM footer_locales',
      ),
    ).toEqual([
      {
        cookie_consent_title: 'Cookies?',
        cookie_consent_accept_label: 'Yes',
        cookie_consent_reject_label: null,
        cookie_consent_privacy_link_label: 'Privacy',
      },
    ])
  })

  it('rebuilds nothing: every existing row is still there (no ON DELETE ran)', async () => {
    const after = await counts()
    for (const [table, count] of Object.entries(before)) {
      // `payload_migrations` is written by Payload's runner, not by `up` (none here).
      const added = table === 'pages_locales' ? 1 : 0
      expect({ table, count: after[table] }).toEqual({ table, count: count + added })
    }
    expect(Object.keys(after).filter((table) => !(table in before)).sort()).toEqual([
      'footer_locales',
      'footer_nav_items_locales',
      'header_nav_items_locales',
      'sections_locales',
    ])
    expect(await all('SELECT _parent_id, keyword FROM pages_focus_keywords')).toEqual([
      { _parent_id: 1, keyword: 'shipment' },
    ])
    expect(await all('SELECT parent_id, pages_id FROM header_rels')).toEqual([
      { parent_id: 1, pages_id: 2 },
    ])
    expect(await all('SELECT id, parent_id FROM _pages_v ORDER BY id')).toEqual([
      { id: 1, parent_id: 1 },
      { id: 2, parent_id: 1 },
    ])
  })

  it('drops the old columns', async () => {
    const columns = async (table: string) =>
      (await all(`SELECT name FROM pragma_table_info('${table}')`)).map(({ name }) => name)
    expect(await columns('pages')).not.toContain('title')
    expect(await columns('pages')).not.toContain('layout')
    expect(await columns('posts')).not.toContain('content')
    expect(await columns('sections')).not.toContain('layout')
    expect(await columns('header_nav_items')).not.toContain('link_label')
    expect(await columns('footer')).not.toContain('cookie_consent_title')
  })

  it('copies the en values back on down', async () => {
    await migration.down(args())
    expect(await all('SELECT id, title, layout FROM pages ORDER BY id')).toEqual([
      { id: 1, title: 'Home', layout: LAYOUT },
      { id: 2, title: 'About', layout: LAYOUT },
    ])
    expect(await all('SELECT version_title FROM _pages_v ORDER BY id')).toEqual([
      { version_title: 'Home v1' },
      { version_title: 'Home' },
    ])
    expect(await all('SELECT title, excerpt, content FROM posts')).toEqual([
      { title: 'Hello', excerpt: 'Short', content: BODY },
    ])
    expect(await all('SELECT layout FROM sections')).toEqual([{ layout: SECTION }])
    expect(await all('SELECT link_label FROM header_nav_items ORDER BY id')).toEqual([
      { link_label: 'FAQ' },
      { link_label: 'Blog' },
    ])
    expect(await all('SELECT cookie_consent_title FROM footer')).toEqual([
      { cookie_consent_title: 'Cookies?' },
    ])
  })
})
