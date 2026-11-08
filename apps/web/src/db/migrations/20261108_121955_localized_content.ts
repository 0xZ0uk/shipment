import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

// Localized content (#158): page and post titles, page layouts, post excerpts and bodies, reusable
// sections' layouts, header/footer link labels and the cookie-consent copy move to `_locales`
// tables (`localized: true`). The schema doesn't depend on how many locales are configured, so it
// applies to every site, one locale or more (see src/i18n/locales.ts).
//
// Hand-edited from `migrate:create`:
// - Nothing is rebuilt: Drizzle generated new `_locales` tables, ALTER TABLE … ADD and
//   ALTER TABLE … DROP COLUMN only. (SQLite's DROP COLUMN rewrites the table in place; it never
//   drops it, so no ON DELETE action runs. See AGENTS.md, "D1 / R2".)
// - As generated, the DROP COLUMNs threw the content away. Each value is first copied into the
//   default locale's row. The site has only ever had `en` (the locale rows the SEO meta and
//   `_status` already live in), so that is the locale the copies go to.
// - A document with no `en` locale row yet gets one first, with `_status` left NULL so its
//   status reads as before.
// - `down` copies the `en` values back (other locales are lost) and adds the columns without
//   NOT NULL: SQLite can't add a NOT NULL column without a default to a table with rows.

const LOCALE = 'en'

/** Gives every row of `parent` an `en` row in `locales`, keeping `statusColumn` NULL. */
const ensureLocaleRows = (parent: string, locales: string, statusColumn: string) =>
  sql.raw(
    `INSERT INTO \`${locales}\` (\`_locale\`, \`_parent_id\`, \`${statusColumn}\`) ` +
      `SELECT '${LOCALE}', p.\`id\`, NULL FROM \`${parent}\` p WHERE NOT EXISTS ` +
      `(SELECT 1 FROM \`${locales}\` l WHERE l.\`_parent_id\` = p.\`id\` AND l.\`_locale\` = '${LOCALE}');`,
  )

/** Copies `columns` of `parent` into its `en` rows in `locales` (same column names). */
const copyToLocale = (parent: string, locales: string, columns: string[]) =>
  sql.raw(
    `UPDATE \`${locales}\` SET ` +
      columns
        .map(
          (column) =>
            `\`${column}\` = (SELECT p.\`${column}\` FROM \`${parent}\` p WHERE p.\`id\` = \`${locales}\`.\`_parent_id\`)`,
        )
        .join(', ') +
      ` WHERE \`_locale\` = '${LOCALE}';`,
  )

/** The reverse, for `down`. */
const copyFromLocale = (parent: string, locales: string, columns: string[]) =>
  sql.raw(
    `UPDATE \`${parent}\` SET ` +
      columns
        .map(
          (column) =>
            `\`${column}\` = (SELECT l.\`${column}\` FROM \`${locales}\` l WHERE l.\`_parent_id\` = \`${parent}\`.\`id\` AND l.\`_locale\` = '${LOCALE}')`,
        )
        .join(', ') +
      ';',
  )

/** Collections with drafts: the document table and its versions table. */
const DOCUMENT_COPIES = [
  { parent: 'pages', status: '_status', columns: ['title', 'layout'] },
  { parent: '_pages_v', status: 'version__status', columns: ['version_title', 'version_layout'] },
  { parent: 'posts', status: '_status', columns: ['title', 'excerpt', 'content'] },
  {
    parent: '_posts_v',
    status: 'version__status',
    columns: ['version_title', 'version_excerpt', 'version_content'],
  },
]

const FOOTER_COLUMNS = [
  'cookie_consent_title',
  'cookie_consent_description',
  'cookie_consent_accept_label',
  'cookie_consent_reject_label',
  'cookie_consent_settings_label',
  'cookie_consent_privacy_link_label',
]

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`sections_locales\` (
  	\`layout\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`sections\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`sections_locales_parent_id_locale_unique\` ON \`sections_locales\` (\`_parent_id\`,\`_locale\`);`)
  await db.run(sql`CREATE TABLE \`header_nav_items_locales\` (
  	\`link_label\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`header_nav_items\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`header_nav_items_locales_parent_id_locale_unique\` ON \`header_nav_items_locales\` (\`_parent_id\`,\`_locale\`);`)
  await db.run(sql`CREATE TABLE \`footer_nav_items_locales\` (
  	\`link_label\` text NOT NULL,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`footer_nav_items\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`footer_nav_items_locales_parent_id_locale_unique\` ON \`footer_nav_items_locales\` (\`_parent_id\`,\`_locale\`);`)
  await db.run(sql`CREATE TABLE \`footer_locales\` (
  	\`cookie_consent_title\` text,
  	\`cookie_consent_description\` text,
  	\`cookie_consent_accept_label\` text,
  	\`cookie_consent_reject_label\` text,
  	\`cookie_consent_settings_label\` text,
  	\`cookie_consent_privacy_link_label\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`_locale\` text NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`footer\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`footer_locales_parent_id_locale_unique\` ON \`footer_locales\` (\`_parent_id\`,\`_locale\`);`)
  await db.run(sql`ALTER TABLE \`pages_locales\` ADD \`title\` text;`)
  await db.run(sql`ALTER TABLE \`pages_locales\` ADD \`layout\` text;`)
  await db.run(sql`ALTER TABLE \`_pages_v_locales\` ADD \`version_title\` text;`)
  await db.run(sql`ALTER TABLE \`_pages_v_locales\` ADD \`version_layout\` text;`)
  await db.run(sql`ALTER TABLE \`posts_locales\` ADD \`title\` text;`)
  await db.run(sql`ALTER TABLE \`posts_locales\` ADD \`excerpt\` text;`)
  await db.run(sql`ALTER TABLE \`posts_locales\` ADD \`content\` text;`)
  await db.run(sql`ALTER TABLE \`_posts_v_locales\` ADD \`version_title\` text;`)
  await db.run(sql`ALTER TABLE \`_posts_v_locales\` ADD \`version_excerpt\` text;`)
  await db.run(sql`ALTER TABLE \`_posts_v_locales\` ADD \`version_content\` text;`)
  // Hand-edited: copy every value into the default locale before its column is dropped.
  for (const { parent, status, columns } of DOCUMENT_COPIES) {
    await db.run(ensureLocaleRows(parent, `${parent}_locales`, status))
    await db.run(copyToLocale(parent, `${parent}_locales`, columns))
  }
  await db.run(sql.raw(
    `INSERT INTO \`sections_locales\` (\`layout\`, \`_locale\`, \`_parent_id\`) SELECT \`layout\`, '${LOCALE}', \`id\` FROM \`sections\`;`,
  ))
  for (const parent of ['header_nav_items', 'footer_nav_items']) {
    await db.run(sql.raw(
      `INSERT INTO \`${parent}_locales\` (\`link_label\`, \`_locale\`, \`_parent_id\`) SELECT \`link_label\`, '${LOCALE}', \`id\` FROM \`${parent}\`;`,
    ))
  }
  await db.run(sql.raw(
    `INSERT INTO \`footer_locales\` (${FOOTER_COLUMNS.map((c) => `\`${c}\``).join(', ')}, \`_locale\`, \`_parent_id\`) ` +
      `SELECT ${FOOTER_COLUMNS.map((c) => `\`${c}\``).join(', ')}, '${LOCALE}', \`id\` FROM \`footer\`;`,
  ))
  await db.run(sql`ALTER TABLE \`pages\` DROP COLUMN \`title\`;`)
  await db.run(sql`ALTER TABLE \`pages\` DROP COLUMN \`layout\`;`)
  await db.run(sql`ALTER TABLE \`_pages_v\` DROP COLUMN \`version_title\`;`)
  await db.run(sql`ALTER TABLE \`_pages_v\` DROP COLUMN \`version_layout\`;`)
  await db.run(sql`ALTER TABLE \`posts\` DROP COLUMN \`title\`;`)
  await db.run(sql`ALTER TABLE \`posts\` DROP COLUMN \`excerpt\`;`)
  await db.run(sql`ALTER TABLE \`posts\` DROP COLUMN \`content\`;`)
  await db.run(sql`ALTER TABLE \`_posts_v\` DROP COLUMN \`version_title\`;`)
  await db.run(sql`ALTER TABLE \`_posts_v\` DROP COLUMN \`version_excerpt\`;`)
  await db.run(sql`ALTER TABLE \`_posts_v\` DROP COLUMN \`version_content\`;`)
  await db.run(sql`ALTER TABLE \`sections\` DROP COLUMN \`layout\`;`)
  await db.run(sql`ALTER TABLE \`header_nav_items\` DROP COLUMN \`link_label\`;`)
  await db.run(sql`ALTER TABLE \`footer_nav_items\` DROP COLUMN \`link_label\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_title\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_description\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_accept_label\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_reject_label\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_settings_label\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_privacy_link_label\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`pages\` ADD \`title\` text;`)
  await db.run(sql`ALTER TABLE \`pages\` ADD \`layout\` text;`)
  await db.run(sql`ALTER TABLE \`_pages_v\` ADD \`version_title\` text;`)
  await db.run(sql`ALTER TABLE \`_pages_v\` ADD \`version_layout\` text;`)
  await db.run(sql`ALTER TABLE \`posts\` ADD \`title\` text;`)
  await db.run(sql`ALTER TABLE \`posts\` ADD \`excerpt\` text;`)
  await db.run(sql`ALTER TABLE \`posts\` ADD \`content\` text;`)
  await db.run(sql`ALTER TABLE \`_posts_v\` ADD \`version_title\` text;`)
  await db.run(sql`ALTER TABLE \`_posts_v\` ADD \`version_excerpt\` text;`)
  await db.run(sql`ALTER TABLE \`_posts_v\` ADD \`version_content\` text;`)
  await db.run(sql`ALTER TABLE \`sections\` ADD \`layout\` text;`)
  await db.run(sql`ALTER TABLE \`header_nav_items\` ADD \`link_label\` text;`)
  await db.run(sql`ALTER TABLE \`footer_nav_items\` ADD \`link_label\` text;`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_title\` text;`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_description\` text;`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_accept_label\` text;`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_reject_label\` text;`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_settings_label\` text;`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_privacy_link_label\` text;`)
  // Hand-edited: copy the default locale's values back before the locale tables and columns go.
  for (const { parent, columns } of DOCUMENT_COPIES) {
    await db.run(copyFromLocale(parent, `${parent}_locales`, columns))
  }
  await db.run(copyFromLocale('sections', 'sections_locales', ['layout']))
  await db.run(copyFromLocale('header_nav_items', 'header_nav_items_locales', ['link_label']))
  await db.run(copyFromLocale('footer_nav_items', 'footer_nav_items_locales', ['link_label']))
  await db.run(copyFromLocale('footer', 'footer_locales', FOOTER_COLUMNS))
  await db.run(sql`DROP TABLE \`sections_locales\`;`)
  await db.run(sql`DROP TABLE \`header_nav_items_locales\`;`)
  await db.run(sql`DROP TABLE \`footer_nav_items_locales\`;`)
  await db.run(sql`DROP TABLE \`footer_locales\`;`)
  await db.run(sql`ALTER TABLE \`pages_locales\` DROP COLUMN \`title\`;`)
  await db.run(sql`ALTER TABLE \`pages_locales\` DROP COLUMN \`layout\`;`)
  await db.run(sql`ALTER TABLE \`_pages_v_locales\` DROP COLUMN \`version_title\`;`)
  await db.run(sql`ALTER TABLE \`_pages_v_locales\` DROP COLUMN \`version_layout\`;`)
  await db.run(sql`ALTER TABLE \`posts_locales\` DROP COLUMN \`title\`;`)
  await db.run(sql`ALTER TABLE \`posts_locales\` DROP COLUMN \`excerpt\`;`)
  await db.run(sql`ALTER TABLE \`posts_locales\` DROP COLUMN \`content\`;`)
  await db.run(sql`ALTER TABLE \`_posts_v_locales\` DROP COLUMN \`version_title\`;`)
  await db.run(sql`ALTER TABLE \`_posts_v_locales\` DROP COLUMN \`version_excerpt\`;`)
  await db.run(sql`ALTER TABLE \`_posts_v_locales\` DROP COLUMN \`version_content\`;`)
}
