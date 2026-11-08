import { createFileRoute } from '@tanstack/react-router'

import { NotFound } from '@/components/NotFound'
import { BlogArchive } from '@/components/Posts/BlogArchive'
import { localeDeps } from '@/i18n/routing'
import { archiveHead } from '@/utilities/blogHead'

import { loadPostArchive } from './blog.functions'
import { redirectOrNotFound } from './redirects.functions'

/** A category's archive (first page). Unknown categories are a 404 (or an SEO redirect). */
export const Route = createFileRoute('/_frontend/blog/category/$slug/')({
  loaderDeps: ({ search }) => localeDeps(search),
  loader: async ({ deps, location, params }) => {
    const data = await loadPostArchive({
      data: { category: params.slug, locale: deps?.locale, page: 1 },
    })
    if (!data.found) await redirectOrNotFound(location, deps?.locale)
    return data
  },
  head: ({ loaderData }) => archiveHead(loaderData),
  component: CategoryIndex,
  notFoundComponent: NotFound,
})

function CategoryIndex() {
  return <BlogArchive data={Route.useLoaderData()} />
}
