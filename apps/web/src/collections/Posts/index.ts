import type { CollectionConfig } from 'payload'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

import { authenticated } from '@/access/authenticated'
import { authenticatedOrPublished } from '@/access/authenticatedOrPublished'
import { blockRichText, mediaField } from '@/blocks/shared/fields'
import { populatePublishedAt } from '@/hooks/populatePublishedAt'
import { localizePath } from '@/i18n/locales'
import { postPath, RESERVED_POST_SLUGS } from '@/utilities/postPath'

// Drafts render on the frontend only for logged-in users who add `?draft=true`.
// In the locale being edited, like Pages.
const previewPath = (slug: unknown, locale?: string) =>
  typeof slug === 'string' && slug ? `${localizePath(postPath(slug), locale)}?draft=true` : null

/**
 * Blog posts, served at `/blog/<slug>` (`src/app/_frontend/blog.$slug.tsx`) and listed on the
 * archive (`/blog`), the category archives, the RSS feed and the Posts archive block. Modelled
 * on Pages: drafts with autosave, live preview, on-page editing, the SEO tab.
 *
 * The body is one rich-text field named `content`: the SEO analyzer reads a `posts` document's
 * `content` as its body and its `title` as the h1, and its populated `authors` as the byline.
 */
export const Posts: CollectionConfig = {
  slug: 'posts',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  defaultPopulate: {
    title: true,
    slug: true,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'publishedAt', 'updatedAt'],
    group: 'Blog',
    livePreview: {
      url: ({ data, locale }) => previewPath(data?.slug, locale?.code),
    },
    preview: (data, { locale }) => previewPath(data?.slug, locale),
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      localized: true,
      required: true,
    },
    {
      type: 'tabs',
      tabs: [
        {
          fields: [
            {
              name: 'excerpt',
              type: 'textarea',
              localized: true,
              admin: {
                description: 'A sentence or two for the archive, the feed and link previews.',
              },
            },
            mediaField({ name: 'cover', label: 'Cover image' }),
            {
              name: 'content',
              type: 'richText',
              editor: blockRichText(),
              localized: true,
              label: false,
            },
          ],
          label: 'Content',
        },
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: 'media',
            }),
            MetaDescriptionField({}),
            PreviewField({
              hasGenerateFn: true,
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
          ],
        },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: {
        date: { pickerAppearance: 'dayAndTime' },
        position: 'sidebar',
      },
    },
    {
      name: 'authors',
      type: 'relationship',
      relationTo: 'authors',
      hasMany: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'slug',
      type: 'slug',
      useAsSlug: 'title',
      // The archive's own segments (`/blog/page/2`…) would shadow the post.
      validate: (value: null | string | undefined) =>
        value && (RESERVED_POST_SLUGS as readonly string[]).includes(value)
          ? `"${value}" is used by the blog's own URLs. Choose another slug.`
          : true,
    },
  ],
  hooks: {
    beforeChange: [populatePublishedAt],
  },
  versions: {
    drafts: {
      // Like Pages: one autosave version updated in place keeps live preview in sync.
      autosave: {
        interval: 375,
      },
    },
  },
}
