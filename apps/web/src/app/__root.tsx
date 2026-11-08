import { withPayloadRoot } from '@payloadcms/tanstack-start/client'
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'

import { languageTag } from '@/i18n/locales'
import { useLocale } from '@/i18n/routing'

export const Route = createRootRoute({
  shellComponent: withPayloadRoot(FrontendRoot),
})

function FrontendRoot({ children }: { children: React.ReactNode }) {
  // The visitor's locale (src/i18n/routing.ts); `en` with one locale, the admin included.
  const locale = useLocale()

  return (
    <html lang={languageTag(locale)} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
