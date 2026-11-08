import type { Field } from 'payload'

import { defineBlock } from '../shared/defineBlock'
import { headingFields, mediaField } from '../shared/fields'

import { formMeta } from './meta'
import { formThumbnail } from './thumbnail'

type FormData = { form?: string; variant?: string }

const isContact = (_: unknown, siblingData: FormData) => siblingData?.form !== 'newsletter'
const isNewsletter = (_: unknown, siblingData: FormData) => siblingData?.form === 'newsletter'

const text = (name: string, label: string, extra: Partial<Field> = {}): Field =>
  ({ name, type: 'text', label, ...extra }) as Field

export const FormConfig = defineBlock({
  meta: formMeta,
  interfaceName: 'FormBlock',
  thumbnail: formThumbnail,
  fields: [
    {
      name: 'form',
      type: 'select',
      defaultValue: 'contact',
      options: [
        { label: 'Contact (name, email, message)', value: 'contact' },
        { label: 'Newsletter (email)', value: 'newsletter' },
      ],
      required: true,
      admin: {
        description:
          'Contact messages and newsletter signups are listed under Forms in the sidebar, never in this page.',
      },
    },
    ...headingFields(),
    mediaField({
      admin: {
        condition: (_, siblingData: FormData) => siblingData?.variant === 'split',
        description: 'Shown beside the form.',
      },
    }),
    {
      type: 'collapsible',
      label: 'Fields',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            text('nameLabel', 'Name label', { admin: { condition: isContact } }),
            text('emailLabel', 'Email label'),
            text('messageLabel', 'Message label', { admin: { condition: isContact } }),
          ],
        },
        {
          type: 'row',
          fields: [
            text('namePlaceholder', 'Name placeholder', { admin: { condition: isContact } }),
            text('emailPlaceholder', 'Email placeholder'),
            text('messagePlaceholder', 'Message placeholder', { admin: { condition: isContact } }),
          ],
        },
        {
          name: 'consent',
          type: 'textarea',
          label: 'Consent checkbox',
          admin: {
            condition: isNewsletter,
            description:
              'Optional. When set, visitors tick it to subscribe, and this text is stored with their signup as proof of consent.',
          },
        },
        text('submitLabel', 'Button'),
      ],
    },
    {
      type: 'collapsible',
      label: 'After sending',
      admin: { initCollapsed: true },
      fields: [text('successTitle', 'Success title'), text('successMessage', 'Success message')],
    },
  ],
})
