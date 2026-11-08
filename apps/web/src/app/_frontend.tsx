/// <reference types="vite/client" />

import { OnPage, retainOnPageMarker, validateOnPageSearch } from '@shipment/onpage-tanstack-start'
import { createFileRoute, Outlet, useMatches } from '@tanstack/react-router'

import { ConsentProvider } from '@/components/CookieConsent'
import { NotFound } from '@/components/NotFound'
import { Footer } from '@/Footer/Component'
import { Header } from '@/Header/Component'

import { loadLayout } from './_frontend/layout.functions'
import styles from './_frontend/styles.css?url'

export const Route = createFileRoute('/_frontend')({
  component: FrontendLayout,
  head: () => ({
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  loader: () => loadLayout(),
  // Every full page load fetches the header and footer fresh; client-side navigation reuses
  // them instead of querying D1 again.
  staleTime: Infinity,
  // Unmatched URLs (e.g. `/a/b`) render this inside the layout.
  notFoundComponent: NotFound,
  // In edit mode and on preview links every URL carries `?_onpage=1`, so a cache keyed by URL
  // never answers an editor with the published page. Links and navigations keep it; visitors
  // never have it.
  validateSearch: validateOnPageSearch,
  search: { middlewares: [retainOnPageMarker] },
})

function FrontendLayout() {
  const { footer, header } = Route.useLoaderData()
  // The GA4 id the current page's loader returned (`loadPage`): null for drafts, 404s and when
  // GA isn't configured, and then there's no cookie banner. Route data, never the visitor's
  // cookies, so the server's HTML is the same for everyone.
  const measurementId = useMatches({ select: gaMeasurementIdOf })

  return (
    <ConsentProvider copy={footer.cookieConsent} measurementId={measurementId}>
      <div className="flex min-h-screen flex-col">
        {/* First focusable element: keyboard users skip the header's links. */}
        <a
          className="fixed top-3 left-3 z-50 -translate-y-20 rounded-md bg-background px-4 py-2 text-sm font-medium shadow-md outline-none focus:translate-y-0 focus:ring-2 focus:ring-ring"
          href="#content"
        >
          Skip to content
        </a>
        <Header data={header} />
        <main className="flex-1 outline-none" id="content" tabIndex={-1}>
          <Outlet />
        </main>
        <Footer data={footer} />
        {/* The on-page editor, or the shared-preview bar. Renders nothing and sends no requests
            unless an editor pressed "Edit on page" or opened a preview link. */}
        <OnPage />
      </div>
    </ConsentProvider>
  )
}

const gaMeasurementIdOf = (matches: { loaderData?: unknown }[]): string | null => {
  for (const { loaderData } of matches) {
    const id = (loaderData as { gaMeasurementId?: unknown } | undefined)?.gaMeasurementId
    if (typeof id === 'string' && id) return id
  }
  return null
}
