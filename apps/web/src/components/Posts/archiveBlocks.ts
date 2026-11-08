import type { LayoutBlock } from '@/blocks/components'

import { POSTS_ARCHIVE_MAX } from './types'

/** What `loadPage` queries for one Posts archive block. */
export type ArchiveBlockQuery = {
  id: string
  /** How many posts, clamped to 1…`POSTS_ARCHIVE_MAX` (3 when unset). */
  limit: number
  /** Only posts in this category, or every post. */
  categoryId: number | null
}

/**
 * The Posts archive blocks of a layout, reusable sections' blocks included (a `globalSection`
 * block renders its populated section's layout), each with the query that fills it. Blocks
 * without an id are skipped: the component finds its posts by id.
 */
export const collectArchiveBlocks = (
  blocks: readonly LayoutBlock[] | null | undefined,
  into: ArchiveBlockQuery[] = [],
): ArchiveBlockQuery[] => {
  for (const block of blocks ?? []) {
    if (block.blockType === 'postsArchive' && block.id) {
      const count = typeof block.count === 'number' ? Math.floor(block.count) : 3
      const category = block.category
      into.push({
        id: block.id,
        limit: Math.min(POSTS_ARCHIVE_MAX, Math.max(1, count || 3)),
        categoryId:
          typeof category === 'object' && category ? category.id : (category ?? null),
      })
    } else if (block.blockType === 'globalSection' && typeof block.reusableSection === 'object') {
      collectArchiveBlocks(block.reusableSection?.layout, into)
    }
  }
  return into
}
