import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { SearchIcon } from 'lucide-react'
import React, { useId } from 'react'

import { ResultExcerpt } from '@/components/SiteSearch/ResultText'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MAX_QUERY_LENGTH } from '@/search/matchQuery'
import { siteName } from '@/utilities/siteName'

import { searchSite } from './search.functions'

/** `?q=`: TanStack parses search values as JSON, so `?q=2024` arrives as a number. */
const validateSearch = (search: Record<string, unknown>): { q?: string } => {
  const q = search.q
  return typeof q === 'string' || typeof q === 'number' ? { q: String(q) } : {}
}

/**
 * `/search?q=`: full results for a query, for shareable links and visitors without JavaScript
 * (the header's search button is a link here). Rendered on the server and kept out of shared
 * caches (`searchSite`); `noindex`, since search engines shouldn't index result pages.
 */
export const Route = createFileRoute('/_frontend/search')({
  validateSearch,
  loaderDeps: ({ search }) => ({ q: search.q ?? '' }),
  loader: ({ deps }) => searchSite({ data: { q: deps.q } }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.query
          ? `Search: ${loaderData.query} | ${siteName}`
          : `Search | ${siteName}`,
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: SearchPage,
})

function SearchPage() {
  const { query, results, status } = Route.useLoaderData()
  const navigate = useNavigate()
  const inputId = useId()

  return (
    <div className="container max-w-3xl py-16 md:py-24">
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Search</h1>

      {/* A plain GET form without JavaScript; a client-side navigation with it. */}
      <form
        action="/search"
        className="mt-6 flex gap-2"
        method="get"
        onSubmit={(event) => {
          event.preventDefault()
          const q = String(new FormData(event.currentTarget).get('q') ?? '').trim()
          void navigate({ to: '/search', search: q ? { q } : {} })
        }}
        role="search"
      >
        <label className="sr-only" htmlFor={inputId}>
          Search the site
        </label>
        <Input
          className="h-10"
          defaultValue={query}
          id={inputId}
          // Remounts with the new query after a navigation (back, forward, another search).
          key={query}
          maxLength={MAX_QUERY_LENGTH}
          name="q"
          placeholder="Search pages…"
          type="search"
        />
        <Button className="h-10" type="submit">
          <SearchIcon />
          Search
        </Button>
      </form>

      <div aria-live="polite" className="mt-8" role="status">
        {status === 'limited' && <p>Too many searches. Try again in a minute.</p>}
        {status === 'error' && <p>Search is unavailable right now.</p>}
        {status === 'ok' && query && (
          <p className="text-sm text-muted-foreground">
            {results.length === 0
              ? `No results for “${query}”.`
              : `${results.length} result${results.length === 1 ? '' : 's'} for “${query}”.`}
          </p>
        )}
      </div>

      {results.length > 0 && (
        <ol className="mt-4 divide-y divide-border">
          {results.map((result) => (
            <li className="py-5" key={`${result.collection}:${result.id}`}>
              {/* An index path (`/pricing`), not a typed route. */}
              <Link
                className="text-lg font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                to={result.path as '/'}
              >
                {result.title || result.path}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">{result.path}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                <ResultExcerpt result={result} />
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
