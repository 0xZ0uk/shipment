import { stegaClean, stegaCleanDeep } from '@shipment/onpage-core'
import React from 'react'

import type { Props as MediaProps } from '../types'

import { getMediaUrl } from '@/utilities/getMediaUrl'
import {
  buildResponsiveImageSets,
  DEFAULT_IMAGE_SIZES,
  type ResponsiveImageSet,
  responsiveImagesEnabled,
} from '@/utilities/responsiveImage'
import { cn } from '@/utilities/ui'

/**
 * Renders an upload as `<picture>`: one `<source>` per format (AVIF, then WebP) with a `srcset`
 * of resized variants from the `/img/*` route (Cloudflare Images), and the original as the
 * `<img>`, which keeps the width and height (no layout shift) and the loading priority. Pass
 * `size` (the `sizes` attribute) when the image is narrower than the viewport. SVG, GIF, static
 * `src` and the Node dev server (no Images binding) get the original only.
 */
export const ImageMedia: React.FC<MediaProps> = (props) => {
  const {
    alt: altFromProps,
    fill,
    pictureClassName,
    imgClassName,
    onLoad,
    priority,
    ref,
    resource,
    size,
    src: srcFromProps,
    loading: loadingFromProps,
  } = props

  let width: number | undefined
  let height: number | undefined
  let alt = altFromProps
  let src = srcFromProps || ''
  let sets: ResponsiveImageSet[] | null = null

  if (!src && resource && typeof resource === 'object') {
    const {
      alt: altFromResource,
      height: fullHeight,
      mimeType,
      updatedAt,
      url,
      width: fullWidth,
    } = resource

    width = fullWidth ?? undefined
    height = fullHeight ?? undefined
    alt = altFromResource || ''

    src = getMediaUrl(url, updatedAt)
    if (responsiveImagesEnabled()) {
      // On-page editing may mark text fields (`mimeType`, `filename`, `prefix`); `url`, dates
      // and `_objectKey` never are.
      const { _objectKey, filename, original, prefix } = resource
      sets = buildResponsiveImageSets(
        stegaCleanDeep({ _objectKey, filename, mimeType, original, prefix, updatedAt, url, width }),
      )
    }
  }

  const loading = loadingFromProps || (priority ? 'eager' : 'lazy')
  const sizes = sets ? size || DEFAULT_IMAGE_SIZES : size

  return (
    <picture className={cn(pictureClassName)}>
      {/* Every browser that reads `<source>` has WebP; one that has neither format gets the original. */}
      {sets?.map((set) => (
        <source key={set.format} sizes={sizes} srcSet={set.srcSet} type={set.type} />
      ))}
      <img
        // On-page editing can put invisible markers in the alt text; attributes get the clean string.
        alt={stegaClean(alt || '')}
        className={cn({ 'absolute inset-0 size-full': fill }, imgClassName)}
        decoding="async"
        fetchPriority={priority ? 'high' : undefined}
        height={!fill ? height : undefined}
        loading={loading}
        onLoad={onLoad}
        ref={ref as React.Ref<HTMLImageElement>}
        sizes={size}
        src={src}
        width={!fill ? width : undefined}
      />
    </picture>
  )
}
