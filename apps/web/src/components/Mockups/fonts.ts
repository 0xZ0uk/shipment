import { useEffect, useState } from 'react'

/**
 * True once the mockups' font (Inter) has loaded. The kit measures text (Roll fixes a label's
 * width when it mounts), so a stage keyed on this remounts with Inter's metrics instead of
 * keeping widths measured in the fallback font.
 */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let live = true
    const done = () => {
      if (live) setReady(true)
    }
    if (typeof document === 'undefined' || !document.fonts) {
      done()
      return
    }
    document.fonts
      .load('500 13px "Inter Variable"')
      .catch(() => undefined)
      .then(() => document.fonts.ready)
      .then(done, done)
    return () => {
      live = false
    }
  }, [])
  return ready
}
