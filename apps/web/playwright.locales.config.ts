import { defineConfig } from '@playwright/test'

import base from './playwright.config'

/**
 * The second-locale specs (#158): the app with `LOCALES=en,pt`, on its own dev server and port
 * (`E2E_LOCALES_PORT`, default 3001), running `tests/e2e-locales`. `pnpm test:e2e` keeps testing
 * the single-locale site, which must behave exactly as before localization.
 *
 * A dev server started with `LOCALES=en,pt` regenerates `src/payload-types.ts` with `pt` in it:
 * don't commit that (`pnpm generate:types` writes the committed, single-locale version).
 */
const port = Number(process.env.E2E_LOCALES_PORT || 3001)
const baseURL = process.env.E2E_LOCALES_BASE_URL || `http://localhost:${port}`
const LOCALES = 'en,pt'

// The specs' own process (the user seed's Local API) reads the same locales.
process.env.LOCALES = LOCALES

const webServer = Array.isArray(base.webServer) ? base.webServer[0] : base.webServer

export default defineConfig({
  ...base,
  testDir: './tests/e2e-locales',
  use: { ...base.use, baseURL },
  webServer: process.env.E2E_LOCALES_BASE_URL
    ? undefined
    : {
        ...webServer!,
        command: `pnpm dev --port ${port} --strictPort`,
        url: baseURL,
        env: { ...webServer?.env, LOCALES, SITE_URL: baseURL },
      },
})
