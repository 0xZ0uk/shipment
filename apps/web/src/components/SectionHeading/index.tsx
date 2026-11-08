import React from 'react'

import { cn } from '@/utilities/ui'

/**
 * A section's eyebrow, title and description (`headingFields()`). Renders nothing when all
 * three are empty. Each string is in its own element, so the on-page editor maps each to its
 * field.
 */
export const SectionHeading: React.FC<{
  align?: 'center' | 'start'
  /** `h1` only for the page's hero; every other section is `h2`. */
  as?: 'h1' | 'h2'
  className?: string
  description?: string | null
  eyebrow?: string | null
  title?: string | null
}> = ({ align = 'center', as: Heading = 'h2', className, description, eyebrow, title }) => {
  if (!eyebrow && !title && !description) return null

  const hero = Heading === 'h1'

  return (
    <div
      className={cn(
        'flex max-w-2xl flex-col gap-4',
        align === 'center' && 'mx-auto items-center text-center',
        className,
      )}
    >
      {eyebrow &&
        (hero ? (
          // The hero's eyebrow is a pill, like an announcement.
          <p className="inline-flex items-center gap-2 rounded-full border bg-background py-1 pr-3 pl-2 text-sm font-medium text-foreground shadow-xs">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
            <span>{eyebrow}</span>
          </p>
        ) : (
          <p className="text-sm font-medium text-brand">{eyebrow}</p>
        ))}
      {title && (
        <Heading
          className={cn(
            'text-balance',
            hero
              ? 'text-4xl leading-[1.05] font-semibold tracking-[-0.035em] sm:text-5xl md:text-7xl'
              : 'text-3xl leading-[1.1] font-medium tracking-[-0.03em] sm:text-4xl md:text-5xl',
          )}
        >
          {title}
        </Heading>
      )}
      {description && (
        <p
          className={cn(
            'text-pretty whitespace-pre-line text-muted-foreground',
            hero ? 'max-w-2xl text-lg md:text-xl' : 'max-w-xl text-lg',
          )}
        >
          {description}
        </p>
      )}
    </div>
  )
}
