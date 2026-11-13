import type { CollectionConfig } from 'payload'

import { editors } from '@/access/roles'

export const Tags: CollectionConfig = {
  slug: 'tags',
  access: {
    create: editors,
    delete: editors,
    update: editors,
  },
  admin: {
    useAsTitle: 'name',
  },
  tags: true,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
  ],
}
