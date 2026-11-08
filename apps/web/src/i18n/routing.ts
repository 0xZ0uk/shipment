import { type LocationRewrite, useRouterState } from '@tanstack/react-router'

import {
  defaultLocale,
  isLocale,
  isUnprefixedPath,
  LOCALE_PARAM,
  type Locale,
  type LocaleConfig,
  localeConfig,
  localizePath,
  splitLocalePath,
} from './locales'

/**
 * The router's URL rewrite (src/router.tsx), on with two or more locales. The route tree has no
 * locale segment: `/pt/about` reaches the router as `/about?locale=pt` (input), and any location
 * the router builds with `locale` gets its prefix back (output), so `<Link to="/$slug">` and
 * `redirect()` stay in the visitor's locale (the frontend layout retains the param). Server and
 * browser run the same functions, so SSR and hydration see the same internal location.
 *
 * A `locale` param in the address bar is dropped on input: only the path picks the locale, so
 * `/about?locale=pt` is the default-locale page, never a second URL for the Portuguese one.
 *
 * The admin, the API and the other paths outside the site's pages (`isUnprefixedPath`) are left
 * alone both ways: the admin's own locale selector is a `?locale=` param.
 */
export const localeRewrite = (config: LocaleConfig = localeConfig): LocationRewrite => ({
  input: ({ url }) => {
    if (isUnprefixedPath(url.pathname)) return undefined
    const { locale, path } = splitLocalePath(url.pathname, config)
    const hadParam = url.searchParams.has(LOCALE_PARAM)
    if (locale === config.defaultLocale && !hadParam) return undefined
    const next = new URL(url.href)
    next.searchParams.delete(LOCALE_PARAM)
    if (locale !== config.defaultLocale) {
      next.pathname = path
      next.searchParams.set(LOCALE_PARAM, locale)
    }
    return next
  },
  output: ({ url }) => {
    const locale = url.searchParams.get(LOCALE_PARAM)
    if (locale === null || isUnprefixedPath(url.pathname)) return undefined
    const next = new URL(url.href)
    next.searchParams.delete(LOCALE_PARAM)
    next.pathname = localizePath(url.pathname, locale, config)
    return next
  },
})

/** The `locale` search param of a frontend route: a non-default locale, else nothing. */
export const validateLocaleSearch = (
  search: Record<string, unknown>,
  config: LocaleConfig = localeConfig,
): { locale?: Locale } => {
  const value = search[LOCALE_PARAM]
  return isLocale(value, config) && value !== config.defaultLocale ? { locale: value } : {}
}

/**
 * `loaderDeps` for a route whose only dependency is the locale: none at all for the default
 * locale (the router hashes `undefined` deps as '', typed or not), so its route data is what it
 * was before localization. Routes with other deps list `search.locale` beside them instead, which
 * JSON leaves out when it's undefined. Typed as an object (the router wants one): read it as
 * `deps?.locale`.
 */
export const localeDeps = (search: { locale?: Locale }) =>
  (search.locale ? { locale: search.locale } : undefined) as { locale?: Locale }

/** The locale a frontend route renders in, from its validated search. */
export const localeOf = (
  search: { locale?: Locale },
  config: LocaleConfig = localeConfig,
): Locale => search.locale ?? config.defaultLocale

/**
 * A route location's query string as the visitor sent it: without the internal `locale` param.
 * Unchanged (byte for byte) when there's none, so redirects carry the query over as before.
 */
export const publicSearchStr = (searchStr: string): string => {
  const params = new URLSearchParams(searchStr)
  if (!params.has(LOCALE_PARAM)) return searchStr
  params.delete(LOCALE_PARAM)
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}

/** The locale in a router state: its internal `locale` param, else the default. */
export const selectLocale = (state: { location: { search: unknown } }): Locale => {
  const locale = (state.location.search as { locale?: unknown }).locale
  return isLocale(locale) ? locale : defaultLocale
}

/** The visitor's locale, in any component under the router (the default with one locale). */
export const useLocale = (): Locale => useRouterState({ select: selectLocale })
