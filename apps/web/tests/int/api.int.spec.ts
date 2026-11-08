import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

import { seedHome } from './localD1/seedHome'
import { seoSidebarParity } from './localD1/seoSidebarParity'
import { siteSearch } from './localD1/siteSearch'

let payload: Payload

beforeAll(async () => {
  const payloadConfig = await config
  payload = await getPayload({ config: payloadConfig })
})

describe('API', () => {
  it('fetches users', async () => {
    const users = await payload.find({
      collection: 'users',
      overrideAccess: true,
    })
    expect(users).toBeDefined()
  })

  // No `EMAIL` binding in wrangler.jsonc and no RESEND_API_KEY (src/email.ts): Payload logs
  // emails instead of sending them, so local dev and CI need no email credentials.
  it.skipIf(!!process.env.RESEND_API_KEY)('falls back to the console email adapter', async () => {
    expect((await config).email).toBeUndefined()
    expect(payload.email.name).toBe('console')
  })
})

// Suites that need Payload on the local D1 run from this file, with this instance: a second
// spec file booting Payload would start another workerd on the same SQLite file (SQLITE_BUSY).
seoSidebarParity(() => payload)
seedHome(() => payload)
siteSearch(() => payload)
