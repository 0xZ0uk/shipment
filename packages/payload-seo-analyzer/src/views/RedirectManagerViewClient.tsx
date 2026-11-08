'use client'

// Import from our own package's client entry — tsup keeps this external,
// preserving the RSC boundary (this file = client, RedirectManagerView wrapper = server)
export { RedirectManagerView as RedirectManagerViewClient } from '@shipment/payload-seo-analyzer/client'
