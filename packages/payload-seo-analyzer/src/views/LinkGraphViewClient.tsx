'use client'

// Import from our own package's client entry — tsup keeps this external,
// preserving the RSC boundary (this file = client, LinkGraphView wrapper = server)
export { LinkGraphView as LinkGraphViewClient } from '@shipment/payload-seo-analyzer/client'
