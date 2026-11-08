/**
 * Whether `value` (a page as stored, or any part of it) shows reusable section `id` through a
 * Global section block, at any depth (blocks inside other blocks included). Site search uses it
 * to find the pages to sync again when a section changes.
 */
export function referencesSection(value: unknown, id: number | string): boolean {
  if (Array.isArray(value)) return value.some((item) => referencesSection(item, id))
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const ref = record.reusableSection
  if (ref !== null && ref !== undefined) {
    const refId = typeof ref === 'object' ? (ref as { id?: unknown }).id : ref
    if (String(refId) === String(id)) return true
  }
  return Object.values(record).some((child) => referencesSection(child, id))
}
