import React from 'react'

import type { SearchResult } from '@/search/types'

/**
 * A result's excerpt: the body around the matches, the matched words in `<mark>`, else the meta
 * description. Text nodes only; nothing from the index is rendered as HTML.
 */
export const ResultExcerpt: React.FC<{ className?: string; result: SearchResult }> = ({
  className,
  result,
}) => {
  const hasMatch = result.snippet.some((part) => part.match)
  if (!hasMatch && result.description)
    return <span className={className}>{result.description}</span>
  if (result.snippet.length === 0) return null
  return (
    <span className={className}>
      {result.snippet.map((part, i) =>
        part.match ? (
          <mark className="rounded-sm bg-primary/15 px-0.5 text-foreground" key={i}>
            {part.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        ),
      )}
    </span>
  )
}
