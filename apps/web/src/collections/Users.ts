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
  roleOptions,
} from '@/access/roles'

const otherAdmins = async (req: PayloadRequest, id: number | string) =>
  (
    await req.payload.count({
      collection: 'users',
      where: { and: [{ role: { equals: 'admin' } }, { id: { not_equals: id } }] },
      overrideAccess: true,
      req,
    })
  ).totalDocs

/** The first account (from "Create first user" or a seed) is an admin, whatever was sent. */
const firstUserIsAdmin: FieldHook = async ({ operation, req, value }) => {
  if (operation !== 'create') return value
  const { totalDocs } = await req.payload.count({ collection: 'users', overrideAccess: true, req })
  return totalDocs === 0 ? 'admin' : value
}

/** Someone must keep the keys: the last admin can't be demoted… */
const keepAnAdmin: CollectionBeforeChangeHook = async ({ data, operation, originalDoc, req }) => {
  if (operation !== 'update' || originalDoc?.role !== 'admin') return data
  if (data.role === undefined || data.role === 'admin') return data
  if ((await otherAdmins(req, originalDoc.id)) === 0) {
    throw new ValidationError({
      collection: 'users',
      errors: [{ message: 'Make another user an admin first.', path: 'role' }],
      req,
    })
  }
  return data
}

/** …or deleted. */
const keepAnAdminOnDelete: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const user = await req.payload.findByID({
    collection: 'users',
    id,
    depth: 0,
    overrideAccess: true,
    req,
    select: { role: true },
  })
  if (user.role === 'admin' && (await otherAdmins(req, id)) === 0) {
    throw new APIError('The last admin cannot be deleted. Make another user an admin first.', 400)
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
    beforeChange: [keepAnAdmin],
    beforeDelete: [keepAnAdminOnDelete],
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
