import { getPlatformProxy } from 'wrangler'

import type { RuntimeCloudflareEnv } from './cloudflare'

// Node dev server, tests and the Payload CLI get the same bindings through Wrangler's
// local proxy. `migrate:remote` switches D1 to the real remote database.
const proxy = await getPlatformProxy<RuntimeCloudflareEnv>({
  environment: process.env.CLOUDFLARE_ENV,
  remoteBindings: process.env.PAYLOAD_MIGRATE_REMOTE === 'true',
})

export const cloudflareEnv = proxy.env

export const isWorkersRuntime = false

// Long-lived Node process: background promises survive the response on their own.
export const waitUntil: ((promise: Promise<unknown>) => void) | undefined = undefined

// No Workers Cache under Node: nothing to purge (src/utilities/edgeCache.ts).
export const edgeCache = (): CacheContext | undefined => undefined
