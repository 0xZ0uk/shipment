import type { CollectionConfig } from 'payload'

import { authenticated } from '@/access/authenticated'
import { mediaField } from '@/blocks/shared/fields'

/**
 * Public bylines for posts. Separate from `users` so admin accounts (emails, sessions) are never
 * exposed and a byline needs no login. Shown on post pages, the archives and the feed.
 */
export const Authors: CollectionConfig = {
  slug: 'authors',
  access: {
    create: authenticated,
    delete: authenticated,
    read: () => true,
    update: authenticated,
  },
  defaultPopulate: {
    name: true,
    slug: true,
    avatar: true,
  },
  admin: {
    defaultColumns: ['name', 'slug', 'updatedAt'],
    group: 'Blog',
    useAsTitle: 'name',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    mediaField({ name: 'avatar' }),
    {
      name: 'bio',
      type: 'textarea',
      admin: { description: 'One or two sentences, shown under the post.' },
    },
    {
      name: 'slug',
      type: 'slug',
      useAsSlug: 'name',
    },
  ],
}
