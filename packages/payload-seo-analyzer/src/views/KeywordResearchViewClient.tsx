'use client'

// Import from our own package's client entry — tsup keeps this external,
// preserving the RSC boundary (this file = client, KeywordResearchView wrapper = server)
export { KeywordResearchView as KeywordResearchViewClient } from '@shipment/payload-seo-analyzer/client'
