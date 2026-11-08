import React, { createContext, useCallback, useContext, useEffect, useId, useRef } from 'react'

import type { Footer } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  type ConsentChoice,
  consentCookie,
  expiredAnalyticsCookies,
  readConsent,
} from '@/utilities/cookieConsent'

import { defaultCookieConsentCopy } from './copy'

export { defaultCookieConsentCopy }

export type CookieConsentCopy = NonNullable<Footer['cookieConsent']>

type ConsentState = {
  /**
   * The visitor's choice, read from the cookie after hydration. Null on the server, before the
   * first effect, and while the visitor hasn't chosen: analytics loads only on `granted`.
   */
  choice: ConsentChoice | null
  /**
   * The GA4 id this view may load (the page loader's `gaMeasurementId`: null for drafts, 404s
   * and when GA isn't configured). Without it there is no banner and no "Cookie settings" link.
   */
  measurementId: string | null
}

type ConsentContextValue = ConsentState & {
  /** Reopens the banner; focus goes back to `trigger` when it closes. */
  openSettings: (trigger?: HTMLElement | null) => void
}

/** Exported for tests, which render a given choice without a browser cookie. */
export const ConsentContext = createContext<ConsentContextValue>({
  choice: null,
  measurementId: null,
  openSettings: () => {},
})

export const useConsent = () => useContext(ConsentContext)

type GaWindow = Record<`ga-disable-${string}`, boolean | undefined>

const BANNER_SELECTOR = '[data-test="cookie-banner"]'

/**
 * Holds the visitor's analytics consent (GA4 in Basic mode: nothing from Google loads before
 * "Accept") and renders the banner. The choice lives in a first-party cookie
 * (`@/utilities/cookieConsent`) read only here, in an effect: the server renders the same HTML
 * for everyone (no banner, no choice), so pages stay cacheable at the edge, where cookies aren't
 * part of the cache key. The banner appears after hydration, fixed over the page (no layout
 * shift), and only when this view may load GA.
 */
export function ConsentProvider({
  children,
  copy,
  measurementId,
}: {
  children: React.ReactNode
  copy?: CookieConsentCopy | null
  measurementId: string | null
}) {
  const [choice, setChoice] = React.useState<ConsentChoice | null>(null)
  // False until the cookie has been read: the banner never flashes for a returning visitor.
  const [ready, setReady] = React.useState(false)
  // Reopened from "Cookie settings".
  const [open, setOpen] = React.useState(false)
  // Escape on the first-visit banner hides it for this page load, without choosing.
  const [dismissed, setDismissed] = React.useState(false)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setChoice(readConsent(document.cookie))
    setReady(true)
  }, [])

  // Runs while the banner is still mounted (from its click and key handlers): focus inside it
  // would be lost with the banner, so it goes back to the trigger, else to the main content.
  const restoreFocus = useCallback(() => {
    const trigger = returnFocus.current
    returnFocus.current = null
    const active = document.activeElement
    const lost = !active || active === document.body || active.closest(BANNER_SELECTOR)
    if (trigger?.isConnected) trigger.focus()
    else if (lost) document.getElementById('content')?.focus({ preventScroll: true })
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    restoreFocus()
  }, [restoreFocus])

  const choose = useCallback(
    (next: ConsentChoice) => {
      document.cookie = consentCookie(next, window.location.protocol === 'https:')
      if (measurementId) {
        // Withdrawing after accepting: gtag.js may already be running. GA4 sends nothing while
        // `ga-disable-<id>` is true, and its cookies go. Accepting again clears the flag.
        ;(window as unknown as GaWindow)[`ga-disable-${measurementId}`] = next === 'denied'
        if (next === 'denied') {
          for (const cookie of expiredAnalyticsCookies(document.cookie, window.location.hostname)) {
            document.cookie = cookie
          }
        }
      }
      setChoice(next)
      setDismissed(false)
      close()
    },
    [close, measurementId],
  )

  const openSettings = useCallback((trigger?: HTMLElement | null) => {
    returnFocus.current = trigger ?? null
    setOpen(true)
  }, [])

  const value = React.useMemo(
    () => ({ choice, measurementId, openSettings }),
    [choice, measurementId, openSettings],
  )

  const visible = Boolean(measurementId) && ready && (open || (choice === null && !dismissed))

  return (
    <ConsentContext.Provider value={value}>
      {children}
      {visible && (
        <CookieBanner
          copy={copy}
          focusOnMount={open}
          onAccept={() => choose('granted')}
          onDismiss={() => {
            if (open) close()
            else {
              setDismissed(true)
              restoreFocus()
            }
          }}
          onReject={() => choose('denied')}
        />
      )}
    </ConsentContext.Provider>
  )
}

/**
 * The consent banner: a non-modal dialog fixed to the bottom of the viewport, so the page stays
 * usable behind it (no focus trap). Accept and Reject are the same size and style. Escape closes
 * it without choosing. Reopened from "Cookie settings", it takes focus; on a first visit it
 * doesn't steal it. Copy comes from the Footer global, each string in its own element (on-page
 * editing maps them back to their fields).
 */
export function CookieBanner({
  copy,
  focusOnMount = false,
  onAccept,
  onDismiss,
  onReject,
}: {
  copy?: CookieConsentCopy | null
  focusOnMount?: boolean
  onAccept: () => void
  onDismiss: () => void
  onReject: () => void
}) {
  const titleId = useId()
  const descriptionId = useId()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focusOnMount) ref.current?.focus()
  }, [focusOnMount])

  const title = copy?.title || defaultCookieConsentCopy.title
  const description = copy?.description || defaultCookieConsentCopy.description
  const privacyLink = copy?.enablePrivacyLink ? copy.privacyLink : null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-4 sm:p-6">
      <Card
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="false"
        className="pointer-events-auto mx-auto max-w-xl shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-test="cookie-banner"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onDismiss()
          }
        }}
        ref={ref}
        role="dialog"
        tabIndex={-1}
      >
        <CardHeader>
          <CardTitle>
            <h2 id={titleId}>{title}</h2>
          </CardTitle>
          <CardDescription id={descriptionId}>
            <p>{description}</p>
            {privacyLink && (
              <p className="mt-2">
                <CMSLink
                  {...privacyLink}
                  className="text-foreground underline underline-offset-4 hover:no-underline"
                />
              </p>
            )}
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex-wrap justify-end gap-2">
          <Button className="min-w-24" onClick={onReject} size="lg">
            {copy?.rejectLabel || defaultCookieConsentCopy.rejectLabel}
          </Button>
          <Button className="min-w-24" onClick={onAccept} size="lg">
            {copy?.acceptLabel || defaultCookieConsentCopy.acceptLabel}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

/**
 * The footer's "Cookie settings" button: reopens the banner. Renders only when this view may
 * load GA (`measurementId` comes from the page loader, so the server's HTML doesn't depend on the
 * visitor's cookie).
 */
export function CookieSettingsButton({
  className,
  label,
}: {
  className?: string
  label?: string | null
}) {
  const { measurementId, openSettings } = useConsent()
  if (!measurementId) return null

  return (
    <button
      aria-haspopup="dialog"
      className={className}
      onClick={(event) => openSettings(event.currentTarget)}
      type="button"
    >
      {label || defaultCookieConsentCopy.settingsLabel}
    </button>
  )
}
