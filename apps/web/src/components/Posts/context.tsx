import React, { createContext, useContext, useMemo } from 'react'

import type { PostSummary } from './types'

type PostsArchiveContextValue = {
  /** Each Posts archive block's posts, by block id (`loadPage`). */
  byBlock: Record<string, PostSummary[]>
  /** Posts for blocks the loader didn't fill (the `/dev/blocks` gallery's samples). */
  fallback?: PostSummary[]
}

const PostsArchiveContext = createContext<PostsArchiveContextValue>({ byBlock: {} })

/**
 * Hands the Posts archive blocks of a page the posts `loadPage` queried for them. Without it
 * (render tests, a page without such blocks) every block gets an empty list.
 */
export const PostsArchiveProvider: React.FC<
  PostsArchiveContextValue & { children: React.ReactNode }
> = ({ byBlock, children, fallback }) => {
  const value = useMemo(() => ({ byBlock, fallback }), [byBlock, fallback])
  return <PostsArchiveContext.Provider value={value}>{children}</PostsArchiveContext.Provider>
}

/** The posts for the Posts archive block with id `id`. */
export const useArchivePosts = (id: null | string | undefined): PostSummary[] => {
  const { byBlock, fallback } = useContext(PostsArchiveContext)
  return (id ? byBlock[id] : undefined) ?? fallback ?? []
}
