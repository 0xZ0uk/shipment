/**
 * The site's locales (#158), from `LOCALES` (`.env.schema`): comma-separated codes, the first one
 * the default, e.g. `en,pt`. Default `en`, and then the site is single-locale and behaves as if
 * localization didn't exist: no `/<locale>` routes, hreflang, switcher or `og:locale`.
 *
 * The default locale is served unprefixed (`/about`, `/blog/hello`); every other locale under its
 * code (`/pt/about`, `/pt/blog/hello`). Slugs are shared: `/pt/about` is the Portuguese version of
 * `/about`. URLs are built here and in `pagePath` / `postPath`, never by hand.
 *
 * Client-safe (the router and the header import it). Vite replaces `__SHIPMENT_LOCALES__` in
 * every bundle (vite.config.ts), so the browser, the Worker and the Payload config agree; Payload's
 * CLI (migrate, generate:types), which runs without Vite, reads `process.env.LOCALES` instead.
 * The database schema doesn't depend on it: changing it needs no migration.
 */

declare const __SHIPMENT_LOCALES__: string | undefined

/** A locale code from `LOCALES`. Codes are lowercase (`en`, `pt`, `pt-br`). */
export type Locale = string

export type LocaleConfig = {
  /** Every locale, the default first. */
  locales: readonly Locale[]
  defaultLocale: Locale
}

const CODE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/

/** Parses a `LOCALES` value. Invalid codes and duplicates are dropped; nothing valid means `en`. */
export const parseLocales = (value: string | undefined): LocaleConfig => {
  const locales = [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((code) => code.trim().toLowerCase())
        .filter((code) => CODE.test(code)),
    ),
  ]
  if (locales.length === 0) locales.push('en')
  return { defaultLocale: locales[0], locales }
}

const rawLocales = (): string | undefined => {
  if (typeof __SHIPMENT_LOCALES__ === 'string') return __SHIPMENT_LOCALES__
  return typeof process === 'undefined' ? undefined : process.env?.LOCALES
}

export const localeConfig: LocaleConfig = parseLocales(rawLocales())

export const { defaultLocale, locales } = localeConfig

/** True with two or more locales: the prefixed routes, hreflang and the switcher exist. */
export const isMultilingual = locales.length > 1

export const isLocale = (value: unknown, config: LocaleConfig = localeConfig): value is Locale =>
  typeof value === 'string' && config.locales.includes(value)

/** A locale's own name, capitalized (`English`, `Português`), for the switcher and the admin. */
export const localeLabel = (code: Locale): string => {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code)
    if (name && name !== code) return name.charAt(0).toLocaleUpperCase(code) + name.slice(1)
  } catch {
    // An engine without the locale's data: the code is still a usable label.
  }
  return code.toUpperCase()
}

/** BCP 47 for `lang` and `hreflang` (`pt-br` → `pt-BR`). */
export const languageTag = (code: Locale): string =>
  code.replace(/-([a-z0-9]+)$/, (_, region: string) =>
    region.length === 2 ? `-${region.toUpperCase()}` : `-${region}`,
  )

/** `og:locale` wants `language_TERRITORY`; without a region, the language alone. */
export const ogLocale = (code: Locale): string => languageTag(code).replace('-', '_')

/**
 * Paths a locale prefix never applies to: the admin, the REST API, server functions, files and
 * the site-wide documents (one sitemap, robots.txt, llms.txt for the whole site). `/pt/admin`
 * stays a 404.
 */
const UNPREFIXED =
  /^\/(admin|api|_serverFn|img|\.well-known|dev)(\/|$)|^\/(sitemap\.xml|robots\.txt|llms\.txt)$/

/** True for a path outside the site's pages, which never has a locale prefix (`UNPREFIXED`). */
export const isUnprefixedPath = (pathname: string): boolean => UNPREFIXED.test(pathname)

/**
 * `path` (an unprefixed site path: `/`, `/about`, `/blog/hello?x=1`) in `locale`. The default
 * locale's paths are returned unchanged; another locale's get its prefix (`/pt`, `/pt/about`).
 * Paths outside the site's pages (`/admin`, `/api/…`, `/sitemap.xml`) never get one.
 */
export const localizePath = (
  path: string,
  locale: Locale | null | undefined,
  config: LocaleConfig = localeConfig,
): string => {
  if (!locale || locale === config.defaultLocale || !config.locales.includes(locale)) return path
  if (UNPREFIXED.test(path.split(/[?#]/)[0])) return path
  if (path === '/' || path === '') return `/${locale}`
  if (/^[?#]/.test(path)) return `/${locale}${path}`
  return `/${locale}${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * A link's `href` in `locale`: a site-relative path (`/about`, `/#faq`) gets the prefix; anything
 * else (`https://…`, `mailto:`, `#top`, `//cdn…`) is left alone.
 */
export const localizeHref = (
  href: string,
  locale: Locale | null | undefined,
  config: LocaleConfig = localeConfig,
): string =>
  href.startsWith('/') && !href.startsWith('//') ? localizePath(href, locale, config) : href

/**
 * Splits a public pathname into its locale and the unprefixed path: `/pt/about` → `pt`,
 * `/about`; `/about` → the default locale. A prefix that isn't a non-default locale isn't one:
 * `/en/about` (with `en` the default) and `/xx/about` stay as they are, and 404.
 */
export const splitLocalePath = (
  pathname: string,
  config: LocaleConfig = localeConfig,
): { locale: Locale; path: string } => {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname)
  const code = match?.[1]
  if (code && code !== config.defaultLocale && config.locales.includes(code)) {
    const path = match?.[2] || '/'
    if (!UNPREFIXED.test(path)) return { locale: code, path }
  }
  return { locale: config.defaultLocale, path: pathname }
}

/**
 * A view's locale fields, as `loadPage` and the blog loaders return them: the locale the URL
 * asked for, the locales the document is published in (every locale for an archive), and whether
 * it shows the default locale's content for want of a translation. Absent with one locale, so the
 * single-locale site's route data (and its HTML) is what it was before localization; read them
 * with the defaults (`locale ?? defaultLocale`, `translations ?? [defaultLocale]`).
 */
export type LocaleView = { locale?: Locale; translations?: Locale[]; fallback?: boolean }

/** `view` with several locales, nothing with one (see `LocaleView`). */
export const localeView = (view: Required<LocaleView>): LocaleView =>
  isMultilingual ? view : {}

/** The search param the router carries the locale in internally (src/i18n/routing.ts). */
export const LOCALE_PARAM = 'locale'
