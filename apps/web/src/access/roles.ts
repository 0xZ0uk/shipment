import type { Access, FieldAccess, Where } from 'payload'

/**
 * Admin-panel roles, most privileged first. Each role can do everything the ones below it can:
 *
 * - `admin`: everything, including users and their roles, the seed endpoints and the SEO
 *   analyzer's site-wide tools (dashboard, redirects, settings).
 * - `editor`: all content (pages, posts, sections, media, bylines, categories, folders, tags),
 *   the header and footer, Socials and form submissions.
 * - `author`: writes blog posts and uploads media; edits and deletes only what they created
 *   (Payload's `createdBy`). Can read the rest of the admin.
 */
export const ROLES = ['admin', 'editor', 'author'] as const

export type Role = (typeof ROLES)[number]

export const roleOptions: { label: string; value: Role }[] = [
  { label: 'Admin', value: 'admin' },
  { label: 'Editor', value: 'editor' },
  { label: 'Author', value: 'author' },
]

/** The role new users get unless an admin picks another. */
export const DEFAULT_ROLE: Role = 'author'

const RANK: Record<Role, number> = { admin: 3, editor: 2, author: 1 }

const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && Object.hasOwn(RANK, value)

/** True when `user` has `role` or a more privileged one. */
export const hasRole = (user: { role?: unknown } | null | undefined, role: Role): boolean =>
  isRole(user?.role) && RANK[user.role] >= RANK[role]

/** Admins only. */
export const admins: Access = ({ req: { user } }) => hasRole(user, 'admin')

/** Editors and admins. */
export const editors: Access = ({ req: { user } }) => hasRole(user, 'editor')

/** Field-level: admins only. */
export const adminsField: FieldAccess = ({ req: { user } }) => hasRole(user, 'admin')

/** The documents `createdBy` this user (Payload's authorship field, polymorphic). */
const createdBy = (id: number | string): Where => ({
  and: [{ 'createdBy.relationTo': { equals: 'users' } }, { 'createdBy.value': { equals: id } }],
})

/** Editors and admins: every document. Authors: the ones they created. */
export const editorsOrCreator: Access = ({ req: { user } }) => {
  if (!user) return false
  if (hasRole(user, 'editor')) return true
  return createdBy(user.id)
}

/** Admins: every user. Everyone else: their own account. */
export const adminsOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (hasRole(user, 'admin')) return true
  return { id: { equals: user.id } }
}

/** Editors and admins: every user (to see who created what). Authors: their own account. */
export const editorsOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (hasRole(user, 'editor')) return true
  return { id: { equals: user.id } }
}
