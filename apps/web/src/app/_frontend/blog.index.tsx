import { createFileRoute } from '@tanstack/react-router'

import { BlogArchive } from '@/components/Posts/BlogArchive'
import { localeOf } from '@/i18n/routing'
import { archiveHead } from '@/utilities/blogHead'

import { loadPostArchive } from './blog.functions'

/** The blog archive's first page. An empty blog still renders (with "No posts yet"). */
export const Route = createFileRoute('/_frontend/blog/')({
  loaderDeps: ({ search }) => ({ locale: localeOf(search) }),
  loader: ({ deps }) => loadPostArchive({ data: { locale: deps.locale, page: 1 } }),
  head: ({ loaderData }) => archiveHead(loaderData),
  component: BlogIndex,
})

function BlogIndex() {
  return <BlogArchive data={Route.useLoaderData()} />
}
