/**
 * Loads the saved SEO settings and merges them over the plugin config (`mergeSavedSettings`,
 * the same merge the admin applies). Used by every server analysis (`analyzeDocument`,
 * `/validate`, `/sidebar-content`, the audit, score history).
 */

import type { Payload } from 'payload'
import type { SeoConfig } from '../types.js'
import { mergeSavedSettings, type SavedSeoSettings } from './seoConfig.js'

export interface MergedConfigResult {
  config: SeoConfig
  ignoredSlugs: string[]
}

/**
 * Load SeoSettings from DB and merge with plugin config.
 * Returns the merged config and a list of ignored slugs (from settings).
 */
export async function loadMergedConfig(
  payload: Payload,
  pluginConfig?: SeoConfig,
): Promise<MergedConfigResult> {
  let ignoredSlugs: string[] = []
  let mergedConfig: SeoConfig = { ...pluginConfig }

  try {
    const settingsResult = await payload.find({
      collection: 'seo-settings',
      limit: 1,
      overrideAccess: true,
    })
    const settings = settingsResult.docs?.[0]
    if (settings) {
      if (Array.isArray(settings.ignoredSlugs)) {
        ignoredSlugs = (settings.ignoredSlugs as Array<string | { slug?: string }>)
          .map((s) => (typeof s === 'string' ? s : s.slug) || s)
          .filter(Boolean) as string[]
      }
      mergedConfig = mergeSavedSettings(mergedConfig, settings as SavedSeoSettings)
    }
  } catch {
    // SeoSettings collection might not exist yet — use plugin config as-is
  }

  return { config: mergedConfig, ignoredSlugs }
}
