import { Link } from '@tanstack/react-router'
import React from 'react'

import type { Footer as FooterType } from '@/payload-types'

import { CookieSettingsButton } from '@/components/CookieConsent'
import { CMSLink } from '@/components/Link'
import { Logo } from '@/components/Logo/Logo'
import { siteName } from '@/utilities/siteName'

const focusRing =
  'rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export const Footer: React.FC<{ data: FooterType }> = ({ data }) => {
  const navItems = (data?.navItems || []).filter(({ link }) => link)

  return (
    <footer className="mt-auto border-t">
      <div className="container flex flex-col gap-10 py-12 md:flex-row md:items-start md:justify-between">
        <Link aria-label={`${siteName} home`} className={`self-start ${focusRing}`} to="/">
          <Logo />
        </Link>

        {navItems.length > 0 && (
          <nav aria-label="Footer">
            <ul className="flex flex-col gap-3 md:flex-row md:flex-wrap md:gap-x-8">
              {navItems.map(({ id, link }, i) => (
                <li key={id ?? i}>
                  <CMSLink
                    {...link}
                    className={`text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground ${focusRing}`}
                  />
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      <div className="container flex flex-wrap items-center justify-between gap-4 border-t py-6 text-sm text-muted-foreground">
        <span>
          © {new Date().getFullYear()} {siteName}
        </span>
        {/* Only when the page may load GA4: reopens the cookie banner. */}
        <CookieSettingsButton
          className={`cursor-pointer transition-colors duration-150 hover:text-foreground ${focusRing}`}
          label={data?.cookieConsent?.settingsLabel}
        />
      </div>
    </footer>
  )
}
