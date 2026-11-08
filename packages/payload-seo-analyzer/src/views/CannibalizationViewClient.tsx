'use client'

// Import from our own package's client entry — tsup keeps this external,
// preserving the RSC boundary (this file = client, CannibalizationView wrapper = server)
export { CannibalizationView as CannibalizationViewClient } from '@shipment/payload-seo-analyzer/client'
