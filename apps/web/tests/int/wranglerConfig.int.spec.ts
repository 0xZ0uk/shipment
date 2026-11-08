import { describe, expect, it } from 'vitest'
import { unstable_readConfig } from 'wrangler'

// The Worker config as Wrangler resolves it for each environment (inheritance included), the
// same resolution `wrangler deploy` and the Vite plugin's build use.
const read = (env?: string) =>
  unstable_readConfig({ config: 'wrangler.jsonc', ...(env ? { env } : {}) }, { hideWarnings: true })

describe('wrangler.jsonc', () => {
  it('runs the scheduled jobs on production every 5 minutes', () => {
    expect(read().triggers.crons).toEqual(['*/5 * * * *'])
  })

  it('has no Cron Trigger on staging (#116): an empty list, so a deploy clears it', () => {
    const staging = read('staging')
    expect(staging.name).toBe('shipment-staging')
    expect(staging.triggers.crons).toEqual([])
  })

  it('writes the assistant audit log (#68) to its own dataset per environment', () => {
    const dataset = (env?: string) =>
      (read(env).analytics_engine_datasets as Array<{ binding: string; dataset?: string }>).find(
        (d) => d.binding === 'ASSISTANT_AUDIT',
      )?.dataset
    expect(dataset()).toBe('shipment_assistant_audit')
    expect(dataset('staging')).toBe('shipment_assistant_audit_staging')
  })

  it('binds Cloudflare Images as IMAGES in every environment (resized uploads, #163)', () => {
    expect(read().images).toEqual({ binding: 'IMAGES' })
    expect(read('staging').images).toEqual({ binding: 'IMAGES' })
  })

  it('binds the forms database and rate limit in every environment, on their own resources', () => {
    const forms = (env?: string) => {
      const config = read(env)
      return {
        db: (config.d1_databases as Array<{ binding: string; database_name?: string }>).find(
          (d) => d.binding === 'FORMS_D1',
        )?.database_name,
        limit: (config.ratelimits as Array<{ name: string; namespace_id: string }>).find(
          (r) => r.name === 'FORMS_RATE_LIMIT',
        )?.namespace_id,
      }
    }
    expect(forms()).toEqual({ db: 'shipment-forms', limit: '1008' })
    expect(forms('staging')).toEqual({ db: 'shipment-forms-staging', limit: '1108' })
  })
})
