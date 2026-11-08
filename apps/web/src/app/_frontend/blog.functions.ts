import type { RequiredDataFromCollectionSlug } from 'payload'

import { createServerFn } from '@tanstack/react-start'

import type { PostSummary } from '@/components/Posts/types'
import type { Category } from '@/payload-types'
import {
  archivePageTags,
  isPublicPageView,
  postPageTags,
  publicPageHeaders,
} from '@/utilities/cacheControl'
import { gaMeasurementIdFor } from '@/utilities/googleAnalytics'
import {
  archivePageCount,
  archivePagePath,
  BLOG_PAGE_SIZE,
  BLOG_PATH,
  categoryPath,
  postPath,
} from '@/utilities/postPath'

/** The public origin and GA id, read like `loadPage` reads them. */
const siteContext = async (draft: boolean) => {
  const { getRequestUrl } = await import('@tanstack/react-start/server')
  const { cloudflareEnv } = await import('#cloudflare-runtime')
  const origin = getRequestUrl().origin
  const configuredSiteUrl = process.env.SITE_URL || cloudflareEnv.SITE_URL
  return {
    configuredSiteUrl: Boolean(configuredSiteUrl),
    gaMeasurementId: gaMeasurementIdFor(
      process.env.GA_MEASUREMENT_ID || cloudflareEnv.GA_MEASUREMENT_ID,
      draft,
    ),
    origin,
    // The configured public origin wins; the request origin is the fallback (dev, previews).
    siteUrl: (configuredSiteUrl || origin).replace(/\/+$/, ''),
  }
}

/** A full HTML document, not a `/_serverFn` call from client navigation (see `loadPage`). */
const isDocumentRequest = async () => {
  const { getRequestUrl } = await import('@tanstack/react-start/server')
  const serverFnBase = process.env.TSS_SERVER_FN_BASE || '/_serverFn/'
  return !getRequestUrl().pathname.startsWith(serverFnBase)
}

const setHeaders = async (headers: Record<string, string>) => {
  const { setResponseHeader } = await import('@tanstack/react-start/server')
  for (const [name, value] of Object.entries(headers)) setResponseHeader(name, value)
}

const getPayloadInstance = async () => {
  const { getPayload } = await import('payload')
  return getPayload({ config: (await import('@payload-config')).default })
}

type LoadPostInput = {
  draft?: boolean
  slug: string
}

export type LoadPostResult = {
  /** True when the draft is shown (live preview, on-page editing or a preview link). */
  draft: boolean
  /** The admin's live preview (`?draft=true` from a signed-in user). */
  livePreview: boolean
  /** `BlogPosting` and `BreadcrumbList`, serialized. */
  jsonLd: string[]
  post: RequiredDataFromCollectionSlug<'posts'> | null
  /** The public origin (`SITE_URL`, else the request origin) for canonical URLs. */
  siteUrl: string
  /** The GA4 measurement ID for views that may load Google Analytics (see `loadPage`). */
  gaMeasurementId?: string | null
}

/**
 * One post at `/blog/<slug>`, read like `loadPage` reads a page: drafts for a signed-in user
 * with `?draft=true` or in on-page edit mode, and for a preview link shared at this post's path;
 * the published version for everyone else. No A/B testing.
 *
 * A published post viewed anonymously opts in to Workers Cache (`isPublicPageView`), tagged with
 * its path, `layout`, and its authors and categories (their names show on it).
 */
export const loadPost = createServerFn({ method: 'GET', strict: { output: false } })
  .validator((data: LoadPostInput): LoadPostInput => data)
  .handler(async ({ data }): Promise<LoadPostResult> => {
    const { getRequestHeaders, getResponseHeader } = await import('@tanstack/react-start/server')
    const payload = await getPayloadInstance()
    const { isDraftEnabled, onpageContext, previewGrantFor } =
      await import('@shipment/onpage-tanstack-start/session')

    const path = postPath(data.slug)
    const onpageDraft = await isDraftEnabled()
    const user =
      data.draft || onpageDraft
        ? (await payload.auth({ headers: new Headers(getRequestHeaders()) })).user
        : null
    // A preview link's grant names one document and the path it was shared at (see `loadPage`).
    const grant = user ? null : await previewGrantFor(path)
    const shared = grant?.kind === 'collection' && grant.slug === 'posts' ? grant : null
    const draft = Boolean(user) || Boolean(shared)

    const markers = await onpageContext()
    const result = await payload.find({
      collection: 'posts',
      // Cover, meta image, categories, and authors with their avatars.
      depth: 2,
      draft,
      limit: 1,
      overrideAccess: Boolean(shared),
      pagination: false,
      user,
      where: shared ? { id: { equals: shared.id } } : { slug: { equals: data.slug } },
      ...markers,
    })
    const post = result.docs[0] ?? null
    const site = await siteContext(draft)

    let jsonLd: string[] = []
    if (post) {
      const { buildPostJsonLd } = await import('@/utilities/postJsonLd')
      jsonLd = buildPostJsonLd(post, site.siteUrl)
    }

    const publicView = isPublicPageView({
      abVaries: false,
      document: await isDocumentRequest(),
      draft,
      draftParam: Boolean(data.draft),
      found: post != null,
      markers: markers.context != null,
      onpageDraft,
      previewGrant: grant != null,
      setsCookie: getResponseHeader('Set-Cookie') != null,
      siteUrlConfigured: site.configuredSiteUrl,
      user: user != null,
    })
    if (publicView && post) await setHeaders(publicPageHeaders(path, postPageTags(post)))

    return {
      draft,
      gaMeasurementId: post ? site.gaMeasurementId : null,
      jsonLd,
      livePreview: Boolean(user) && Boolean(data.draft),
      post,
      siteUrl: site.siteUrl,
    }
  })

type LoadArchiveInput = {
  /** 1-based; the route has already turned `/page/1` into a redirect. */
  page: number
  /** A category's archive, by slug; the whole blog without. */
  category?: string
}

export type LoadArchiveResult = {
  /** False for an unknown category or a page past the last: the route answers 404. */
  found: boolean
  category: Pick<Category, 'description' | 'id' | 'slug' | 'title'> | null
  posts: PostSummary[]
  page: number
  totalPages: number
  totalDocs: number
  /** The archive's path without a page (`/blog`, `/blog/category/<slug>`). */
  basePath: string
  siteUrl: string
  gaMeasurementId?: string | null
}

/**
 * A page of the blog archive (`/blog`, `/blog/page/<n>`) or a category's archive
 * (`/blog/category/<slug>`…): published posts, newest first, `BLOG_PAGE_SIZE` per page. An empty
 * blog has one (empty) page; past the last page, or for an unknown category, `found` is false.
 *
 * Every viewer gets the same HTML (published posts only, no markers), so an anonymous document
 * request opts in to Workers Cache, tagged `posts` (and the category's tag) for the purge hooks.
 */
export const loadPostArchive = createServerFn({ method: 'GET', strict: { output: false } })
  .validator((data: LoadArchiveInput): LoadArchiveInput => data)
  .handler(async ({ data }): Promise<LoadArchiveResult> => {
    const { getResponseHeader } = await import('@tanstack/react-start/server')
    const payload = await getPayloadInstance()
    const { isDraftEnabled } = await import('@shipment/onpage-tanstack-start/session')
    const onpageDraft = await isDraftEnabled()
    const site = await siteContext(onpageDraft)

    let category: LoadArchiveResult['category'] = null
    if (data.category !== undefined) {
      const { docs } = await payload.find({
        collection: 'categories',
        depth: 0,
        limit: 1,
        overrideAccess: false,
        pagination: false,
        select: { description: true, slug: true, title: true },
        where: { slug: { equals: data.category } },
      })
      category = docs[0] ?? null
    }
    const basePath = data.category !== undefined ? categoryPath(data.category) : BLOG_PATH

    const missing = (): LoadArchiveResult => ({
      basePath,
      category,
      found: false,
      page: data.page,
      posts: [],
      siteUrl: site.siteUrl,
      totalDocs: 0,
      totalPages: 0,
    })
    if (data.category !== undefined && !category) return missing()

    const { findPostSummaries } = await import('@/utilities/postQueries')
    const result = await findPostSummaries(payload, {
      categoryId: category?.id,
      limit: BLOG_PAGE_SIZE,
      page: data.page,
    })
    const totalPages = archivePageCount(result.totalDocs)
    if (data.page > totalPages) return missing()

    const publicView = isPublicPageView({
      abVaries: false,
      document: await isDocumentRequest(),
      draft: false,
      draftParam: false,
      found: true,
      markers: false,
      onpageDraft,
      previewGrant: false,
      setsCookie: getResponseHeader('Set-Cookie') != null,
      siteUrlConfigured: site.configuredSiteUrl,
      user: false,
    })
    if (publicView) {
      const path = archivePagePath(basePath, data.page)
      await setHeaders(publicPageHeaders(path, archivePageTags(category?.id)))
    }

    return {
      basePath,
      category,
      found: true,
      gaMeasurementId: site.gaMeasurementId,
      page: data.page,
      posts: result.docs,
      siteUrl: site.siteUrl,
      totalDocs: result.totalDocs,
      totalPages,
    }
  })
