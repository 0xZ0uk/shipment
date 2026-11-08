import { resendAdapter } from '@payloadcms/email-resend'
import type { EmailAdapter, SendEmailOptions } from 'payload'

/**
 * Payload's email transport (`email` in payload.config.ts), picked by what is configured:
 *
 * 1. The `EMAIL` send_email binding (Cloudflare Email Service): no API key, sends to any
 *    address once the sender's domain is onboarded to Email Sending (Workers Paid).
 * 2. `RESEND_API_KEY`: Resend's HTTP API (the stock `@payloadcms/email-resend` adapter).
 * 3. Neither: `undefined`, and Payload keeps its console adapter, which logs every email
 *    (forgot-password links included) instead of sending it. Local dev and CI need nothing.
 *
 * Both transports send from `EMAIL_FROM_ADDRESS`, an address on a domain the transport has
 * verified. Without it the adapter still loads (so a missing variable can't take the Worker
 * down) but every send fails with an error that names the variable. See README, "Email".
 */
export type EmailSettings = {
  /** The `EMAIL` send_email binding, when wrangler.jsonc declares it. */
  binding?: SendEmail
  resendApiKey?: string
  fromAddress?: string
  fromName: string
}

const missingFrom = (transport: string) =>
  `Email is configured (${transport}) but EMAIL_FROM_ADDRESS is not set: set it to an address ` +
  'on a domain the transport has verified.'

export function createEmailAdapter(settings: EmailSettings): EmailAdapter | undefined {
  const { binding, fromAddress = '', fromName, resendApiKey } = settings

  if (binding) {
    return () => ({
      name: 'cloudflare',
      defaultFromAddress: fromAddress,
      defaultFromName: fromName,
      sendEmail: async (message) => {
        if (!fromAddress) throw new Error(missingFrom('the EMAIL binding'))
        return binding.send(toCloudflareMessage(message, { email: fromAddress, name: fromName }))
      },
    })
  }

  if (resendApiKey) {
    const resend = resendAdapter({
      apiKey: resendApiKey,
      defaultFromAddress: fromAddress,
      defaultFromName: fromName,
    })
    if (fromAddress) return resend
    return (args) => ({
      ...resend(args),
      sendEmail: async () => {
        throw new Error(missingFrom('RESEND_API_KEY'))
      },
    })
  }

  return undefined
}

type NodemailerAddress = string | { name: string; address: string }
type AddressField = NodemailerAddress | NodemailerAddress[] | undefined

// The binding takes a bare address as a string and a named one as `{ email, name }`.
type Address = string | EmailAddress

// `"Name" <user@example.com>` or `Name <user@example.com>`; anything else is a bare address.
const NAMED_ADDRESS = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/

function parseAddress(value: NodemailerAddress): Address {
  if (typeof value !== 'string') {
    return value.name ? { email: value.address, name: value.name } : value.address
  }
  const match = NAMED_ADDRESS.exec(value)
  if (!match) return value.trim()
  const [, name, email] = match
  return name ? { email: email.trim(), name } : email.trim()
}

// Nodemailer also accepts a comma-separated list in one string. Commas inside a quoted
// display name ("Doe, Jane" <jane@example.com>) don't split.
function parseAddresses(field: AddressField): Address[] {
  if (!field) return []
  const values = Array.isArray(field) ? field : [field]
  return values.flatMap((value) =>
    typeof value === 'string'
      ? value
          .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
          .filter((part) => part.trim())
          .map(parseAddress)
      : [parseAddress(value)],
  )
}

// Payload sends strings; Nodemailer also allows a Buffer. Streams and paths aren't read.
const text = (value: SendEmailOptions['html']) =>
  typeof value === 'string'
    ? value
    : value instanceof Uint8Array
      ? new TextDecoder().decode(value)
      : undefined

/** Payload's (Nodemailer-shaped) message as the binding's structured `send()` input. */
export function toCloudflareMessage(
  message: SendEmailOptions,
  defaultFrom: EmailAddress,
): EmailMessageBuilder {
  if (message.attachments?.length) {
    throw new Error('Attachments are not supported by the Cloudflare email adapter yet.')
  }
  const to = parseAddresses(message.to as AddressField)
  const cc = parseAddresses(message.cc as AddressField)
  const bcc = parseAddresses(message.bcc as AddressField)
  const [from = defaultFrom] = parseAddresses(message.from as AddressField)
  const [replyTo] = parseAddresses(message.replyTo as AddressField)
  const html = text(message.html)
  const plain = text(message.text)

  return {
    from,
    subject: message.subject ?? '',
    to,
    ...(cc.length ? { cc } : {}),
    ...(bcc.length ? { bcc } : {}),
    ...(replyTo ? { replyTo } : {}),
    ...(html ? { html } : {}),
    ...(plain ? { text: plain } : {}),
  }
}
