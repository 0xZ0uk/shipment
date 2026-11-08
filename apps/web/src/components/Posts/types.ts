import type { Author, Category, Media, Post } from '@/payload-types'

/** A post's byline as listed: the populated author's public fields. */
export type PostAuthor = Pick<Author, 'id' | 'name' | 'slug'> & { avatar?: Media | number | null }

export type PostCategory = Pick<Category, 'id' | 'slug' | 'title'>

/**
 * What a post card shows (archives, the Posts archive block, the feed): no body, populated one
 * level (cover, authors, categories). Plain JSON, so loaders can return it.
 */
export type PostSummary = Pick<Post, 'excerpt' | 'id' | 'publishedAt' | 'slug' | 'title'> & {
  cover?: Media | number | null
  authors?: (PostAuthor | number)[] | null
  categories?: (PostCategory | number)[] | null
}

/** Most posts the Posts archive block shows; the loader clamps stored counts to it. */
export const POSTS_ARCHIVE_MAX = 12

/** The populated relations of a list, skipping bare ids (unpopulated or unreadable). */
export const populated = <T extends object>(list: (T | number | string)[] | null | undefined): T[] =>
  (list ?? []).filter((item): item is T => typeof item === 'object' && item !== null)
