import { SearchIcon } from 'lucide-react'
import React, { Suspense, useEffect, useState } from 'react'

import { buttonVariants } from '@/components/ui/button'
import { localizePath } from '@/i18n/locales'
import { useLocale } from '@/i18n/routing'
import { cn } from '@/utilities/ui'

// The palette (cmdk, the dialog) is its own chunk, fetched when a visitor first points at,
// focuses or opens search: pages that are only read never download it.
const loadDialog = () => import('./SearchDialog')
const SearchDialog = React.lazy(loadDialog)

/**
 * The header's search button: a link to `/search` (which works without JavaScript) that opens
 * the palette instead, as does ⌘K / Ctrl+K anywhere on the page. Renders the same HTML for every
 * visitor; the shortcut hint appears after hydration, once the platform is known.
 */
export const SiteSearch: React.FC = () => {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  // Mounted once opened, then kept, so it can animate closed and reopen with the last query.
  const [mounted, setMounted] = useState(false)
  const [shortcut, setShortcut] = useState<string | null>(null)

  const show = () => {
    setMounted(true)
    setOpen(true)
  }

  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K')
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return
      if (event.altKey || event.shiftKey) return
      event.preventDefault()
      setMounted(true)
      setOpen((value) => !value)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <a
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(buttonVariants({ variant: 'outline' }), 'gap-2 text-muted-foreground')}
        href={localizePath('/search', locale)}
        onClick={(event) => {
          if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0
          )
            return
          event.preventDefault()
          show()
        }}
        onFocus={() => void loadDialog()}
        onPointerEnter={() => void loadDialog()}
      >
        <SearchIcon />
        <span className="sr-only sm:not-sr-only">Search</span>
        {shortcut && (
          <kbd className="hidden rounded border bg-muted px-1.5 font-sans text-[0.7rem] font-medium sm:inline">
            {shortcut}
          </kbd>
        )}
      </a>
      {mounted && (
        <Suspense fallback={null}>
          <SearchDialog onOpenChange={setOpen} open={open} />
        </Suspense>
      )}
    </>
  )
}
