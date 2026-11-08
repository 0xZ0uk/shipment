import React from 'react'

import type { StatsBlock as StatsBlockProps } from '@/payload-types'

import { SectionHeading } from '@/components/SectionHeading'
import { Card } from '@/components/ui/card'
import { cn } from '@/utilities/ui'

type Item = NonNullable<StatsBlockProps['items']>[number]

const valueClass = 'text-4xl font-medium tracking-[-0.03em] tabular-nums md:text-5xl'

/**
 * One stat: `<dt>` label, then `<dd>` value and description, in that source order (a term
 * before its definitions), with the value shown first.
 */
const Stat: React.FC<{ className?: string; item: Item }> = ({ className, item }) => (
  <div className={cn('flex flex-col gap-1.5', className)}>
    <dt className="text-sm font-medium">{item.label}</dt>
    <dd className={cn('order-first mb-2', valueClass)}>{item.value}</dd>
    {item.description && (
      <dd className="text-sm text-pretty whitespace-pre-line text-muted-foreground">
        {item.description}
      </dd>
    )}
  </div>
)

/** Hairlines between the row's cells: one column, two from `sm`, four from `lg`. */
const rowCellBorders = (index: number) =>
  cn(
    index > 0 && 'border-t',
    index % 2 === 1 ? 'sm:border-l' : 'sm:border-l-0',
    index >= 2 ? 'sm:border-t' : 'sm:border-t-0',
    index % 4 !== 0 ? 'lg:border-l' : 'lg:border-l-0',
    index >= 4 ? 'lg:border-t' : 'lg:border-t-0',
  )

export const StatsBlock: React.FC<StatsBlockProps> = ({
  description,
  eyebrow,
  items,
  title,
  variant,
}) => {
  const stats = items ?? []
  const hasHeading = Boolean(eyebrow || title || description)

  if (variant === 'split') {
    return (
      <div className="container">
        <div
          className={cn(
            'grid gap-12 lg:items-center lg:gap-16',
            hasHeading && stats.length > 0 && 'lg:grid-cols-2',
          )}
        >
          <SectionHeading align="start" description={description} eyebrow={eyebrow} title={title} />
          {stats.length > 0 && (
            <dl className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2">
              {stats.map((item, index) => (
                <Stat className="border-t pt-6" item={item} key={item.id ?? index} />
              ))}
            </dl>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="container flex flex-col gap-12 md:gap-16">
      <SectionHeading description={description} eyebrow={eyebrow} title={title} />
      {stats.length > 0 &&
        (variant === 'cards' ? (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((item, index) => (
              // The card is the <dl> group itself: label, value (shown first) and description.
              <Card className="gap-2 [--card-spacing:--spacing(6)]" key={item.id ?? index}>
                <dt className="px-(--card-spacing) text-sm font-medium text-muted-foreground">
                  {item.label}
                </dt>
                <dd className={cn('order-first px-(--card-spacing)', valueClass)}>{item.value}</dd>
                {item.description && (
                  <dd className="px-(--card-spacing) pt-1 text-sm text-pretty whitespace-pre-line text-muted-foreground">
                    {item.description}
                  </dd>
                )}
              </Card>
            ))}
          </dl>
        ) : (
          <dl className="grid border-y sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((item, index) => (
              <Stat
                className={cn('px-6 py-8 lg:py-10', rowCellBorders(index))}
                item={item}
                key={item.id ?? index}
              />
            ))}
          </dl>
        ))}
    </div>
  )
}
