import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import React from 'react'

import type { PostsArchiveBlock as PostsArchiveBlockProps } from '@/payload-types'

import { useDraftMode } from '@/blocks/shared/draftMode'
import { useArchivePosts } from '@/components/Posts/context'
import { PostCard } from '@/components/Posts/PostCard'
import { SectionHeading } from '@/components/SectionHeading'
import { buttonVariants } from '@/components/ui/button'

/** "All posts", to the category's archive when the block shows one category. */
const AllPostsLink: React.FC<{ category: PostsArchiveBlockProps['category'] }> = ({ category }) => {
  const slug = typeof category === 'object' && category?.slug ? category.slug : null
  const className = buttonVariants({ variant: 'outline' })
  const content = (
    <>
      All posts
      <ArrowRight aria-hidden="true" />
    </>
  )
  return slug ? (
    <Link className={className} params={{ slug }} to="/blog/category/$slug">
      {content}
    </Link>
  ) : (
    <Link className={className} to="/blog">
      {content}
    </Link>
  )
}

/**
 * The latest published posts (optionally of one category), from the page loader: `loadPage`
 * queries them per block (`useArchivePosts`), so they're never stale page JSON.
 */
export const PostsArchiveBlock: React.FC<PostsArchiveBlockProps> = ({
  category,
  description,
  eyebrow,
  id,
  title,
  variant,
}) => {
  const posts = useArchivePosts(id)
  const draft = useDraftMode()

  if (posts.length === 0) {
    // Editors see why the section is empty; visitors get the heading alone, if any.
    return (
      <div className="container flex flex-col gap-8">
        <SectionHeading description={description} eyebrow={eyebrow} title={title} />
        {draft && (
          <p className="mx-auto max-w-md rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Published posts appear here.
          </p>
        )}
      </div>
    )
  }

  const [first, ...rest] = posts

  return (
    <div className="container flex flex-col gap-12">
      <SectionHeading description={description} eyebrow={eyebrow} title={title} />
      {variant === 'list' ? (
        <ul className="mx-auto flex w-full max-w-3xl flex-col divide-y">
          {posts.map((post) => (
            <li className="py-6 first:pt-0 last:pb-0" key={post.id}>
              <PostCard layout="row" post={post} />
            </li>
          ))}
        </ul>
      ) : variant === 'featured' && first ? (
        <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
          <PostCard layout="feature" post={first} />
          {rest.length > 0 && (
            <ul className="flex flex-col gap-8">
              {rest.map((post) => (
                <li key={post.id}>
                  <PostCard layout="row" post={post} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <li className="flex" key={post.id}>
              <PostCard className="w-full" post={post} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-center">
        <AllPostsLink category={category} />
      </div>
    </div>
  )
}
