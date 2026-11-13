import type { CollectionConfig } from 'payload'

import { editors } from '@/access/roles'

export const Folders: CollectionConfig = {
  slug: 'folders',
  access: {
    create: editors,
    delete: editors,
    update: editors,
  },
  admin: {
    useAsTitle: 'name',
  },
  folders: true,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
  ],
}
