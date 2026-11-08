import { useRouterState } from '@tanstack/react-router'
import { CheckIcon, GlobeIcon } from 'lucide-react'
import React from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import {
  isMultilingual,
  languageTag,
  localeLabel,
  locales,
  localizePath,
} from '@/i18n/locales'
import { publicSearchStr, useLocale } from '@/i18n/routing'

/**
 * The header's language menu (#158): the page the visitor is on, in each locale. Nothing with one
 * locale. Every locale is offered: a page with no translation shows the default locale's words
 * there (and points search engines at the default-locale page).
 *
 * The items are plain links, so switching is a full page load: the header, the footer and the page
 * all come back in the new locale, and the URL is the one to share or bookmark.
 */
export const LocaleSwitcher: React.FC = () => {
  const locale = useLocale()
  // The router's location is unprefixed (`/about?locale=pt`, src/i18n/routing.ts).
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const searchStr = useRouterState({ select: (state) => state.location.searchStr })

  if (!isMultilingual) return null

  const search = publicSearchStr(searchStr)
  const current = localeLabel(locale)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Language: ${current}`}
            className="gap-1.5 text-muted-foreground"
            size="sm"
            variant="ghost"
          />
        }
      >
        <GlobeIcon aria-hidden="true" />
        <span className="uppercase">{locale}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {locales.map((code) => (
          <DropdownMenuItem
            key={code}
            render={
              <a
                aria-current={code === locale ? 'true' : undefined}
                href={`${localizePath(pathname, code)}${search}`}
                hrefLang={languageTag(code)}
                lang={languageTag(code)}
              />
            }
          >
            <span className="flex-1">{localeLabel(code)}</span>
            {code === locale ? <CheckIcon aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
