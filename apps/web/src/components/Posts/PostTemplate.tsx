import { stegaClean } from '@shipment/onpage-core'
import { Link } from '@tanstack/react-router'
import React from 'react'

import type { LoadPostResult } from '@/app/_frontend/blog.functions'

import { DraftModeProvider } from '@/blocks/shared/draftMode'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { BlockMedia } from '@/components/Media/BlockMedia'
import RichText from '@/components/RichText'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getMediaUrl } from '@/utilities/getMediaUrl'

import { PostAnalytics } from './PostAnalytics'
import { PostMeta } from './PostMeta'
import { populated, type PostAuthor } from './types'

const initials = (name: string) =>
  stegaClean(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

const AuthorBio: React.FC<{ author: PostAuthor & { bio?: null | string } }> = ({ author }) => {
  const avatar = typeof author.avatar === 'object' ? author.avatar : null
  return (
    <li className="flex items-start gap-4">
      <Avatar className="size-12">
        {avatar?.url && (
          <AvatarImage alt="" src={getMediaUrl(stegaClean(avatar.url), avatar.updatedAt)} />
        )}
        <AvatarFallback>{initials(author.name)}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1">
        <p className="font-medium">{author.name}</p>
        {author.bio && <p className="text-sm text-muted-foreground">{author.bio}</p>}
      </div>
    </li>
  )
}

/**
 * A blog post: categories, title (the page's h1), excerpt, date and authors, cover, body, and
 * the authors' bios. Every CMS string is in its own element, for on-page editing.
 */
export const PostTemplate: React.FC<{
  data: LoadPostResult & { post: NonNullable<LoadPostResult['post']> }
}> = ({ data }) => {
  const { draft, gaMeasurementId, livePreview, post } = data
  const categories = populated(post.categories)
  const authors = populated(post.authors) as (PostAuthor & { bio?: null | string })[]
  const cover = typeof post.cover === 'object' && post.cover ? post.cover : null

  return (
    <DraftModeProvider draft={draft}>
      {livePreview && <LivePreviewListener />}
      <PostAnalytics draft={draft} gaMeasurementId={gaMeasurementId} />
      <article className="container flex flex-col gap-10 py-12 md:py-20" data-post="">
        <header className="mx-auto flex w-full max-w-3xl flex-col gap-5">
          <nav aria-label="Breadcrumb" className="text-sm">
            <Link className="text-muted-foreground hover:text-foreground" to="/blog">
              Blog
            </Link>
          </nav>
          {categories.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 text-xs font-medium tracking-wide text-brand uppercase">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    className="hover:underline"
                    params={{ slug: stegaClean(category.slug) }}
                    to="/blog/category/$slug"
                  >
                    {category.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <h1 className="text-4xl leading-[1.1] font-semibold tracking-[-0.03em] text-balance md:text-5xl">
            {post.title}
          </h1>
          {post.excerpt && <p className="text-lg text-muted-foreground md:text-xl">{post.excerpt}</p>}
          <PostMeta post={post} />
        </header>
        {(cover || draft) && (
          <BlockMedia
            className="mx-auto aspect-[2/1] w-full max-w-5xl rounded-xl"
            priority
            resource={cover}
          />
        )}
        {post.content && (
          <RichText
            className="mx-auto w-full max-w-3xl"
            data={post.content}
            enableGutter={false}
          />
        )}
        {authors.length > 0 && (
          <footer className="mx-auto w-full max-w-3xl border-t pt-8">
            <h2 className="sr-only">About the authors</h2>
            <ul className="flex flex-col gap-6">
              {authors.map((author) => (
                <AuthorBio author={author} key={author.id} />
              ))}
            </ul>
          </footer>
        )}
      </article>
    </DraftModeProvider>
  )
}
