import { Link } from '@tanstack/react-router'
import React from 'react'

import { BlockMedia } from '@/components/Media/BlockMedia'
import { cn } from '@/utilities/ui'

import { PostMeta } from './PostMeta'
import { populated, type PostSummary } from './types'

/** The post's title as a link to it; the whole card is clickable through `after:` on the link. */
const TitleLink: React.FC<{ className?: string; post: PostSummary }> = ({ className, post }) =>
  post.slug ? (
    <Link
      className={cn('after:absolute after:inset-0 hover:underline', className)}
      params={{ slug: post.slug }}
      to="/blog/$slug"
    >
      {post.title}
    </Link>
  ) : (
    <span className={className}>{post.title}</span>
  )

const Categories: React.FC<{ post: PostSummary }> = ({ post }) => {
  const categories = populated(post.categories)
  if (categories.length === 0) return null
  return (
    <p className="flex flex-wrap gap-x-3 text-xs font-medium tracking-wide text-brand uppercase">
      {categories.map((category) => (
        <span key={category.id}>{category.title}</span>
      ))}
    </p>
  )
}

/**
 * A post in a list: cover, categories, title (the link), excerpt, date and authors. `layout`:
 * `card` stacks them (grids), `row` puts the cover beside the text (lists), `feature` is the
 * large first post of the Featured variant.
 */
export const PostCard: React.FC<{
  className?: string
  /** `h2` on the archive pages (the page's h1 is the archive's title), `h3` inside a section. */
  headingLevel?: 'h2' | 'h3'
  layout?: 'card' | 'feature' | 'row'
  post: PostSummary
}> = ({ className, headingLevel: Heading = 'h3', layout = 'card', post }) => {
  return (
    <article
      className={cn(
        'group relative flex gap-4',
        layout === 'row' ? 'flex-col sm:flex-row sm:items-start sm:gap-6' : 'flex-col',
        className,
      )}
      data-post-card=""
    >
      <BlockMedia
        className={cn(
          'shrink-0 rounded-lg',
          layout === 'row' ? 'aspect-[3/2] sm:w-56' : 'aspect-[3/2] w-full',
        )}
        resource={post.cover}
      />
      <div className="flex min-w-0 flex-col gap-2">
        <Categories post={post} />
        <Heading
          className={cn(
            'leading-snug font-semibold text-balance',
            layout === 'feature' ? 'text-2xl md:text-3xl' : 'text-lg',
          )}
        >
          <TitleLink post={post} />
        </Heading>
        {post.excerpt && (
          <p
            className={cn(
              'text-muted-foreground',
              layout === 'feature' ? 'text-base md:text-lg' : 'line-clamp-3 text-sm',
            )}
          >
            {post.excerpt}
          </p>
        )}
        <PostMeta post={post} />
      </div>
    </article>
  )
}
