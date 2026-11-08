import React, { Fragment, Suspense, use } from 'react'

import { Section } from '@/components/Section'

import {
  blockLoaders,
  collectBlockTypes,
  getLoadedBlock,
  loadBlock,
  type LayoutBlock,
} from './components'

/** A block whose chunk hasn't loaded: suspends until it has. */
const PendingBlock: React.FC<{ block: LayoutBlock }> = ({ block }) => {
  // `use` must run on every render of this component (React rejects calling it conditionally),
  // so the loaded-or-not decision is made by the parent, which re-renders when the chunk arrives.
  const Block = use(loadBlock(block.blockType))
  return <Block {...block} />
}

/**
 * One block's component. Loaded ones (the page routes' loaders preload them) render right
 * away, so the server's HTML and client navigations never suspend. Otherwise the chunk is
 * fetched here: during the first hydration React keeps the server's HTML in place until it
 * arrives (no fallback is shown), and in live preview a block type the page didn't have yet
 * appears once its chunk loads.
 */
const BlockContent: React.FC<{ block: LayoutBlock }> = ({ block }) => {
  const Block = getLoadedBlock(block.blockType)
  return Block ? <Block {...block} /> : <PendingBlock block={block} />
}

/** Renders a layout: each block inside its `Section` (background, spacing, anchor). */
export const RenderBlocks: React.FC<{ blocks?: LayoutBlock[] | null }> = ({ blocks }) => {
  if (!blocks?.length) return null

  // Start every missing chunk at once, so a hydrating page fetches them in parallel instead of
  // one after another as React reaches each block.
  for (const type of collectBlockTypes(blocks)) {
    if (Object.hasOwn(blockLoaders, type) && !getLoadedBlock(type)) loadBlock(type).catch(() => {})
  }

  return (
    <Fragment>
      {blocks.map((block, index) => {
        // A block type that's no longer registered (stale data) renders nothing.
        if (!Object.hasOwn(blockLoaders, block.blockType)) return null

        const key = block.id ?? index
        // The boundary is in the server's HTML too (as markers), which hydration expects.
        const content = (
          <Suspense fallback={null}>
            <BlockContent block={block} />
          </Suspense>
        )

        // Blocks without section settings (a reusable section's wrapper) render their own.
        return 'section' in block ? (
          <Section blockType={block.blockType} key={key} settings={block.section}>
            {content}
          </Section>
        ) : (
          <Fragment key={key}>{content}</Fragment>
        )
      })}
    </Fragment>
  )
}
