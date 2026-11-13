import { type CollectionConfig, ValidationError } from 'payload'

import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'

import { authenticatedOrPublished } from '@/access/authenticatedOrPublished'
import { editors } from '@/access/roles'
import { pageBlockSlugs } from '@/blocks'
import { populatePublishedAt } from '@/hooks/populatePublishedAt'
import { defaultLocale, isLocale, localizePath } from '@/i18n/locales'
import { pagePath } from '@/utilities/pagePath'

// Drafts render on the frontend only for logged-in users who add `?draft=true`.
/** Served by the blog's routes, so no page may take it. */
const RESERVED_SLUG = 'blog'

// In the locale being edited (`/pt/about?draft=true` for Portuguese), so live preview and
// preview show that locale.
const previewPath = (slug: unknown, locale?: string) =>
  typeof slug === 'string' && slug ? `${localizePath(pagePath(slug), locale)}?draft=true` : null

export const Pages: CollectionConfig = {
  slug: 'pages',
  access: {
    create: editors,
    delete: editors,
    read: authenticatedOrPublished,
    update: editors,
  },
  // What's populated by default when a page is referenced (links, relationships).
  // https://payloadcms.com/docs/queries/select#defaultpopulate-collection-config-property
  defaultPopulate: {
    title: true,
    slug: true,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
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
              name: 'layout',
              type: 'blocks',
              // Registered once in `payload.config.ts` (`blocks`), listed here by slug.
              blocks: pageBlockSlugs,
              localized: true,
              required: true,
              admin: {
                initCollapsed: true,
              },
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
              // if the `generateUrl` function is configured
              hasGenerateFn: true,

              // field paths to match the target field for data
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
        position: 'sidebar',
      },
    },
    {
      name: 'slug',
      type: 'slug',
      useAsSlug: 'title',
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data, req }) => {
        // `/blog` is the posts archive (src/app/_frontend/blog.index.tsx): a page there would never show.
        if (data?.slug === RESERVED_SLUG) {
          throw new ValidationError({
            collection: 'pages',
            errors: [{ message: `"${RESERVED_SLUG}" is the blog's address.`, path: 'slug' }],
            req,
          })
        }
        // `/pt` is the Portuguese home page (src/i18n/locales.ts): a page there would never show.
        if (isLocale(data?.slug) && data?.slug !== defaultLocale) {
          throw new ValidationError({
            collection: 'pages',
            errors: [{ message: `"${data?.slug}" is a language's address.`, path: 'slug' }],
            req,
          })
        }
        return data
      },
    ],
    beforeChange: [populatePublishedAt],
  },
  versions: {
    drafts: {
      // Autosave keeps live preview in sync. It updates a single autosave version in place
      // rather than adding one per save, so it doesn't grow D1.
      autosave: {
        interval: 375,
      },
    },
  },
}
