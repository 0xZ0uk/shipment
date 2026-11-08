import type { Payload, SendEmailOptions } from 'payload'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEmailAdapter } from '@/email'

const payload = {} as Payload

// What Payload's forgot-password operation passes to `sendEmail` (auth/operations/forgotPassword).
const forgotPassword: SendEmailOptions = {
  from: '"Shipment" <no-reply@example.com>',
  html: '<p>Reset your password: <a href="https://example.com/admin/reset/abc">link</a></p>',
  subject: 'Reset your password',
  to: 'editor@example.com',
}

const fakeBinding = () => {
  const send = vi.fn(async (_message: EmailMessageBuilder) => ({ messageId: 'msg-1' }))
  return { binding: { send } as unknown as SendEmail, send }
}

describe('email adapter: Cloudflare Email Service (EMAIL binding)', () => {
  it("sends Payload's forgot-password email through the binding", async () => {
    const { binding, send } = fakeBinding()
    const adapter = createEmailAdapter({
      binding,
      fromAddress: 'no-reply@example.com',
      fromName: 'Shipment',
      resendApiKey: 're_ignored_when_the_binding_exists',
    })!({ payload })

    expect(adapter.name).toBe('cloudflare')
    expect(adapter.defaultFromAddress).toBe('no-reply@example.com')
    expect(adapter.defaultFromName).toBe('Shipment')
    await expect(adapter.sendEmail(forgotPassword)).resolves.toEqual({ messageId: 'msg-1' })
    expect(send).toHaveBeenCalledWith({
      from: { email: 'no-reply@example.com', name: 'Shipment' },
      to: ['editor@example.com'],
      subject: 'Reset your password',
      html: forgotPassword.html,
    })
  })

  it('defaults the sender and maps lists, named addresses, cc, reply-to and text', async () => {
    const { binding, send } = fakeBinding()
    const adapter = createEmailAdapter({
      binding,
      fromAddress: 'no-reply@example.com',
      fromName: 'Shipment',
    })!({ payload })

    // The SEO alerts digest sends `to` as an array and no `from`.
    await adapter.sendEmail({
      to: ['a@example.com', '"Doe, Jane" <jane@example.com>'],
      cc: 'b@example.com, Ops <ops@example.com>',
      replyTo: { name: 'Support', address: 'support@example.com' },
      subject: 'SEO alert digest',
      html: '<p>2 issues</p>',
      text: '2 issues',
    })
    expect(send).toHaveBeenCalledWith({
      from: { email: 'no-reply@example.com', name: 'Shipment' },
      to: ['a@example.com', { email: 'jane@example.com', name: 'Doe, Jane' }],
      cc: ['b@example.com', { email: 'ops@example.com', name: 'Ops' }],
      replyTo: { email: 'support@example.com', name: 'Support' },
      subject: 'SEO alert digest',
      html: '<p>2 issues</p>',
      text: '2 issues',
    })
  })

  it('fails every send, naming the variable, while EMAIL_FROM_ADDRESS is missing', async () => {
    const { binding, send } = fakeBinding()
    const adapter = createEmailAdapter({ binding, fromName: 'Shipment' })!({ payload })

    await expect(adapter.sendEmail(forgotPassword)).rejects.toThrow(/EMAIL_FROM_ADDRESS/)
    expect(send).not.toHaveBeenCalled()
  })

  it('surfaces binding errors (e.g. a domain not onboarded) to the caller', async () => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error('Domain not onboarded'), {
        code: 'E_SENDER_DOMAIN_NOT_AVAILABLE',
      })
    })
    const adapter = createEmailAdapter({
      binding: { send } as unknown as SendEmail,
      fromAddress: 'no-reply@example.com',
      fromName: 'Shipment',
    })!({ payload })

    await expect(adapter.sendEmail(forgotPassword)).rejects.toThrow('Domain not onboarded')
  })
})

describe('email adapter: Resend (RESEND_API_KEY)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("posts Payload's forgot-password email to Resend's API", async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json({ id: 'resend-1' }),
    )
    vi.stubGlobal('fetch', fetch)
    const adapter = createEmailAdapter({
      fromAddress: 'no-reply@example.com',
      fromName: 'Shipment',
      resendApiKey: 're_test',
    })!({ payload })

    expect(adapter.name).toBe('resend-rest')
    await expect(adapter.sendEmail({ ...forgotPassword, text: 'Reset' })).resolves.toEqual({
      id: 'resend-1',
    })
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer re_test')
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: '"Shipment" <no-reply@example.com>',
      to: 'editor@example.com',
      subject: 'Reset your password',
      html: forgotPassword.html,
      text: 'Reset',
    })
  })

  it('fails every send without calling Resend while EMAIL_FROM_ADDRESS is missing', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const adapter = createEmailAdapter({ fromName: 'Shipment', resendApiKey: 're_test' })!({
      payload,
    })

    expect(adapter.name).toBe('resend-rest')
    await expect(adapter.sendEmail(forgotPassword)).rejects.toThrow(/EMAIL_FROM_ADDRESS/)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('email adapter: nothing configured', () => {
  it("returns undefined, so Payload keeps its console adapter", () => {
    expect(createEmailAdapter({ fromName: 'Shipment' })).toBeUndefined()
    expect(createEmailAdapter({ fromAddress: 'no-reply@example.com', fromName: 'Shipment' })).toBe(
      undefined,
    )
  })
})
