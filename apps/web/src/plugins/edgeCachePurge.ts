import type {
  CollectionAfterChangeHook,
  CollectionSlug,
  CollectionAfterDeleteHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  GlobalAfterChangeHook,
  GlobalConfig,
  Plugin,
  PayloadRequest,
} from 'payload'

import {
  authorTag,
  categoryTag,
  LAYOUT_TAG,
  pageTag,
  POSTS_TAG,
} from '@/utilities/cacheControl'
import type { EdgeCachePurger } from '@/utilities/edgeCache'
import { pagePath } from '@/utilities/pagePath'
import { postPath } from '@/utilities/postPath'
import { normalizeRedirectPath } from '@/utilities/redirects'

/**
 * Purges Workers Cache when something that renders into page HTML changes (see
 * `src/utilities/cacheControl.ts` for what's cached and how it's tagged):
 *
 * - **Pages**: the page's path when its published version changes (publish, unpublish, delete,
 *   or an update that writes the published document), the old path too when the slug changes,
 *   and `layout` (every page) when a page appears, disappears or changes its title or slug,
 *   since the header, the footer and other pages' links show those. Draft saves (autosave, live
 *   preview, on-page editing) purge nothing. Scheduled publishing runs the same hooks.
 * - **Posts**: the same reads as Pages. A change to a post's published version purges its path
 *   (the old one too when the slug changes) and `posts`: the blog and category archives, the RSS
 *   feed and every page with a Posts archive block. Not `layout`: nothing in it lists posts.
 * - **Authors, Categories** (update, delete): `posts` (the lists show their names) and their own
 *   tag, which the post pages that show them carry (and a category's archive). A new one is on
 *   no post yet.
 * - **Header, Footer**: `layout`.
 * - **Media** (update, delete): `layout`. A page shows a file's alt text and its URL, which
 *   carries the file's `updatedAt`; new uploads appear on no page yet.
 * - **Sections** (update, delete): `layout`. A reusable section (the Global section block) shows
 *   on any number of pages and goes live on save (no drafts); which pages use it isn't known
 *   here, and a new section is on no page yet.
 * - **seo-redirects**: the `from` paths. A redirect only answers where no page exists, and such
 *   responses (redirects and 404s) are never cached; purged anyway, so a later change to that
 *   order can't serve stale pages.
 * - **ab-manifest** (one row per page path, written when variants are published, re-weighted,
 *   unpublished or deleted, and by "Promote"): the page's path, so it stops (or starts again)
 *   being served from the cache. A page that runs an experiment is never cached.
 *
 * Writes from the Cron Trigger (`scheduled` in src/server.ts) and from the assistant (through
 * the `ASSISTANT_SELF` service binding into `fetch`) run in the same default entrypoint as the
 * page views, so their purges reach the same cache; see `createEdgeCachePurger`.
 *
 * Where there is no Workers Cache (Node dev server, vitest, the Payload CLI) every hook returns
 * at once, without the extra read.
 */
export const edgeCachePurge =
  (purger: EdgeCachePurger): Plugin =>
  (config) => ({
    ...config,
    collections: config.collections?.map((collection) => {
      const hooks = collectionHooks[collection.slug]?.(purger)
      return hooks ? withHooks(collection, hooks) : collection
    }),
    globals: config.globals?.map((global) =>
      global.slug === 'header' || global.slug === 'footer'
        ? withGlobalHook(global, layoutGlobalHook(purger))
        : global,
    ),
  })

type Hooks = {
  afterChange?: CollectionAfterChangeHook[]
  afterDelete?: CollectionAfterDeleteHook[]
  beforeChange?: CollectionBeforeChangeHook[]
}

const withHooks = (collection: CollectionConfig, add: Hooks): CollectionConfig => ({
  ...collection,
  hooks: {
    ...collection.hooks,
    afterChange: [...(collection.hooks?.afterChange ?? []), ...(add.afterChange ?? [])],
    afterDelete: [...(collection.hooks?.afterDelete ?? []), ...(add.afterDelete ?? [])],
    beforeChange: [...(collection.hooks?.beforeChange ?? []), ...(add.beforeChange ?? [])],
  },
})

const withGlobalHook = (global: GlobalConfig, hook: GlobalAfterChangeHook): GlobalConfig => ({
  ...global,
  hooks: { ...global.hooks, afterChange: [...(global.hooks?.afterChange ?? []), hook] },
})

const purgeFor = (purger: EdgeCachePurger, req: PayloadRequest, tags: Iterable<string>) =>
  purger.purge(tags, { scope: req, logger: req.payload.logger })

const layoutGlobalHook =
  (purger: EdgeCachePurger): GlobalAfterChangeHook =>
  ({ doc, req }) => {
    purgeFor(purger, req, [LAYOUT_TAG])
    return doc
  }

/** What a page looks like from outside: whether it's live, where, and under what title. */
export type PublicPageState = { live: boolean; slug: string | null; title: string | null }

const publicState = (doc: Record<string, unknown> | null | undefined): PublicPageState => ({
  // Pages always have drafts; a document without `_status` predates them and was public.
  live: doc != null && (doc._status === 'published' || doc._status == null),
  slug: typeof doc?.slug === 'string' && doc.slug ? doc.slug : null,
  title: typeof doc?.title === 'string' ? doc.title : null,
})

/** The tags a change of a post's published version clears (see the plugin's description). */
export function postChangeTags(before: PublicPageState, after: PublicPageState): string[] {
  if (!before.live && !after.live) return []
  const tags = new Set<string>([POSTS_TAG])
  if (before.live && before.slug) tags.add(pageTag(postPath(before.slug)))
  if (after.live && after.slug) tags.add(pageTag(postPath(after.slug)))
  return [...tags]
}

/** The tags a change of a page's published version clears. */
export function pageChangeTags(before: PublicPageState, after: PublicPageState): string[] {
  if (!before.live && !after.live) return []
  const tags = new Set<string>()
  if (before.live && before.slug) tags.add(pageTag(pagePath(before.slug)))
  if (after.live && after.slug) tags.add(pageTag(pagePath(after.slug)))
  if (before.live !== after.live || before.slug !== after.slug || before.title !== after.title) {
    tags.add(LAYOUT_TAG)
  }
  return [...tags]
}

/**
 * Is this update a draft save that leaves the published page as it is? Payload's REST API
 * saves drafts with `?draft=true` (autosave, live preview, on-page editing); unpublishing sends
 * `_status: 'draft'` without it. A local API call doesn't show its `draft` argument to hooks, so
 * it gets the extra read below.
 */
export const isRestDraftSave = (req: PayloadRequest, data: Record<string, unknown>) => {
  const draft = (req.query as Record<string, unknown> | undefined)?.draft
  return data._status !== 'published' && (draft === 'true' || draft === true)
}

const contextKey = (collection: string, id: number | string) =>
  `edgeCachePurge:${collection}:${id}`

/**
 * The published document as stored, not the latest draft that hooks get as `originalDoc` and
 * `previousDoc`: only it says what visitors see.
 */
const readPublished = async (
  req: PayloadRequest,
  collection: CollectionSlug,
  id: number | string,
) =>
  publicState(
    // The database adapter directly: no access checks, and no read hooks (on-page edit mode
    // would add markers to the title) on a read that only compares.
    await req.payload.db
      .findOne<Record<string, unknown> & { id: number | string }>({
        collection,
        req,
        select: { _status: true, slug: true, title: true },
        where: { id: { equals: id } },
      })
      .catch(() => null),
  )

type ChangeTags = (before: PublicPageState, after: PublicPageState) => string[]

/**
 * Hooks for a collection with drafts whose documents have a public URL (Pages, Posts): purge
 * `changeTags(before, after)` when the published version changes.
 */
const publishedDocHooks = (
  collection: CollectionSlug,
  changeTags: ChangeTags,
  purger: EdgeCachePurger,
): Hooks => ({
  beforeChange: [
    async ({ data, operation, originalDoc, req }) => {
      if (operation !== 'update' || !purger.available || !originalDoc?.id) return data
      if (isRestDraftSave(req, data)) return data
      req.context[contextKey(collection, originalDoc.id)] = await readPublished(
        req,
        collection,
        originalDoc.id,
      )
      return data
    },
  ],
  afterChange: [
    async ({ data, doc, operation, req }) => {
      if (!purger.available) return doc
      if (operation === 'create') {
        purgeFor(purger, req, changeTags(publicState(null), publicState(doc)))
        return doc
      }
      const key = contextKey(collection, doc.id)
      const before = req.context[key] as PublicPageState | undefined
      // No state read: a REST draft save, which changes nothing visitors see.
      if (!before) return doc
      delete req.context[key]
      // A publish (or an update without drafts) wrote the published document, and `doc` is it.
      // Otherwise this was a local-API draft save or an unpublish: read which. An unpublish
      // leaves no published document; a draft save leaves it as it was, so there's nothing to
      // purge while it's still live.
      if (data._status === 'draft') {
        const after = await readPublished(req, collection, doc.id)
        if (!after.live) purgeFor(purger, req, changeTags(before, after))
        return doc
      }
      purgeFor(purger, req, changeTags(before, publicState(doc)))
      return doc
    },
  ],
  afterDelete: [
    ({ doc, req }) => {
      if (purger.available) purgeFor(purger, req, changeTags(publicState(doc), publicState(null)))
      return doc
    },
  ],
})

/**
 * Update and delete purge `posts` and `tagOf(id)`: for documents shown on posts and in the
 * lists of posts (authors, categories).
 */
const postRelationHooks =
  (tagOf: (id: number | string) => string) =>
  (purger: EdgeCachePurger): Hooks => ({
    afterChange: [
      ({ doc, operation, req }) => {
        if (operation === 'update') purgeFor(purger, req, [POSTS_TAG, tagOf(doc.id)])
        return doc
      },
    ],
    afterDelete: [
      ({ doc, req }) => {
        purgeFor(purger, req, [POSTS_TAG, tagOf(doc.id)])
        return doc
      },
    ],
  })

/** Update and delete purge `layout`: for documents any page may show (media, reusable sections). */
const layoutHooks = (purger: EdgeCachePurger): Hooks => ({
  afterChange: [
    ({ doc, operation, req }) => {
      if (operation === 'update') purgeFor(purger, req, [LAYOUT_TAG])
      return doc
    },
  ],
  afterDelete: [
    ({ doc, req }) => {
      purgeFor(purger, req, [LAYOUT_TAG])
      return doc
    },
  ],
})

const redirectTag = (from: unknown) => {
  const path = normalizeRedirectPath(from)
  return path ? pageTag(path) : null
}

const redirectHooks = (purger: EdgeCachePurger): Hooks => ({
  afterChange: [
    ({ doc, previousDoc, req }) => {
      const tags = [redirectTag(doc?.from), redirectTag(previousDoc?.from)]
      purgeFor(
        purger,
        req,
        tags.filter((t): t is string => t !== null),
      )
      return doc
    },
  ],
  afterDelete: [
    ({ doc, req }) => {
      const tag = redirectTag(doc?.from)
      if (tag) purgeFor(purger, req, [tag])
      return doc
    },
  ],
})

// Manifest keys are page paths (`generatePath` in payload.config.ts: `pagePath(slug)`).
const manifestTag = (key: unknown) => (typeof key === 'string' && key ? pageTag(key) : null)

const abManifestHooks = (purger: EdgeCachePurger): Hooks => ({
  afterChange: [
    ({ doc, previousDoc, req }) => {
      const tags = [manifestTag(doc?.key), manifestTag(previousDoc?.key)]
      purgeFor(
        purger,
        req,
        tags.filter((t): t is string => t !== null),
      )
      return doc
    },
  ],
  afterDelete: [
    ({ doc, req }) => {
      const tag = manifestTag(doc?.key)
      if (tag) purgeFor(purger, req, [tag])
      return doc
    },
  ],
})

const collectionHooks: Record<string, (purger: EdgeCachePurger) => Hooks> = {
  'ab-manifest': abManifestHooks,
  authors: postRelationHooks(authorTag),
  categories: postRelationHooks(categoryTag),
  media: layoutHooks,
  pages: (purger) => publishedDocHooks('pages', pageChangeTags, purger),
  posts: (purger) => publishedDocHooks('posts', postChangeTags, purger),
  // Reusable sections (the Global section block) show on any number of pages.
  sections: layoutHooks,
  'seo-redirects': redirectHooks,
}
