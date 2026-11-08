import React from 'react'

import { siteName } from '@/utilities/siteName'
import { cn } from '@/utilities/ui'

/**
 * The site's mark and name. Inline SVG and text in the current colour, so it needs no request
 * and works on light and dark backgrounds. Replace the mark with your own.
 */
export const Logo: React.FC<{ className?: string }> = ({ className }) => (
  <span className={cn('inline-flex items-center gap-2 text-lg font-semibold', className)}>
    <svg aria-hidden="true" className="size-7 shrink-0" fill="none" viewBox="0 0 28 28">
      <rect fill="currentColor" height="28" rx="8" width="28" />
      <path
        className="text-background"
        d="M8.5 11.5 14 8.5l5.5 3v5L14 19.5l-5.5-3v-5Zm0 0L14 14.5m0 0 5.5-3M14 14.5v5"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    </svg>
    <span className="tracking-[-0.02em]">{siteName}</span>
  </span>
)
