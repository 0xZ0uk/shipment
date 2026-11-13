import type { GlobalConfig } from 'payload'

import { editors } from '@/access/roles'

import { defaultCookieConsentCopy } from '@/components/CookieConsent/copy'
import { link } from '@/fields/link'

export const Footer: GlobalConfig = {
  slug: 'footer',
  access: {
    read: () => true,
    update: editors,
  },
  fields: [
    {
      name: 'navItems',
      type: 'array',
      fields: [
        link({
          appearances: false,
        }),
      ],
      maxRows: 6,
      admin: {
        initCollapsed: true,
        components: {
          RowLabel: '@/Footer/RowLabel#RowLabel',
        },
      },
    },
    {
      name: 'cookieConsent',
      type: 'group',
      admin: {
        description:
          'The cookie banner, shown before Google Analytics loads (only when GA_MEASUREMENT_ID ' +
          'is set). Empty fields use the default text.',
      },
      label: 'Cookie consent',
      fields: [
        {
          name: 'title',
          type: 'text',
          localized: true,
          admin: { placeholder: defaultCookieConsentCopy.title },
        },
        {
          name: 'description',
          type: 'textarea',
          localized: true,
          admin: { placeholder: defaultCookieConsentCopy.description },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'acceptLabel',
              type: 'text',
              localized: true,
              admin: { placeholder: defaultCookieConsentCopy.acceptLabel, width: '33%' },
              label: 'Accept button',
            },
            {
              name: 'rejectLabel',
              type: 'text',
              localized: true,
              admin: { placeholder: defaultCookieConsentCopy.rejectLabel, width: '33%' },
              label: 'Reject button',
            },
            {
              name: 'settingsLabel',
              type: 'text',
              localized: true,
              admin: {
                description: 'The footer link that reopens the banner.',
                placeholder: defaultCookieConsentCopy.settingsLabel,
                width: '33%',
              },
              label: 'Settings link',
            },
          ],
        },
        {
          name: 'enablePrivacyLink',
          type: 'checkbox',
          label: 'Link to a privacy policy',
        },
        link({
          appearances: false,
          overrides: {
            name: 'privacyLink',
            admin: { condition: (_, siblingData) => Boolean(siblingData?.enablePrivacyLink) },
            label: 'Privacy policy link',
          },
        }),
      ],
    },
  ],
  versions: false,
}
