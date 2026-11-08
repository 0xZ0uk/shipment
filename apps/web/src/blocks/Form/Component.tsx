import React from 'react'

import type { FormBlock as FormBlockProps } from '@/payload-types'

import { BlockMedia } from '@/components/Media/BlockMedia'
import { SectionHeading } from '@/components/SectionHeading'
import { isFormSlug } from '@/forms/definitions'

import { SiteForm } from './SiteForm'

/**
 * A contact or newsletter form (src/forms). Posts go to `/api/forms/:form` and land in FORMS_D1;
 * the Turnstile widget loads in the browser, so the page stays edge-cacheable.
 */
export const FormBlock: React.FC<FormBlockProps> = ({
  description,
  eyebrow,
  form: formSlug,
  media,
  title,
  variant,
  ...copy
}) => {
  const form = isFormSlug(formSlug) ? formSlug : 'contact'
  const heading = { description, eyebrow, title }
  const fields = {
    consent: copy.consent,
    emailLabel: copy.emailLabel,
    emailPlaceholder: copy.emailPlaceholder,
    messageLabel: copy.messageLabel,
    messagePlaceholder: copy.messagePlaceholder,
    nameLabel: copy.nameLabel,
    namePlaceholder: copy.namePlaceholder,
    submitLabel: copy.submitLabel,
    successMessage: copy.successMessage,
    successTitle: copy.successTitle,
  }

  if (variant === 'split') {
    return (
      <div className="container">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div className="flex flex-col gap-8">
            <SectionHeading {...heading} align="start" />
            <BlockMedia
              className="aspect-4/3 w-full rounded-2xl border bg-muted shadow-sm"
              resource={media}
            />
          </div>
          <div className="rounded-2xl border bg-card p-6 text-card-foreground shadow-xs md:p-8">
            <SiteForm {...fields} form={form} />
          </div>
        </div>
      </div>
    )
  }

  if (variant === 'inline') {
    return (
      <div className="container">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
          <SectionHeading {...heading} align="start" className="max-w-xl" />
          {/* One row (email and button) for the newsletter; a contact form keeps its fields. */}
          <SiteForm
            {...fields}
            className="w-full lg:max-w-md"
            form={form}
            inline={form === 'newsletter'}
          />
        </div>
      </div>
    )
  }

  // stacked (default)
  return (
    <div className="container">
      <div className="mx-auto flex max-w-xl flex-col gap-10">
        <SectionHeading {...heading} />
        <SiteForm {...fields} form={form} />
      </div>
    </div>
  )
}
