import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'

/** Post categories, each with an archive at `/blog/category/<slug>`. */
export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    create: authenticated,
    delete: authenticated,
    read: () => true,
    update: authenticated,
  },
  defaultPopulate: {
    title: true,
    slug: true,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
    group: 'Blog',
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
      admin: { description: 'Shown at the top of the category archive and as its meta description.' },
    },
    {
      name: 'slug',
      type: 'slug',
      useAsSlug: 'title',
    },
  ],
}
