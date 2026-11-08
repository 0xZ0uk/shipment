import { Link } from '@tanstack/react-router'
import React from 'react'

import type { Header as HeaderType } from '@/payload-types'

import { LocaleSwitcher } from '@/components/LocaleSwitcher'
import { Logo } from '@/components/Logo/Logo'
import { SiteSearch } from '@/components/SiteSearch'
import { siteName } from '@/utilities/siteName'
import { HeaderNav } from './Nav'

interface HeaderProps {
  data: HeaderType
}

/**
 * Sticky, translucent bar: the logo, site search, the language menu (with two or more locales)
 * and the navigation links from the Header global. The page's `scroll-padding-block-start`
 * (styles.css) keeps anchor targets clear of it.
 */
export const Header: React.FC<HeaderProps> = ({ data }) => {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="container flex h-16 items-center justify-between gap-6">
        <Link
          aria-label={`${siteName} home`}
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          to="/"
        >
          <Logo />
        </Link>
        <div className="flex items-center gap-2 md:gap-8">
          <SiteSearch />
          <LocaleSwitcher />
          <HeaderNav data={data} />
        </div>
      </div>
    </header>
  )
}
