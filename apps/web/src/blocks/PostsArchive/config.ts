import { defineBlock } from '../shared/defineBlock'
import { headingFields } from '../shared/fields'

import { POSTS_ARCHIVE_MAX } from '@/components/Posts/types'

import { postsArchiveMeta } from './meta'
import { postsArchiveThumbnail } from './thumbnail'

/**
 * The latest published posts, optionally from one category. The posts aren't stored in the
 * page: `loadPage` queries them for each block of this type, so they're always current, and
 * tags the page `posts` so publishing a post purges it (src/plugins/edgeCachePurge.ts).
 */
export const PostsArchiveConfig = defineBlock({
  meta: postsArchiveMeta,
  interfaceName: 'PostsArchiveBlock',
  thumbnail: postsArchiveThumbnail,
  fields: [
    ...headingFields(),
    {
      type: 'row',
      fields: [
        {
          name: 'count',
          type: 'number',
          admin: { description: 'How many of the latest posts to show.', width: '50%' },
          defaultValue: 3,
          max: POSTS_ARCHIVE_MAX,
          min: 1,
          required: true,
        },
        {
          name: 'category',
          type: 'relationship',
          relationTo: 'categories',
          admin: { description: 'Only posts in this category. Empty: every post.', width: '50%' },
        },
      ],
    },
  ],
})
