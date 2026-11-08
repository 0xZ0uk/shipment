/**
 * Browser side of Turnstile: Cloudflare's script, loaded from its own origin (no npm package),
 * once per page and only by pages with a Form block, after hydration. Nothing here runs on the
 * server, so page HTML stays the same for every visitor.
 */
import { FORMS_CONFIG_ENDPOINT } from './definitions'

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

export type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      callback?: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      action?: string
      appearance?: 'always' | 'execute' | 'interaction-only'
      theme?: 'auto' | 'dark' | 'light'
    },
  ) => string | undefined
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let script: Promise<TurnstileApi> | null = null

export const loadTurnstile = (): Promise<TurnstileApi> => {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  script ??= new Promise<TurnstileApi>((resolve, reject) => {
    const tag = document.createElement('script')
    tag.src = SCRIPT_URL
    tag.async = true
    tag.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load'))
    tag.onerror = () => {
      script = null
      tag.remove()
      reject(new Error('Turnstile did not load'))
    }
    document.head.appendChild(tag)
  })
  return script
}

let config: Promise<string | null> | null = null

/** The Turnstile site key, or null when forms aren't configured. Fetched once per page. */
export const loadSiteKey = (): Promise<string | null> => {
  config ??= fetch(FORMS_CONFIG_ENDPOINT, { credentials: 'omit' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`forms config answered ${res.status}`)
      const body = (await res.json()) as { siteKey?: string | null }
      return body.siteKey ?? null
    })
    .catch((error: unknown) => {
      // A network blip shouldn't stick for the page's lifetime.
      config = null
      throw error
    })
  return config
}
