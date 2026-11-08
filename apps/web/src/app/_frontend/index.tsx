import { createFileRoute } from '@tanstack/react-router'

import { preloadBlocks } from '@/blocks/components'
import { PageTemplate } from '@/components/PageTemplate'
import { ContentLanguage } from '@/i18n/ContentLanguage'
import { localeOf } from '@/i18n/routing'
import { pageHead } from '@/utilities/pageHead'
import { validateDraftSearch } from '@/utilities/validateDraftSearch'

import { loadPage } from './pages.functions'

export const Route = createFileRoute('/_frontend/')({
  validateSearch: validateDraftSearch,
  loaderDeps: ({ search }) => ({ draft: search.draft, locale: localeOf(search) }),
  loader: async ({ deps }) => {
    const data = await loadPage({ data: { draft: deps.draft, locale: deps.locale, slug: 'home' } })
    // The page's block components, so it renders them (and hydrates) without waiting for chunks.
    await preloadBlocks(data.page?.layout)
    return data
  },
  head: ({ loaderData }) => pageHead(loaderData),
  component: HomePage,
})

function HomePage() {
  const { draft, experiment, fallback, gaMeasurementId, livePreview, page, postsArchive } =
    Route.useLoaderData()

  // `loadPage` falls back to a static page for `home`, so this only guards the type.
  return page ? (
    <ContentLanguage fallback={fallback}>
      <PageTemplate
        draft={draft}
        experiment={experiment}
        gaMeasurementId={gaMeasurementId}
        livePreview={livePreview}
        page={page}
        postsArchive={postsArchive}
      />
    </ContentLanguage>
  ) : null
}
