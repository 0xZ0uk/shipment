import { MenuIcon, XIcon } from 'lucide-react'
import React, { useEffect, useId, useRef, useState } from 'react'

import type { Header as HeaderType } from '@/payload-types'

import { CMSLink } from '@/components/Link'
import { Button } from '@/components/ui/button'

const linkClassName =
  'rounded-md text-sm font-medium text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

/**
 * The Header global's links: inline from `md` up, behind a menu button below it so up to six
 * links never overflow a phone screen.
 */
export const HeaderNav: React.FC<{ data: HeaderType }> = ({ data }) => {
  const navItems = (data?.navItems || []).filter(({ link }) => link)
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Escape closes the menu and returns focus to its button.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  if (navItems.length === 0) return null

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
        {navItems.map(({ id, link }, i) => (
          <CMSLink key={id ?? i} {...link} className={linkClassName} />
        ))}
      </nav>

      <Button
        aria-controls={menuId}
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="md:hidden"
        onClick={() => setOpen((value) => !value)}
        ref={buttonRef}
        size="icon-lg"
        variant="ghost"
      >
        {open ? <XIcon /> : <MenuIcon />}
      </Button>

      <nav
        aria-label="Main"
        className="absolute inset-x-0 top-full border-b bg-background md:hidden"
        hidden={!open}
        id={menuId}
      >
        <ul className="container flex flex-col py-2">
          {navItems.map(({ id, link }, i) => (
            <li key={id ?? i}>
              {/* Close on click: client-side navigation keeps the header mounted. */}
              <span className="contents" onClickCapture={() => setOpen(false)}>
                <CMSLink {...link} className={`${linkClassName} flex py-3 text-base`} />
              </span>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
