import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import React from 'react'

import type { LoadArchiveResult } from '@/app/_frontend/blog.functions'

import { buttonVariants } from '@/components/ui/button'
import { archiveTitle } from '@/utilities/blogHead'

import { PostAnalytics } from './PostAnalytics'
import { PostCard } from './PostCard'

/** A link to page `page` of the blog archive, or of category `category`'s archive. */
const ArchiveLink: React.FC<{
  category?: null | string
  children: React.ReactNode
  className?: string
  page: number
  rel?: string
}> = ({ category, page, ...props }) =>
  category ? (
    page > 1 ? (
      <Link {...props} params={{ page: String(page), slug: category }} to="/blog/category/$slug/page/$page" />
    ) : (
      <Link {...props} params={{ slug: category }} to="/blog/category/$slug" />
    )
  ) : page > 1 ? (
    <Link {...props} params={{ page: String(page) }} to="/blog/page/$page" />
  ) : (
    <Link {...props} to="/blog" />
  )

/** Newer/older links and "Page n of m"; nothing for a one-page archive. */
const Pagination: React.FC<{ category?: null | string; page: number; totalPages: number }> = ({
  category,
  page,
  totalPages,
}) => {
  if (totalPages <= 1) return null
  const className = buttonVariants({ variant: 'outline' })
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      <div>
        {page > 1 && (
          <ArchiveLink category={category} className={className} page={page - 1} rel="prev">
            <ArrowLeft aria-hidden="true" />
            Newer posts
          </ArchiveLink>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      <div>
        {page < totalPages && (
          <ArchiveLink category={category} className={className} page={page + 1} rel="next">
            Older posts
            <ArrowRight aria-hidden="true" />
          </ArchiveLink>
        )}
      </div>
    </nav>
  )
}

/** A page of the blog archive or of a category's archive. */
export const BlogArchive: React.FC<{ data: LoadArchiveResult }> = ({ data }) => {
  const { category, gaMeasurementId, page, posts, totalPages } = data

  return (
    <div className="container flex flex-col gap-12 py-12 md:py-20" data-blog-archive="">
      <PostAnalytics gaMeasurementId={gaMeasurementId} />
      <header className="flex max-w-2xl flex-col gap-4">
        {category && (
          <Link className="text-sm text-muted-foreground hover:text-foreground" to="/blog">
            Blog
          </Link>
        )}
        <h1 className="text-4xl leading-[1.1] font-semibold tracking-[-0.03em] md:text-5xl">
          {category ? category.title : archiveTitle(null, 1)}
        </h1>
        {category?.description && (
          <p className="text-lg whitespace-pre-line text-muted-foreground">{category.description}</p>
        )}
      </header>
      {posts.length > 0 ? (
        <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <li className="flex" key={post.id}>
              <PostCard className="w-full" headingLevel="h2" post={post} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No posts yet.</p>
      )}
      <Pagination category={category?.slug} page={page} totalPages={totalPages} />
    </div>
  )
}
