/// <reference types="vite/client" />

import { OnPage, retainOnPageMarker, validateOnPageSearch } from '@shipment/onpage-tanstack-start'
import { createFileRoute, Outlet, retainSearchParams, useMatches } from '@tanstack/react-router'

import { ConsentProvider } from '@/components/CookieConsent'
import { NotFound } from '@/components/NotFound'
import { Footer } from '@/Footer/Component'
import { Header } from '@/Header/Component'
import { type Locale, localizePath } from '@/i18n/locales'
import { localeDeps, useLocale, validateLocaleSearch } from '@/i18n/routing'
import { BLOG_FEED_PATH } from '@/utilities/postPath'
import { siteName } from '@/utilities/siteName'

import { loadLayout } from './_frontend/layout.functions'
import styles from './_frontend/styles.css?url'

type FrontendSearch = ReturnType<typeof validateOnPageSearch> & { locale?: Locale }

const validateFrontendSearch = (search: Record<string, unknown>): FrontendSearch => ({
  ...validateOnPageSearch(search),
  ...validateLocaleSearch(search),
})

export const Route = createFileRoute('/_frontend')({
  component: FrontendLayout,
  // Typed by hand: inferring `loaderData` here would make the route's types circular.
  head: ({ loaderData }: { loaderData?: { locale?: Locale } }) => ({
    links: [
      { rel: 'stylesheet', href: styles },
      // The blog's feed in the page's locale, for feed readers (relative: cached HTML is shared
      // across hostnames).
      {
        href: localizePath(BLOG_FEED_PATH, loaderData?.locale),
        rel: 'alternate',
        title: `${siteName} blog`,
        type: 'application/rss+xml',
      },
    ],
  }),
  // In edit mode and on preview links every URL carries `?_onpage=1`, so a cache keyed by URL
  // never answers an editor with the published page. Links and navigations keep it; visitors
  // never have it.
  // `locale` is the visitor's locale (src/i18n/routing.ts: `/pt/about` arrives as
  // `/about?locale=pt`); kept on every link and navigation, so they stay in it.
  validateSearch: validateFrontendSearch,
  search: { middlewares: [retainOnPageMarker, retainSearchParams<FrontendSearch>(['locale'])] },
  loaderDeps: ({ search }) => localeDeps(search),
  loader: async ({ deps }) => ({
    ...(await loadLayout({ data: { locale: deps?.locale } })),
    ...(deps?.locale ? { locale: deps.locale } : {}),
  }),
  // Every full page load fetches the header and footer fresh; client-side navigation reuses
  // them instead of querying D1 again.
  staleTime: Infinity,
  // Unmatched URLs (e.g. `/a/b`) render this inside the layout.
  notFoundComponent: NotFound,
})

/**
 * The on-page editor's note in a non-default locale. Its stock text says adding, moving or
 * removing sections changes every language; here each locale has its own section list (`layout`
 * is localized as a whole), so nothing an editor does in one locale touches another.
 */
const onpageMessages = {
  'dock.localeNotice':
    'Editing {locale}: changes apply to this language only, sections included. ' +
    'Sections not yet changed here show the default language until you edit them.',
}

function FrontendLayout() {
  const { footer, header } = Route.useLoaderData()
  // The content locale the on-page editor loads and saves (`/pt/about` edits Portuguese).
  const locale = useLocale()
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
        <OnPage locale={locale} messages={onpageMessages} />
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
