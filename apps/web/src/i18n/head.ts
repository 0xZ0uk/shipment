import {
  languageTag,
  type Locale,
  type LocaleConfig,
  localeConfig,
  localizePath,
  ogLocale,
} from './locales'

export type LocaleHeadInput = {
  /** Absolute origin, no trailing slash. */
  siteUrl: string
  /** The document's unprefixed path (`pagePath(slug)`, `postPath(slug)`, `/blog`). */
  path: string
  /** The locale the URL asked for. */
  locale: Locale
  /** The locales the document is published in (`translatedLocales`). */
  translations: readonly Locale[]
  /** No translation in `locale`: the default locale's content is shown. */
  fallback?: boolean
}

export type LocaleHead = {
  /** The canonical URL (also `og:url`). */
  url: string
  /** A fallback view: never indexed. */
  noindex: boolean
  meta: { content: string; property: string }[]
  links: { href: string; hrefLang: string; rel: string }[]
}

/**
 * A document's locale tags: its canonical URL in the locale it's shown in, `og:locale`, and the
 * hreflang alternates (one per translation, plus `x-default` on the default locale's URL).
 *
 * A fallback view (no translation in the locale asked for) points search engines at the
 * default-locale page: canonical there, `noindex`, no alternates. With one locale it's just the
 * unprefixed canonical, as before localization: no `og:locale`, no hreflang.
 */
export const localeHead = (
  { fallback = false, locale, path, siteUrl, translations }: LocaleHeadInput,
  config: LocaleConfig = localeConfig,
): LocaleHead => {
  const shown = fallback ? config.defaultLocale : locale
  const url = `${siteUrl}${localizePath(path, shown, config)}`
  if (config.locales.length < 2) return { links: [], meta: [], noindex: false, url }

  const translated = config.locales.filter((code) => translations.includes(code))
  const meta = [
    { property: 'og:locale', content: ogLocale(shown) },
    ...(fallback
      ? []
      : translated
          .filter((code) => code !== shown)
          .map((code) => ({ property: 'og:locale:alternate', content: ogLocale(code) }))),
  ]
  // An alternate set needs two members; a page only in the default locale has none.
  const links =
    fallback || translated.length < 2
      ? []
      : [
          ...translated.map((code) => ({
            href: `${siteUrl}${localizePath(path, code, config)}`,
            hrefLang: languageTag(code),
            rel: 'alternate',
          })),
          // The default locale's URL, when the page exists there.
          ...(translated.includes(config.defaultLocale)
            ? [
                {
                  href: `${siteUrl}${localizePath(path, config.defaultLocale, config)}`,
                  hrefLang: 'x-default',
                  rel: 'alternate',
                },
              ]
            : []),
        ]
  return { links, meta, noindex: fallback, url }
}
