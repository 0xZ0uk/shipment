import { createServerFn } from '@tanstack/react-start'

import type { Footer, Header } from '@/payload-types'

export type LoadLayoutResult = {
  footer: Footer
  header: Header
}

// Nav links are typed as full `Page`s, whose Lexical fields defeat TanStack's serializability
// check (see `loadPage`). At runtime they only carry `defaultPopulate` (title and slug).
export const loadLayout = createServerFn({ method: 'GET', strict: { output: false } })
  .validator((data: { locale?: string } | undefined) => ({ locale: data?.locale }))
  .handler(async ({ data }): Promise<LoadLayoutResult> => {
    const { getPayload } = await import('payload')
    const { readLocale, requestLocale } = await import('@/i18n/server')

    const payload = await getPayload({ config: (await import('@payload-config')).default })
    // Link labels and the cookie banner's copy in the visitor's locale, else the default's.
    const locale = readLocale(requestLocale(data.locale))

    // Depth 1 populates the pages that nav links point to.
    const [header, footer] = await Promise.all([
      payload.findGlobal({ slug: 'header', depth: 1, overrideAccess: false, ...locale }),
      payload.findGlobal({ slug: 'footer', depth: 1, overrideAccess: false, ...locale }),
    ])

    return { footer, header }
  })
