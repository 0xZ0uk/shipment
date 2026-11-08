import { stegaClean } from '@shipment/onpage-core'
import React, { useEffect, useId, useRef, useState } from 'react'

import type { FormBlock } from '@/payload-types'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  formEndpoint,
  HONEYPOT_FIELD,
  type FormResponse,
  type FormSlug,
} from '@/forms/definitions'
import { loadSiteKey, loadTurnstile, type TurnstileApi } from '@/forms/turnstileClient'
import { cn } from '@/utilities/ui'

type Status = 'idle' | 'sending' | 'sent'
type FieldName = 'email' | 'message' | 'name'

const FIELD_MESSAGES: Record<string, string> = {
  required: 'Please fill this in.',
  invalid: 'Please check this.',
  too_long: 'This is too long.',
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid: 'Please check the highlighted fields.',
  not_configured: "This form isn't available right now.",
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
  verification_failed: "We couldn't verify you're human. Please try again.",
  verifying: 'One moment: we are still checking you are human. Try again in a few seconds.',
}
const GENERIC_ERROR = 'Something went wrong. Please try again.'
// Automatic retries of a failed site key fetch (2 s, 4 s, 8 s), on top of one per submit.
const KEY_RETRIES = 3

/** The `/api/forms` answers after which the Turnstile token was spent and needs a new one. */
const spendsToken = (status: number) => status !== 400 && status !== 429

/**
 * The form itself: fields, the Turnstile widget and the submit flow. The server renders the
 * fields (the same HTML for every visitor); the site key, Cloudflare's script and the widget
 * load in the browser after hydration. When the site has no Turnstile keys, the fields are
 * swapped for a notice: the endpoint would refuse the post anyway.
 */
export const SiteForm: React.FC<
  Pick<
    FormBlock,
    | 'consent'
    | 'emailLabel'
    | 'emailPlaceholder'
    | 'messageLabel'
    | 'messagePlaceholder'
    | 'nameLabel'
    | 'namePlaceholder'
    | 'submitLabel'
    | 'successMessage'
    | 'successTitle'
  > & { className?: string; form: FormSlug; inline?: boolean }
> = ({
  className,
  consent,
  emailLabel,
  emailPlaceholder,
  form,
  inline = false,
  messageLabel,
  messagePlaceholder,
  nameLabel,
  namePlaceholder,
  submitLabel,
  successMessage,
  successTitle,
}) => {
  const id = useId()
  const widgetRef = useRef<HTMLDivElement>(null)
  const turnstile = useRef<{ api: TurnstileApi; widgetId?: string } | null>(null)
  const [siteKey, setSiteKey] = useState<string | null | undefined>(undefined)
  // Bumped to fetch the site key again after a failed attempt (a blip must not break the form).
  const [keyAttempt, setKeyAttempt] = useState(0)
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [consented, setConsented] = useState(false)

  const contact = form === 'contact'
  const consentText = consent && stegaClean(consent).trim() ? consent : null

  useEffect(() => {
    let active = true
    let retry: ReturnType<typeof setTimeout> | undefined
    loadSiteKey().then(
      (key) => active && setSiteKey(key),
      // Unknown (offline, a blip): keep the form and try again a few times, backing off; a
      // submit also tries again (below).
      () => {
        if (active && keyAttempt < KEY_RETRIES) {
          retry = setTimeout(() => setKeyAttempt((n) => n + 1), 2000 * 2 ** keyAttempt)
        }
      },
    )
    return () => {
      active = false
      clearTimeout(retry)
    }
  }, [keyAttempt])

  useEffect(() => {
    const container = widgetRef.current
    if (!siteKey || !container) return
    let removed = false
    loadTurnstile().then(
      (api) => {
        if (removed) return
        const widgetId = api.render(container, {
          sitekey: siteKey,
          action: form,
          theme: 'auto',
          callback: setToken,
          'expired-callback': () => setToken(''),
          'error-callback': () => setToken(''),
        })
        turnstile.current = { api, widgetId }
      },
      () => setError(GENERIC_ERROR),
    )
    return () => {
      removed = true
      const current = turnstile.current
      turnstile.current = null
      if (current) current.api.remove(current.widgetId)
    }
  }, [form, siteKey])

  const resetWidget = () => {
    setToken('')
    const current = turnstile.current
    if (current) current.api.reset(current.widgetId)
  }

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status === 'sending') return
    if (!token) {
      setError(siteKey === null ? ERROR_MESSAGES.not_configured! : ERROR_MESSAGES.verifying!)
      // The site key never arrived: fetch it again, so the widget can still appear.
      if (siteKey === undefined) setKeyAttempt((n) => n + 1)
      return
    }
    const data = new FormData(event.currentTarget)
    const body = {
      name: data.get('name') ?? undefined,
      email: data.get('email') ?? undefined,
      message: data.get('message') ?? undefined,
      consent: consentText && consented ? stegaClean(consentText) : undefined,
      page: window.location.pathname,
      token,
      [HONEYPOT_FIELD]: data.get(HONEYPOT_FIELD) ?? '',
    }

    setStatus('sending')
    setError(null)
    setFieldErrors({})
    try {
      const res = await fetch(formEndpoint(form), {
        body: JSON.stringify(body),
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const result = (await res.json().catch(() => null)) as FormResponse | null
      if (spendsToken(res.status)) resetWidget()
      if (res.ok && result?.ok) {
        setStatus('sent')
        return
      }
      const code = result && !result.ok ? result.error : null
      if (result && !result.ok && result.fields) setFieldErrors(result.fields)
      setError((code && ERROR_MESSAGES[code]) || GENERIC_ERROR)
      if (code === 'not_configured') setSiteKey(null)
    } catch {
      setError(GENERIC_ERROR)
    }
    setStatus('idle')
  }

  if (status === 'sent') {
    return (
      <div
        className={cn('flex flex-col gap-2 rounded-xl border bg-card p-6 text-card-foreground', className)}
        role="status"
      >
        <p className="text-lg font-semibold">{successTitle || 'Thank you!'}</p>
        {(successMessage || !successTitle) && (
          <p className="text-muted-foreground">
            {successMessage ||
              (contact ? 'Your message was sent.' : 'You are on the list.')}
          </p>
        )}
      </div>
    )
  }

  if (siteKey === null) {
    return (
      <p className={cn('rounded-xl border bg-muted p-6 text-muted-foreground', className)} role="status">
        {ERROR_MESSAGES.not_configured}
      </p>
    )
  }

  const fieldError = (name: FieldName) =>
    fieldErrors[name] ? (FIELD_MESSAGES[fieldErrors[name]!] ?? FIELD_MESSAGES.invalid) : null

  const emailField = (
    <Field data-invalid={fieldError('email') ? true : undefined}>
      <FieldLabel className={cn(inline && 'sr-only')} htmlFor={`${id}-email`}>
        {emailLabel || 'Email'}
      </FieldLabel>
      <Input
        aria-invalid={fieldError('email') ? true : undefined}
        autoComplete="email"
        id={`${id}-email`}
        maxLength={254}
        name="email"
        placeholder={emailPlaceholder ? stegaClean(emailPlaceholder) : undefined}
        required
        type="email"
      />
      {fieldError('email') && <FieldError>{fieldError('email')}</FieldError>}
    </Field>
  )

  const submit = (
    <Button className={cn(!inline && 'self-start')} disabled={status === 'sending'} size="lg" type="submit">
      {submitLabel || (contact ? 'Send message' : 'Subscribe')}
    </Button>
  )

  return (
    <form
      className={cn('flex flex-col gap-4', className)}
      data-form={form}
      onSubmit={onSubmit}
    >
      {/* Honeypot: off-screen and out of the tab order; people never fill it in, bots do. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-${HONEYPOT_FIELD}`}>Leave this empty</label>
        <input
          autoComplete="off"
          id={`${id}-${HONEYPOT_FIELD}`}
          name={HONEYPOT_FIELD}
          tabIndex={-1}
          type="text"
        />
      </div>

      {contact ? (
        <FieldGroup className="gap-4">
          <Field data-invalid={fieldError('name') ? true : undefined}>
            <FieldLabel htmlFor={`${id}-name`}>{nameLabel || 'Name'}</FieldLabel>
            <Input
              aria-invalid={fieldError('name') ? true : undefined}
              autoComplete="name"
              id={`${id}-name`}
              maxLength={200}
              name="name"
              placeholder={namePlaceholder ? stegaClean(namePlaceholder) : undefined}
              required
            />
            {fieldError('name') && <FieldError>{fieldError('name')}</FieldError>}
          </Field>
          {emailField}
          <Field data-invalid={fieldError('message') ? true : undefined}>
            <FieldLabel htmlFor={`${id}-message`}>{messageLabel || 'Message'}</FieldLabel>
            <Textarea
              aria-invalid={fieldError('message') ? true : undefined}
              className="min-h-32"
              id={`${id}-message`}
              maxLength={5000}
              name="message"
              placeholder={messagePlaceholder ? stegaClean(messagePlaceholder) : undefined}
              required
            />
            {fieldError('message') && <FieldError>{fieldError('message')}</FieldError>}
          </Field>
        </FieldGroup>
      ) : inline ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">{emailField}</div>
          {submit}
        </div>
      ) : (
        emailField
      )}

      {!contact && consentText && (
        <Field orientation="horizontal">
          <Checkbox
            checked={consented}
            id={`${id}-consent`}
            onCheckedChange={(checked) => setConsented(checked)}
            required
          />
          <FieldLabel className="font-normal text-muted-foreground" htmlFor={`${id}-consent`}>
            {consentText}
          </FieldLabel>
        </Field>
      )}

      {/* Turnstile renders here (managed: usually no interaction). */}
      <div className="min-h-[65px] empty:min-h-0" ref={widgetRef} />

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {!(inline && !contact) && submit}
    </form>
  )
}
