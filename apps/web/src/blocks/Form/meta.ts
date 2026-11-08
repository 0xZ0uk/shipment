import type { FormBlock } from '@/payload-types'

import { defineBlockMeta } from '../shared/meta'

export const formMeta = defineBlockMeta<FormBlock>({
  slug: 'form',
  labels: { singular: 'Form', plural: 'Forms' },
  group: 'Conversion',
  variants: [
    { label: 'Stacked', value: 'stacked' },
    { label: 'Split', value: 'split' },
    { label: 'Inline (newsletter)', value: 'inline' },
  ],
  example: {
    form: 'contact',
    eyebrow: 'Contact',
    title: 'Get in touch',
    description: 'Questions, ideas or a project in mind? Send us a message and we reply within a day.',
    nameLabel: 'Name',
    emailLabel: 'Email',
    messageLabel: 'Message',
    namePlaceholder: 'Ada Lovelace',
    emailPlaceholder: 'you@example.com',
    messagePlaceholder: 'How can we help?',
    submitLabel: 'Send message',
    successTitle: 'Thanks, message sent',
    successMessage: 'We got it and will reply to you by email soon.',
  },
})
