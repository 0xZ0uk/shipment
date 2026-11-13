import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Roles on users (src/access/roles.ts). New users default to `author`, but every existing account
 * had full access before roles existed, so they all become admins: nobody loses access, and an
 * admin demotes whoever should have less.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` ADD \`role\` text DEFAULT 'author' NOT NULL;`)
  await db.run(sql`UPDATE \`users\` SET \`role\` = 'admin';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`role\`;`)
}
