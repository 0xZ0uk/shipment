import type { AdminViewServerProps } from 'payload'

import { Banner, Button, Gutter } from '@payloadcms/ui'
import { DefaultTemplate } from '@payloadcms/ui/rsc'
import React from 'react'

import { cloudflareEnv } from '#cloudflare-runtime'
import { formsStore, formsTurnstileKeys, isFormsAdmin } from '@/plugins/forms'

/** Rows shown per table; the CSV export has all of them. */
const SHOWN = 100

const formatDate = (iso: string) => iso.replace('T', ' ').slice(0, 16)

const contactFields = (data: string): { name?: string; email?: string; message?: string } => {
  try {
    return JSON.parse(data) as { name?: string; email?: string; message?: string }
  } catch {
    return {}
  }
}

const Section: React.FC<{
  children: React.ReactNode
  count: number
  exportHref: string
  title: string
}> = ({ children, count, exportHref, title }) => (
  <section style={{ marginBlock: 'var(--spacer-6, 2rem)' }}>
    <header
      style={{ alignItems: 'center', display: 'flex', gap: '1rem', justifyContent: 'space-between' }}
    >
      <h2>
        {title} ({count})
      </h2>
      <Button buttonStyle="secondary" disabled={count === 0} el="anchor" size="medium" url={exportHref}>
        Export CSV
      </Button>
    </header>
    {count === 0 ? <p>Nothing yet.</p> : <div className="table">{children}</div>}
    {count > SHOWN && <p>Showing the latest {SHOWN}. The CSV export has all of them.</p>}
  </section>
)

/**
 * `/admin/forms`: the latest contact submissions and newsletter signups from FORMS_D1, with CSV
 * exports (`GET /api/forms/export/:table`). Server component, because `DefaultTemplate` is:
 * Payload 4 renders custom root views without the admin template. Admin users only.
 */
export const FormsView = async ({
  initPageResult,
  params,
  searchParams,
  server,
  user,
}: AdminViewServerProps) => {
  const { locale, permissions, req, visibleEntities } = initPageResult
  const adminRoute = req.payload.config.routes.admin
  const apiRoute = req.payload.config.routes.api

  // A declared custom view skips Payload's own canAccessAdmin redirect, and a session on another
  // auth collection also fills `req.user`.
  if (!req.user) server.redirect(`${adminRoute}/login`)
  else if (!isFormsAdmin(req)) server.redirect(`${adminRoute}/unauthorized`)

  const store = formsStore(cloudflareEnv)
  const [counts, submissions, signups] = await Promise.all([
    store.counts(),
    store.listSubmissions({ limit: SHOWN }),
    store.listSignups({ limit: SHOWN }),
  ])
  const configured = formsTurnstileKeys(cloudflareEnv) != null

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={user ?? req.user!}
      visibleEntities={{
        // Copied, not passed through: React 19 throws on the read-only original.
        collections: visibleEntities?.collections,
        globals: visibleEntities?.globals,
      }}
    >
      <Gutter>
        <h1>Forms</h1>
        <p>
          What visitors sent through the Form block. Contact messages are deleted after the
          retention period (FORMS_RETENTION_DAYS); newsletter signups are kept.
        </p>
        {!configured && (
          <Banner type="warning">
            Turnstile isn&apos;t configured (TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY), so the
            forms refuse submissions and show visitors a notice.
          </Banner>
        )}

        <Section
          count={counts.submissions}
          exportHref={`${apiRoute}/forms/export/submissions`}
          title="Contact messages"
        >
          <table>
            <thead>
              <tr>
                <th>Received</th>
                <th>Name</th>
                <th>Email</th>
                <th>Message</th>
                <th>Page</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((row) => {
                const data = contactFields(row.data)
                return (
                  <tr key={row.id}>
                    <td>{formatDate(row.created_at)}</td>
                    <td>{data.name}</td>
                    <td>{data.email && <a href={`mailto:${data.email}`}>{data.email}</a>}</td>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{data.message}</td>
                    <td>{row.page}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>

        <Section
          count={counts.signups}
          exportHref={`${apiRoute}/forms/export/signups`}
          title="Newsletter signups"
        >
          <table>
            <thead>
              <tr>
                <th>Signed up</th>
                <th>Email</th>
                <th>Consent</th>
                <th>Page</th>
              </tr>
            </thead>
            <tbody>
              {signups.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.created_at)}</td>
                  <td>{row.email}</td>
                  <td>{row.consent_text}</td>
                  <td>{row.page}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </Gutter>
    </DefaultTemplate>
  )
}

export default FormsView
