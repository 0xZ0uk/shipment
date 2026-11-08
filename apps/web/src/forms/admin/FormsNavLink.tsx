'use client'
import { Link, NavGroup, useConfig, usePathname } from '@payloadcms/ui'
import { formatAdminURL } from 'payload/shared'
import React from 'react'

/**
 * The sidebar link to `/admin/forms` (`admin.components.afterNavLinks`, src/plugins/forms.ts), in
 * Payload's own nav markup. Only users of the admin collection reach the admin shell; the view
 * checks again.
 */
export function FormsNavLink() {
  const pathname = usePathname() ?? ''
  const {
    config: {
      routes: { admin: adminRoute },
    },
  } = useConfig()
  const href = formatAdminURL({ adminRoute, path: '/forms' })
  const active = pathname === href || pathname.startsWith(`${href}/`)

  return (
    <NavGroup label="Forms">
      <div className="nav__link-wrapper">
        <Link
          aria-current={active ? 'page' : undefined}
          className={`nav__link${active ? ' nav__link--selected' : ''}`}
          href={href}
          prefetch={false}
        >
          <span className="nav__link-label">Submissions</span>
        </Link>
      </div>
    </NavGroup>
  )
}
