import React, { Suspense, lazy, useEffect, useState } from 'react'

import { cn } from '@/utilities/ui'

import { illustrations, type IllustrationName } from './options'

// Each mockup (and the Stageshow kit it shares) is its own chunk, fetched only by pages that
// show one.
const loaders: Record<IllustrationName, () => Promise<{ default: React.ComponentType }>> = {
  blockLibrary: () => import('./BlockLibrary'),
  onPage: () => import('./OnPage'),
  pageBuilder: () => import('./PageBuilder'),
  seoAb: () => import('./SeoAb'),
}

const components = Object.fromEntries(
  Object.entries(loaders).map(([name, load]) => [name, lazy(load)]),
) as Record<IllustrationName, React.LazyExoticComponent<React.ComponentType>>

/** The box a mockup scales into. A card keeps 4:3 in both of its designs (wide and phone). */
const slotClass = {
  card: 'aspect-[4/3] overflow-hidden rounded-xl border bg-muted',
  wide: '',
} as const

/** Space held while the chunk loads; the wide stage's phone design is taller, so it settles. */
const placeholderClass = {
  card: 'size-full',
  wide: 'aspect-[1024/540]',
} as const

export const isIllustration = (value: unknown): value is IllustrationName =>
  typeof value === 'string' && value in illustrations

/**
 * A product mockup picked in a block's "Illustration" field, drawn with Stageshow (`./kit`).
 * Decorative: hidden from assistive tech, since the block's own heading and copy say what it
 * shows. Animated mockups play once when scrolled into view and show their last frame under
 * reduced motion.
 *
 * Client only: a stage measures its container to pick its design and scale, so server HTML
 * would show it unscaled until hydration. The box holds the space until then.
 */
export const Illustration: React.FC<{ className?: string; name: IllustrationName }> = ({
  className,
  name,
}) => {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const Mockup = components[name]
  const { slot } = illustrations[name]
  const placeholder = <div className={placeholderClass[slot]} />

  return (
    <div aria-hidden="true" className={cn('relative w-full', slotClass[slot], className)}>
      {mounted ? (
        <Suspense fallback={placeholder}>
          <Mockup />
        </Suspense>
      ) : (
        placeholder
      )}
    </div>
  )
}
