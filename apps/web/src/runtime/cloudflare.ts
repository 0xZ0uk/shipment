import * as workers from 'cloudflare:workers'
import { env } from 'cloudflare:workers'

export type RuntimeCloudflareEnv = CloudflareEnv & {
  PAYLOAD_SECRET?: string
}

export const cloudflareEnv = env as RuntimeCloudflareEnv

// Workers have no filesystem, so uploads must go to R2.
export const isWorkersRuntime = true

// Cloudflare Images, for the resized variants of uploads (src/app/img.$.ts).
export const images: ImagesBinding | undefined = env.IMAGES

// Keeps work alive after the response (resolves the current request on each call).
export { waitUntil } from 'cloudflare:workers'

// Workers Cache (`cache.purge`), read off the namespace: a named import of an export the
// runtime lacks would stop the Worker from loading. Purges clear the cache of the entrypoint
// that issues them; see src/utilities/edgeCache.ts.
export const edgeCache = (): CacheContext | undefined =>
  (workers as { cache?: CacheContext }).cache ?? undefined
