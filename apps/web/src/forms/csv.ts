import type { SignupRow, SubmissionRow } from './store'

/**
 * One CSV cell. Quoted when needed, and a value a spreadsheet would run as a formula (`=`, `+`,
 * `-`, `@`, tab, CR) gets a leading `'`: these values come from anonymous visitors.
 */
export const csvCell = (value: unknown): string => {
  let text = value == null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const csv = (rows: unknown[][]) => rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'

const parseData = (data: string): Record<string, unknown> => {
  try {
    const value = JSON.parse(data) as unknown
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export const submissionsCsv = (rows: SubmissionRow[]) =>
  csv([
    ['id', 'created_at', 'form', 'name', 'email', 'message', 'page'],
    ...rows.map((row) => {
      const data = parseData(row.data)
      return [row.id, row.created_at, row.form, data.name, data.email, data.message, row.page]
    }),
  ])

export const signupsCsv = (rows: SignupRow[]) =>
  csv([
    ['id', 'created_at', 'email', 'consent_text', 'page', 'unsubscribed_at'],
    ...rows.map((row) => [
      row.id,
      row.created_at,
      row.email,
      row.consent_text,
      row.page,
      row.unsubscribed_at,
    ]),
  ])
