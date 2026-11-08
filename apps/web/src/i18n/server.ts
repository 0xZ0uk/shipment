import type { Payload, TypedLocale } from 'payload'

import { defaultLocale, isLocale, isMultilingual, type Locale, locales } from './locales'

/** A view shows the default locale's content for want of a translation in `locale`. */
export const isFallback = (locale: Locale, translations: readonly Locale[]) =>
  locale !== defaultLocale && !translations.includes(locale)

/**
 * A server function's `locale` input: a configured locale, else the default. Server functions are
 * public endpoints, so anything else a caller sends reads the default locale.
 */
export const requestLocale = (value: unknown): Locale => (isLocale(value) ? value : defaultLocale)

/**
 * `locale` for Payload's Local API. `TypedLocale` is generated from the locales configured when
 * `payload-types.ts` was written (`en`), while `LOCALES` is read at runtime.
 */
export const payloadLocale = (locale: Locale) => locale as TypedLocale

/**
 * The Local API's locale options for a visitor's read: `locale`, falling back to the default
 * locale's value for every field that has none in it (Payload's `fallbackLocale`).
 */
export const readLocale = (locale: Locale) => ({
  fallbackLocale: payloadLocale(defaultLocale),
  locale: payloadLocale(locale),
})

/**
 * The locales a page or post is translated into: those it is published in.
 *
 * Payload 4 keeps `_status` per locale for a collection with localized fields
 * (`versions.drafts.localizeStatus`): publishing in Portuguese publishes that locale only, and a
 * visitor's query in a locale finds only documents published in it. So "has a translation" is
 * "an editor published it in that locale", which needs a title there (it's required). Its other
 * fields may still fall back to the default locale's (an untranslated block list, say): a partial
 * translation the editor chose to publish. One light query (no population), none with one locale.
 *
 * Always the published statuses, in draft views too (live preview, on-page editing): the
 * alternates are the live translations, whatever an editor has pending.
 */
export const translatedLocales = async (
  payload: Payload,
  collection: 'pages' | 'posts',
  id: number | string,
): Promise<Locale[]> => {
  if (!isMultilingual) return [defaultLocale]
  const doc = await payload
    .findByID({
      collection,
      depth: 0,
      disableErrors: true,
      draft: false,
      id,
      locale: 'all',
      overrideAccess: true,
      select: { _status: true },
    })
    .catch(() => null)
  const statuses = (doc?._status ?? {}) as unknown as Record<string, unknown>
  return locales.filter((locale) => statuses[locale] === 'published')
}
