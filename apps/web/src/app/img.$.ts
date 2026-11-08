import { createFileRoute } from '@tanstack/react-router'

/**
 * Resized, re-encoded variants of uploaded images for `srcset` (`/img/<filename>?w=…&f=…&v=…`),
 * through the Cloudflare Images binding. See src/utilities/serveResizedImage.ts.
 */
const serve = async (request: Request): Promise<Response> => {
  const [{ serveResizedImage }, runtime] = await Promise.all([
    import('@/utilities/serveResizedImage'),
    import('#cloudflare-runtime'),
  ])
  return serveResizedImage(request, {
    bucket: runtime.cloudflareEnv.R2,
    images: runtime.images,
    onError: (error) => console.error('[img] transform failed, redirecting to the original', error),
  })
}

export const Route = createFileRoute('/img/$')({
  server: {
    handlers: {
      GET: ({ request }) => serve(request),
    },
  },
})
