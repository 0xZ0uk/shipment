import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_title\` text;`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_description\` text;`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_accept_label\` text;`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_reject_label\` text;`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_settings_label\` text;`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_enable_privacy_link\` integer;`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_privacy_link_type\` text DEFAULT 'reference';`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_privacy_link_new_tab\` integer;`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_privacy_link_url\` text;`)
  await db.run(sql`ALTER TABLE \`footer\` ADD \`cookie_consent_privacy_link_label\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_title\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_description\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_accept_label\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_reject_label\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_settings_label\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_enable_privacy_link\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_privacy_link_type\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_privacy_link_new_tab\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_privacy_link_url\`;`)
  await db.run(sql`ALTER TABLE \`footer\` DROP COLUMN \`cookie_consent_privacy_link_label\`;`)
}
