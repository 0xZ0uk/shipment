import { createFileRoute } from '@tanstack/react-router'

import { NotFound } from '@/components/NotFound'
import { PostTemplate } from '@/components/Posts/PostTemplate'
import { postHead } from '@/utilities/blogHead'
import { validateDraftSearch } from '@/utilities/validateDraftSearch'

import { loadPost } from './blog.functions'
import { redirectOrNotFound } from './redirects.functions'

/** A blog post. Drafts, live preview and on-page editing work as on pages (`loadPost`). */
export const Route = createFileRoute('/_frontend/blog/$slug')({
  validateSearch: validateDraftSearch,
  loaderDeps: ({ search }) => ({ draft: search.draft }),
  loader: async ({ deps, location, params }) => {
    const data = await loadPost({ data: { draft: deps.draft, slug: params.slug } })
    if (!data.post) await redirectOrNotFound(location)
    return data
  },
  head: ({ loaderData }) => postHead(loaderData),
  component: PostPage,
  notFoundComponent: NotFound,
})

function PostPage() {
  const data = Route.useLoaderData()
  return data.post ? <PostTemplate data={{ ...data, post: data.post }} /> : null
}
