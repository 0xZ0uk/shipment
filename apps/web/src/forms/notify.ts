import type { SendEmailOptions } from 'payload'

import type { ParsedSubmission } from './validate'

export type SendEmail = (message: SendEmailOptions) => Promise<unknown>

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

/** Comma-separated addresses (FORMS_NOTIFY_EMAIL) as a list, blanks dropped. */
export const parseRecipients = (value: string | undefined | null): string[] =>
  (value ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean)

/** The owner's email for a stored submission or signup. */
export function ownerNotification(
  submission: ParsedSubmission,
  { siteName, to }: { siteName: string; to: string[] },
): SendEmailOptions {
  const rows: Array<[string, string]> =
    submission.form === 'contact'
      ? [
          ['Name', submission.data.name],
          ['Email', submission.data.email],
          ['Message', submission.data.message],
        ]
      : [
          ['Email', submission.data.email],
          ['Consent', submission.data.consent ?? ''],
        ]
  if (submission.page) rows.push(['Page', submission.page])

  const subject =
    submission.form === 'contact'
      ? `[${siteName}] New message from ${submission.data.name}`
      : `[${siteName}] New newsletter signup`

  return {
    to,
    subject,
    // Replies go to the person who wrote in.
    ...(submission.form === 'contact' ? { replyTo: submission.data.email } : {}),
    text: rows.map(([label, value]) => `${label}: ${value}`).join('\n\n'),
    html: rows
      .map(
        ([label, value]) =>
          `<p><strong>${escapeHtml(label)}</strong><br>${escapeHtml(value).replaceAll('\n', '<br>')}</p>`,
      )
      .join(''),
  }
}

/**
 * The optional "we got your message" email to a contact form's sender (FORMS_AUTORESPONDER).
 * Fixed copy only: the address is whatever was typed in, so nothing else the visitor typed
 * (their name included) goes into it, or the form would relay their text from the site's own
 * sender to anyone.
 */
export function autoresponder(
  submission: Extract<ParsedSubmission, { form: 'contact' }>,
  { siteName }: { siteName: string },
): SendEmailOptions {
  const text =
    `Hi,\n\nThanks for getting in touch. We got your message and will reply soon.\n\n` +
    siteName
  return {
    to: submission.data.email,
    subject: `We got your message – ${siteName}`,
    text,
    html: text
      .split('\n\n')
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join(''),
  }
}
