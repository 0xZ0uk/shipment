import type { CollectionConfig } from 'payload'

import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import { createFolderField, createTagField } from 'payload'

import { authenticated } from '@/access/authenticated'
import { editorsOrCreator } from '@/access/roles'

export const Media: CollectionConfig = {
  slug: 'media',
  // Every role uploads; authors edit and delete only their own uploads.
  access: {
    create: authenticated,
    delete: editorsOrCreator,
    read: () => true,
    update: editorsOrCreator,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    {
      name: 'caption',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [...rootFeatures, FixedToolbarFeature(), InlineToolbarFeature()]
        },
      }),
    },
    createFolderField({ relationTo: 'folders' }),
    createTagField({ relationTo: 'tags' }),
  ],
  upload: {
    // Cropping and focal points need sharp, which Workers can't run.
    crop: false,
    focalPoint: false,
  },
}
