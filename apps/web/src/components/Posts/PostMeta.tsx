import { stegaClean } from '@shipment/onpage-core'
import React from 'react'

import { cn } from '@/utilities/ui'

import { populated, type PostSummary } from './types'

/**
 * `2026-11-08T…` as "8 November 2026", in UTC so the server and the browser agree (hydration)
 * whatever the visitor's time zone.
 */
export const formatPostDate = (value: null | string | undefined): string | null => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  })
}

/** A post's date and authors, each name in its own element (on-page editing maps them). */
export const PostMeta: React.FC<{
  className?: string
  post: Pick<PostSummary, 'authors' | 'publishedAt'>
}> = ({ className, post }) => {
  // In on-page edit mode strings carry invisible markers; a date is parsed and put in an attribute.
  const publishedAt = post.publishedAt ? stegaClean(post.publishedAt) : null
  const date = formatPostDate(publishedAt)
  const authors = populated(post.authors)
  if (!date && authors.length === 0) return null

  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground', className)}>
      {date && <time dateTime={publishedAt ?? undefined}>{date}</time>}
      {date && authors.length > 0 && <span aria-hidden="true">·</span>}
      {authors.map((author, i) => (
        <React.Fragment key={author.id}>
          {i > 0 && <span aria-hidden="true">,</span>}
          <span data-post-author="">{author.name}</span>
        </React.Fragment>
      ))}
    </p>
  )
}
