import { cloudflareEnv } from '#cloudflare-runtime'

import { createSearchIndex } from './searchIndex'

/** The site's search index, in the SEO_D1 database. Server only. */
export const siteSearchIndex = createSearchIndex(cloudflareEnv.SEO_D1)
