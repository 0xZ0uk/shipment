// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Footer as FooterType } from '@/payload-types'

import { ConsentProvider } from '@/components/CookieConsent'
import { PageTemplate } from '@/components/PageTemplate'
import { Footer } from '@/Footer/Component'
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  consentCookie,
  expiredAnalyticsCookies,
  readConsent,
} from '@/utilities/cookieConsent'

// Cookie consent (Basic mode): nothing from Google loads before "Accept", and the choice is
// client state only, so the server's HTML is the same for every visitor (edge-cacheable).
vi.mock('@shipment/payload-plugin-ab/analytics', () => ({
  ExperimentTracker: ({ experimentId }: { experimentId: string }) => (
    <i data-test="experiment-tracker" data-experiment={experimentId} />
  ),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ID = 'G-TEST123456'

const rootRoute = createRootRoute()
const router = createRouter({
  history: createMemoryHistory(),
  routeTree: rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/$slug' }),
  ]),
})

const page = { layout: [], slug: 'pricing', title: 'Pricing' } as never

const footer = (cookieConsent?: FooterType['cookieConsent']) =>
  ({ id: 1, navItems: [], cookieConsent }) as FooterType

/** What `FrontendLayout` renders around a page, minus the header. */
const Tree = ({
  copy,
  draft = false,
  measurementId = ID,
}: {
  copy?: FooterType['cookieConsent']
  draft?: boolean
  measurementId?: string | null
}) => (
  <RouterContextProvider router={router as never}>
    <ConsentProvider copy={copy} measurementId={measurementId}>
      <main id="content" tabIndex={-1}>
        <PageTemplate
          draft={draft}
          experiment="/pricing"
          gaMeasurementId={measurementId}
          livePreview={false}
          page={page}
        />
      </main>
      <Footer data={footer(copy)} />
    </ConsentProvider>
  </RouterContextProvider>
)

const clearCookies = () => {
  for (const part of document.cookie.split(';')) {
    const name = part.trim().split('=')[0]
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`
  }
}

describe('consent cookie', () => {
  it('reads granted or denied, and nothing else', () => {
    expect(readConsent('')).toBeNull()
    expect(readConsent('a=1; cookie_consent=granted; b=2')).toBe('granted')
    expect(readConsent('cookie_consent=denied')).toBe('denied')
    expect(readConsent('cookie_consent=yes')).toBeNull()
    expect(readConsent('xcookie_consent=granted')).toBeNull()
  })

  it('is first-party, Lax, 180 days, and Secure on https', () => {
    expect(CONSENT_COOKIE).toBe('cookie_consent')
    expect(CONSENT_MAX_AGE).toBe(15_552_000)
    expect(consentCookie('granted', false)).toBe(
      'cookie_consent=granted; Path=/; Max-Age=15552000; SameSite=Lax',
    )
    expect(consentCookie('denied', true)).toBe(
      'cookie_consent=denied; Path=/; Max-Age=15552000; SameSite=Lax; Secure',
    )
  })

  it("expires GA's cookies on the host and its parent domains", () => {
    const cookies = expiredAnalyticsCookies(
      '_ga=GA1.1.1; _ga_TEST123456=GS1; _gid=x; cookie_consent=granted; _gallery=1',
      'www.example.com',
    )
    expect(cookies).toContain('_ga=; Path=/; Max-Age=0')
    expect(cookies).toContain('_ga=; Path=/; Max-Age=0; Domain=.www.example.com')
    expect(cookies).toContain('_ga=; Path=/; Max-Age=0; Domain=.example.com')
    expect(cookies).toContain('_ga_TEST123456=; Path=/; Max-Age=0; Domain=.example.com')
    expect(cookies).toContain('_gid=; Path=/; Max-Age=0')
    expect(cookies.join()).not.toContain('Domain=.com')
    expect(cookies.join()).not.toContain('cookie_consent')
    expect(cookies.join()).not.toContain('_gallery')
    expect(expiredAnalyticsCookies('_ga=1', 'localhost')).toEqual(['_ga=; Path=/; Max-Age=0'])
  })
})

describe('server rendering', () => {
  afterEach(clearCookies)

  it('is identical with and without a consent cookie, and never reads cookies', () => {
    const render = () => renderToString(<Tree />)

    const html = render()
    for (const cookie of ['cookie_consent=granted', 'cookie_consent=denied']) {
      document.cookie = `${cookie}; Path=/`
      expect(render()).toBe(html)
      clearCookies()
    }

    // Rendering doesn't touch `document.cookie` at all (only the provider's effect does).
    const get = vi.fn(() => 'cookie_consent=granted')
    Object.defineProperty(document, 'cookie', { configurable: true, get })
    try {
      expect(render()).toBe(html)
      expect(get).not.toHaveBeenCalled()
    } finally {
      delete (document as { cookie?: string }).cookie
    }

    // No banner, no tracker and no gtag.js in the server's HTML; the settings link is there (it
    // depends on the page's GA id, not on the visitor).
    expect(html).not.toContain('cookie-banner')
    expect(html).not.toContain('experiment-tracker')
    expect(html).not.toContain('googletagmanager')
    expect(html).toContain('Cookie settings')
  })

  it('renders no settings link without a GA id', () => {
    expect(renderToString(<Tree measurementId={null} />)).not.toContain('Cookie settings')
  })

  it("keeps the consent cookie out of the server's code paths", () => {
    // Loaders, server functions, the head and the response defaults must not read it: cached
    // HTML is keyed by URL alone.
    const root = path.resolve(__dirname, '../../src')
    for (const file of [
      'app/_frontend/pages.functions.ts',
      'app/_frontend/layout.functions.ts',
      'utilities/pageHead.ts',
      'utilities/cacheControl.ts',
      'server.ts',
    ]) {
      const source = readFileSync(path.join(root, file), 'utf8')
      expect(source, file).not.toMatch(/cookieConsent|cookie_consent|CookieConsent/)
    }
  })
})

describe('banner', () => {
  let container: HTMLDivElement
  let root: Root

  const mount = async (element: React.ReactElement) => {
    await act(async () => root.render(element))
  }
  const banner = () => container.querySelector('[data-test="cookie-banner"]')
  const button = (name: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent === name)
  const gtagScript = () => document.head.querySelector('script[src*="googletagmanager"]')

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    clearCookies()
  })

  it('shows after hydration when no choice is stored, and loads nothing', async () => {
    await mount(<Tree />)
    expect(banner()).not.toBeNull()
    expect(banner()?.getAttribute('role')).toBe('dialog')
    expect(banner()?.getAttribute('aria-labelledby')).toBeTruthy()
    expect(button('Accept')).toBeDefined()
    expect(button('Reject')).toBeDefined()
    expect(gtagScript()).toBeNull()
    expect(container.querySelector('[data-test="experiment-tracker"]')).toBeNull()
  })

  it('uses the copy from the Footer global', async () => {
    await mount(
      <Tree
        copy={{
          acceptLabel: 'Allow',
          description: 'We measure visits.',
          rejectLabel: 'Decline',
          settingsLabel: 'Privacy choices',
          title: 'Your privacy',
        }}
      />,
    )
    expect(banner()?.textContent).toContain('Your privacy')
    expect(banner()?.textContent).toContain('We measure visits.')
    expect(button('Allow')).toBeDefined()
    expect(button('Decline')).toBeDefined()
    expect(button('Privacy choices')).toBeDefined()
  })

  it('is not shown without a GA id, or on a draft', async () => {
    await mount(<Tree measurementId={null} />)
    expect(banner()).toBeNull()
    expect(button('Cookie settings')).toBeUndefined()
    // Drafts get no id from `loadPage`, so the layout passes null too.
    await mount(<Tree draft measurementId={null} />)
    expect(banner()).toBeNull()
  })

  it('stays hidden for a returning visitor', async () => {
    document.cookie = 'cookie_consent=denied; Path=/'
    await mount(<Tree />)
    expect(banner()).toBeNull()
  })

  it('reject stores the choice and loads nothing', async () => {
    await mount(<Tree />)
    await act(async () => button('Reject')!.click())
    expect(banner()).toBeNull()
    expect(readConsent(document.cookie)).toBe('denied')
    expect(gtagScript()).toBeNull()
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${ID}`]).toBe(true)
  })

  it('reopens from the footer, takes focus, and closes on Escape', async () => {
    document.cookie = 'cookie_consent=denied; Path=/'
    await mount(<Tree />)
    const settings = button('Cookie settings')!
    settings.focus()
    await act(async () => settings.click())
    expect(banner()).not.toBeNull()
    expect(document.activeElement).toBe(banner())

    await act(async () => {
      banner()!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    })
    expect(banner()).toBeNull()
    expect(document.activeElement).toBe(settings)
    expect(readConsent(document.cookie)).toBe('denied')
  })

  it('accept loads gtag.js, then config, and mounts the tracker', async () => {
    await mount(<Tree />)
    expect(gtagScript()).toBeNull()
    await act(async () => button('Accept')!.click())

    expect(banner()).toBeNull()
    expect(readConsent(document.cookie)).toBe('granted')
    expect(gtagScript()?.getAttribute('src')).toBe(
      `https://www.googletagmanager.com/gtag/js?id=${ID}`,
    )
    expect(container.querySelector('[data-test="experiment-tracker"]')).not.toBeNull()
    const dataLayer = (window as unknown as { dataLayer: IArguments[] }).dataLayer
    expect(dataLayer.map((args) => [...args])).toContainEqual(['config', ID])
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${ID}`]).toBe(false)

    // Withdrawing stops GA4 from sending anything more.
    await act(async () => button('Cookie settings')!.click())
    await act(async () => button('Reject')!.click())
    expect(readConsent(document.cookie)).toBe('denied')
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${ID}`]).toBe(true)
    expect(container.querySelector('[data-test="experiment-tracker"]')).toBeNull()
  })
})
