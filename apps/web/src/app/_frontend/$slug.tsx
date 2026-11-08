import { createFileRoute, notFound, redirect } from '@tanstack/react-router'

import { preloadBlocks } from '@/blocks/components'
import { NotFound } from '@/components/NotFound'
import { publicSearchStr } from '@/i18n/routing'
import { PageTemplate } from '@/components/PageTemplate'
import { ContentLanguage } from '@/i18n/ContentLanguage'
import { pageHead } from '@/utilities/pageHead'
import { validateDraftSearch } from '@/utilities/validateDraftSearch'

import { loadPage } from './pages.functions'
import { resolveRedirect } from './redirects.functions'

export const Route = createFileRoute('/_frontend/$slug')({
  validateSearch: validateDraftSearch,
  // The home page lives at `/`; don't serve it twice.
  beforeLoad: ({ params, search }) => {
    if (params.slug === 'home') {
      throw redirect({ search, statusCode: 301, to: '/' })
    }
  },
  loaderDeps: ({ search }) => ({ draft: search.draft, locale: search.locale }),
  loader: async ({ deps, location, params }) => {
    const data = await loadPage({
      data: { draft: deps.draft, locale: deps.locale, slug: params.slug },
    })
    // What the visitor sent, without the router's internal `locale` param (src/i18n/routing.ts).
    const search = publicSearchStr(location.searchStr)

    // A published A/B variant asked for by its own URL: send the visitor to the original's.
    if (data.redirectTo) {
      throw redirect({ href: `${data.redirectTo}${search}`, statusCode: 302 })
    }

    if (!data.page) {
      // Only a miss pays for the redirect lookup, so existing pages never touch it.
      const target = await resolveRedirect({
        data: { locale: deps.locale, pathname: location.pathname, search },
      })

      if (target) {
        throw redirect({ href: target.href, statusCode: target.statusCode })
      }

      throw notFound()
    }

    // The page's block components, so it renders them (and hydrates) without waiting for chunks.
    await preloadBlocks(data.page.layout)

    return data
  },
  head: ({ loaderData }) => pageHead(loaderData),
  component: SlugPage,
  // Rendered inside the frontend layout, so the header and footer stay.
  notFoundComponent: NotFound,
})

function SlugPage() {
  const { draft, experiment, fallback, gaMeasurementId, livePreview, page, postsArchive } =
    Route.useLoaderData()

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
