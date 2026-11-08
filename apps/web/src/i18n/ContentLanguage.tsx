import React from 'react'

import { defaultLocale, languageTag } from './locales'

/**
 * A fallback view's content is in the default locale's words while the page around it (`<html
 * lang>`, header, footer) is in the visitor's: this marks the content's language for screen
 * readers, translation tools and hyphenation. Renders its children unwrapped otherwise, so pages
 * with a translation (and every page with one locale) keep their markup.
 */
export const ContentLanguage: React.FC<{ children: React.ReactNode; fallback?: boolean }> = ({
  children,
  fallback,
}) =>
  fallback ? (
    <div className="contents" lang={languageTag(defaultLocale)}>
      {children}
    </div>
  ) : (
    <>{children}</>
  )
