import { createFileRoute, notFound, redirect } from '@tanstack/react-router'

import { NotFound } from '@/components/NotFound'
import { BlogArchive } from '@/components/Posts/BlogArchive'
import { archiveHead } from '@/utilities/blogHead'
import { parseArchivePage } from '@/utilities/postPath'

import { loadPostArchive } from './blog.functions'
import { redirectOrNotFound } from './redirects.functions'

/** Later pages of the blog archive. `/blog/page/1` redirects to `/blog`, its canonical URL. */
export const Route = createFileRoute('/_frontend/blog/page/$page')({
  beforeLoad: ({ params }) => {
    const page = parseArchivePage(params.page)
    if (page === null) throw notFound()
    if (page === 1) throw redirect({ statusCode: 301, to: '/blog' })
  },
  loader: async ({ location, params }) => {
    const data = await loadPostArchive({ data: { page: Number(params.page) } })
    if (!data.found) await redirectOrNotFound(location)
    return data
  },
  head: ({ loaderData }) => archiveHead(loaderData),
  component: BlogPage,
  notFoundComponent: NotFound,
})

function BlogPage() {
  return <BlogArchive data={Route.useLoaderData()} />
}
