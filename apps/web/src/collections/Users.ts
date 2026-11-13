import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionConfig,
  type FieldHook,
  type PayloadRequest,
  ValidationError,
} from 'payload'

import {
  admins,
  adminsField,
  adminsOrSelf,
  DEFAULT_ROLE,
  editorsOrSelf,
  hasRole,
  roleOptions,
} from '@/access/roles'

/** The first account (from "Create first user" or a seed) is an admin, whatever was sent. */
const firstUserIsAdmin: FieldHook = async ({ operation, req, value }) => {
  if (operation !== 'create') return value
  const { totalDocs } = await req.payload.count({ collection: 'users', overrideAccess: true, req })
  return totalDocs === 0 ? 'admin' : value
}

/** The account acting on itself. Trusted calls with no user (seeds, scripts, tests) never are. */
const isSelf = (req: PayloadRequest, id: number | string | undefined) =>
  req.user != null && id != null && String(req.user.id) === String(id)

/*
 * Someone must keep the keys: admins can't demote or delete their own account. Only admins change
 * roles or delete users, so whoever does it is still an admin afterwards. Checked per document,
 * with no count of the other admins, so a bulk edit or delete of every admin can't race past it.
 */

const keepOwnAdminRole: CollectionBeforeChangeHook = ({ data, operation, originalDoc, req }) => {
  if (operation !== 'update' || originalDoc?.role !== 'admin' || !isSelf(req, originalDoc.id)) {
    return data
  }
  if (data.role === undefined || data.role === 'admin') return data
  throw new ValidationError({
    collection: 'users',
    errors: [{ message: "You can't remove your own admin role. Ask another admin.", path: 'role' }],
    req,
  })
}

const keepOwnAdminAccount: CollectionBeforeDeleteHook = ({ id, req }) => {
  if (isSelf(req, id) && hasRole(req.user, 'admin')) {
    throw new APIError("You can't delete your own admin account. Ask another admin.", 400)
  }
}

export const Users: CollectionConfig = {
  slug: 'users',
  // Roles: src/access/roles.ts. Only admins add, remove and promote users; everyone else sees and
  // edits their own account (editors can also see the others, to tell who created what).
  access: {
    create: admins,
    delete: admins,
    read: editorsOrSelf,
    unlock: admins,
    update: adminsOrSelf,
  },
  admin: {
    defaultColumns: ['email', 'role', 'updatedAt'],
    useAsTitle: 'email',
  },
  auth: {
    // Lets MCP clients and other scripts authenticate with `users API-Key <key>`. A key acts as
    // its user, with that user's role.
    useAPIKey: true,
  },
  hooks: {
    beforeChange: [keepOwnAdminRole],
    beforeDelete: [keepOwnAdminAccount],
  },
  fields: [
    // Email added by default
    {
      name: 'role',
      type: 'select',
      options: roleOptions,
      defaultValue: DEFAULT_ROLE,
      required: true,
      saveToJWT: true,
      // Users can't change their own role; field access is skipped for `overrideAccess` (seeds).
      access: { create: adminsField, update: adminsField },
      admin: {
        position: 'sidebar',
        description:
          'Admins manage everything, including users. Editors manage all content and site settings. ' +
          'Authors write blog posts and upload media, and edit only what they created.',
      },
      hooks: { beforeChange: [firstUserIsAdmin] },
    },
  ],
  versions: false,
}
