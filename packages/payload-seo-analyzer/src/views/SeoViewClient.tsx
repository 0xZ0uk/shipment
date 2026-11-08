'use client'

// Import from our own package's client entry — tsup keeps this external,
// preserving the RSC boundary (this file = client, SeoView wrapper = server)
export { SeoView as SeoViewClient } from '@shipment/payload-seo-analyzer/client'
