import { useNavigate } from '@tanstack/react-router'
import { ArrowRightIcon, FileTextIcon } from 'lucide-react'
import React, { useEffect, useState } from 'react'

import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { defaultLocale } from '@/i18n/locales'
import { useLocale } from '@/i18n/routing'
import { MAX_QUERY_LENGTH } from '@/search/matchQuery'
import { MIN_QUERY_LENGTH, type SearchResponse, type SearchResult } from '@/search/types'

import { ResultExcerpt } from './ResultText'

/** Wait for a pause in typing before asking the server. */
const DEBOUNCE_MS = 200

type SearchState = {
  status: 'idle' | 'loading' | 'done' | 'limited' | 'error'
  /** The query the results belong to. */
  query: string
  results: SearchResult[]
}

const idle: SearchState = { status: 'idle', query: '', results: [] }

const ALL_RESULTS = 'all-results'
const itemValue = (result: SearchResult) => `${result.collection}:${result.id}`

/** What the live region announces once a search settles (nothing while typing). */
function announcement({ status, query, results }: SearchState): string {
  if (status === 'limited') return 'Too many searches. Try again in a minute.'
  if (status === 'error') return 'Search is unavailable right now.'
  if (status !== 'done') return ''
  if (results.length === 0) return `No results for ${query}.`
  return `${results.length} result${results.length === 1 ? '' : 's'} for ${query}.`
}

/**
 * The header's search palette: results come from `GET /api/search` as the visitor types, so the
 * page HTML (cached at the edge, the same for everyone) holds nothing of it. Loaded on first use
 * (`SiteSearch`). Arrow keys move through the results, Enter opens one; the last item opens the
 * full results page.
 */
export default function SearchDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const navigate = useNavigate()
  // Results in the visitor's locale (pages published in it), at its URLs.
  const locale = useLocale()
  const localeParam = locale === defaultLocale ? '' : `&locale=${encodeURIComponent(locale)}`
  const [query, setQuery] = useState('')
  const [state, setState] = useState<SearchState>(idle)
  // The highlighted item, controlled: when new results arrive the best match is highlighted
  // (cmdk would keep "See all results", rendered before them), so Enter opens it.
  const [selected, setSelected] = useState('')
  const trimmed = query.trim()

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setState(idle)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      // Keep the previous results on screen until the new ones arrive.
      setState((previous) => ({ ...previous, status: 'loading' }))
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}${localeParam}`, {
          headers: { accept: 'application/json' },
          signal: controller.signal,
        })
        if (response.status === 429)
          return setState({ status: 'limited', query: trimmed, results: [] })
        if (!response.ok) throw new Error(`search: HTTP ${response.status}`)
        const body = (await response.json()) as SearchResponse
        setState({ status: 'done', query: trimmed, results: body.results })
        setSelected(body.results[0] ? itemValue(body.results[0]) : ALL_RESULTS)
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error', query: trimmed, results: [] })
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, localeParam])

  const openResult = (path: string) => {
    onOpenChange(false)
    void navigate({ href: path })
  }
  const openAllResults = () => {
    onOpenChange(false)
    void navigate({ to: '/search', search: { q: trimmed } })
  }

  const message = announcement(state)

  return (
    <CommandDialog
      className="sm:max-w-xl"
      description="Type to search the site's pages. Use the arrow keys to pick a result and Enter to open it."
      onOpenChange={onOpenChange}
      open={open}
      title="Search the site"
    >
      {/* Results come from the server, already ranked: cmdk must not filter or re-sort them. */}
      <Command
        label="Search the site"
        onValueChange={setSelected}
        shouldFilter={false}
        value={selected}
      >
        <CommandInput
          aria-label="Search the site"
          maxLength={MAX_QUERY_LENGTH}
          onValueChange={setQuery}
          placeholder="Search pages…"
          value={query}
        />
        <CommandList className="max-h-[min(60vh,28rem)]">
          {state.results.length > 0 && (
            <CommandGroup heading="Pages">
              {state.results.map((result) => (
                <CommandItem
                  className="items-start py-2"
                  key={itemValue(result)}
                  onSelect={() => openResult(result.path)}
                  value={itemValue(result)}
                >
                  <FileTextIcon className="mt-0.5 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">{result.title || result.path}</span>
                    <ResultExcerpt
                      className="line-clamp-2 text-xs text-muted-foreground"
                      result={result}
                    />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {message && state.results.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{message}</p>
          )}
          {trimmed.length >= MIN_QUERY_LENGTH && (
            <CommandGroup>
              <CommandItem onSelect={openAllResults} value={ALL_RESULTS}>
                <ArrowRightIcon className="text-muted-foreground" />
                <span className="truncate">See all results for “{trimmed}”</span>
              </CommandItem>
            </CommandGroup>
          )}
        </CommandList>
        <div aria-atomic="true" aria-live="polite" className="sr-only" role="status">
          {message}
        </div>
      </Command>
    </CommandDialog>
  )
}
