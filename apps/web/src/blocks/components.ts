/**
 * Client registry: how to load the component of each block type. Typed against the generated
 * `Page` type, so a block in the config without an entry here (or the other way round) fails
 * `pnpm web typecheck`.
 *
 * Each block is its own chunk, fetched only when a page's layout names it. `preloadBlocks`
 * (the page routes' loaders) fetches the chunks before the page renders, on the server and on
 * client navigations, so `RenderBlocks` renders them synchronously. Only a block type that
 * shows up without a preload (the first hydration, or a block an editor adds in live preview)
 * falls back to `RenderBlocks`' Suspense boundary.
 */
import type React from 'react'

import type { Page } from '@/payload-types'

export type LayoutBlock = NonNullable<Page['layout']>[number]
export type LayoutBlockType = LayoutBlock['blockType']

type BlockComponent<K extends LayoutBlockType> = React.ComponentType<
  Extract<LayoutBlock, { blockType: K }>
>

export type BlockLoaders = {
  [K in LayoutBlockType]: () => Promise<BlockComponent<K>>
}

export const blockLoaders: BlockLoaders = {
  hero: () => import('./Hero/Component').then((m) => m.HeroBlock),
  pageHeader: () => import('./PageHeader/Component').then((m) => m.PageHeaderBlock),
  richText: () => import('./RichText/Component').then((m) => m.RichTextBlock),
  postsArchive: () => import('./PostsArchive/Component').then((m) => m.PostsArchiveBlock),
  faq: () => import('./Faq/Component').then((m) => m.FaqBlock),
  features: () => import('./Features/Component').then((m) => m.FeaturesBlock),
  featureRows: () => import('./FeatureRows/Component').then((m) => m.FeatureRowsBlock),
  steps: () => import('./Steps/Component').then((m) => m.StepsBlock),
  testimonials: () => import('./Testimonials/Component').then((m) => m.TestimonialsBlock),
  reviews: () => import('./Reviews/Component').then((m) => m.ReviewsBlock),
  logos: () => import('./Logos/Component').then((m) => m.LogosBlock),
  stats: () => import('./Stats/Component').then((m) => m.StatsBlock),
  cta: () => import('./Cta/Component').then((m) => m.CtaBlock),
  pricing: () => import('./Pricing/Component').then((m) => m.PricingBlock),
  mediaBlock: () => import('./MediaBlock/Component').then((m) => m.MediaBlock),
  gallery: () => import('./Gallery/Component').then((m) => m.GalleryBlock),
  embed: () => import('./Embed/Component').then((m) => m.EmbedBlock),
  columns: () => import('./Columns/Component').then((m) => m.ColumnsBlock),
  globalSection: () => import('./GlobalSection/Component').then((m) => m.GlobalSectionBlock),
}

type AnyBlockComponent = React.ComponentType<LayoutBlock>

const loaded = new Map<LayoutBlockType, AnyBlockComponent>()
const loading = new Map<LayoutBlockType, Promise<AnyBlockComponent>>()

/** The component of `type` if its chunk has loaded, else `undefined`. */
export const getLoadedBlock = (type: LayoutBlockType): AnyBlockComponent | undefined =>
  loaded.get(type)

/**
 * Loads the component of `type` (once; the promise is shared). Rejects for a type with no
 * loader, and after a failed load forgets the attempt so the next call retries.
 */
export const loadBlock = (type: LayoutBlockType): Promise<AnyBlockComponent> => {
  const pending = loading.get(type)
  if (pending) return pending

  const loader = (blockLoaders as Partial<Record<string, () => Promise<unknown>>>)[type]
  if (!loader) return Promise.reject(new Error(`Unknown block type "${type}"`))

  const promise = loader().then(
    (component) => {
      loaded.set(type, component as AnyBlockComponent)
      return component as AnyBlockComponent
    },
    (error: unknown) => {
      loading.delete(type)
      // In the browser a failed chunk is most likely a tab left open across a deploy (the old
      // hashed chunks are gone): reload once to get the current deploy's assets, and keep the
      // block suspended meanwhile instead of replacing the page with the error screen.
      const reloaded =
        typeof window !== 'undefined' &&
        reloadForStaleChunk(window.sessionStorage, () => window.location.reload())
      if (reloaded) return new Promise<never>(() => {})
      throw error
    },
  )
  loading.set(type, promise)
  return promise
}

const STALE_CHUNK_RELOAD_KEY = 'blocks:stale-chunk-reload'
/** Within this long after a reload, another failure is a real error, not a stale tab. */
const STALE_CHUNK_RELOAD_WINDOW_MS = 60_000

/**
 * Reloads the page once for a failed block chunk, unless it already did so within the last
 * minute (so a chunk that's really missing errors instead of reloading in a loop). Returns
 * whether it reloaded. Storage errors (private mode, blocked storage) mean no reload.
 */
export const reloadForStaleChunk = (
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  reload: () => void,
  now = Date.now(),
): boolean => {
  try {
    const last = Number(storage.getItem(STALE_CHUNK_RELOAD_KEY))
    if (last && now - last < STALE_CHUNK_RELOAD_WINDOW_MS) return false
    storage.setItem(STALE_CHUNK_RELOAD_KEY, String(now))
  } catch {
    return false
  }
  reload()
  return true
}

/**
 * The block types of a layout, reusable sections' blocks included (a `globalSection` block
 * renders the layout of the section it points to, when populated).
 */
export const collectBlockTypes = (
  blocks: readonly LayoutBlock[] | null | undefined,
  into = new Set<LayoutBlockType>(),
): Set<LayoutBlockType> => {
  for (const block of blocks ?? []) {
    into.add(block.blockType)
    if (block.blockType === 'globalSection' && typeof block.reusableSection === 'object') {
      collectBlockTypes(block.reusableSection?.layout, into)
    }
  }
  return into
}

/** Loads the components of `types` in parallel. Never rejects: a failed chunk surfaces on render. */
export const preloadBlockTypes = async (types: Iterable<LayoutBlockType>): Promise<void> => {
  await Promise.allSettled([...types].map(loadBlock))
}

/** Loads the components a layout uses, before it renders. */
export const preloadBlocks = (blocks: readonly LayoutBlock[] | null | undefined): Promise<void> =>
  preloadBlockTypes(collectBlockTypes(blocks))
