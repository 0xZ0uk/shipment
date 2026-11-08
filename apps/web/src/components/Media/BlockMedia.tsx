import { ImageIcon } from 'lucide-react'
import React from 'react'

import type { Props as MediaProps } from './types'

import { useDraftMode } from '@/blocks/shared/draftMode'
import { cn } from '@/utilities/ui'

import { Media } from '.'

/**
 * Media from a block's upload field, or a placeholder while none is chosen (new blocks, the
 * gallery, examples): an image icon in draft mode, a soft gradient for visitors. Size the box
 * with `className` (e.g. `aspect-video`); the image covers it.
 */
export const BlockMedia: React.FC<
  Pick<MediaProps, 'imgClassName' | 'priority' | 'resource' | 'videoClassName'> & {
    className?: string
  }
> = ({ className, imgClassName, resource, ...props }) => {
  const draft = useDraftMode()

  if (resource && typeof resource === 'object') {
    return (
      <Media
        className={cn('relative overflow-hidden', className)}
        fill
        imgClassName={cn('object-cover', imgClassName)}
        resource={resource}
        videoClassName="absolute inset-0 size-full object-cover"
        {...props}
      />
    )
  }

  // Editors see what is missing; visitors get a quiet decorative panel, never a "no image" icon.
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex items-center justify-center bg-muted text-muted-foreground/60',
        !draft &&
          'bg-[radial-gradient(120%_90%_at_0%_0%,color-mix(in_oklab,var(--brand)_18%,transparent),transparent_60%),radial-gradient(90%_80%_at_100%_100%,color-mix(in_oklab,var(--brand)_10%,transparent),transparent_60%)]',
        className,
      )}
    >
      {draft && <ImageIcon className="size-10" strokeWidth={1.25} />}
    </div>
  )
}
