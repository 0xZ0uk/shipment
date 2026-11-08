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
