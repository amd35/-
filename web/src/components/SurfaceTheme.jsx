import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { surfaceFor } from '../lib/surface.js'

/**
 * Puts the current section's photographic surface on <body> so the backdrop
 * layer (styles.css, section 16) can follow the page. Design only: no data,
 * no markup, no behaviour change.
 */
export default function SurfaceTheme() {
  const { pathname } = useLocation()

  useEffect(() => {
    const surface = surfaceFor(pathname)
    if (document.body.dataset.surface === surface) return
    document.body.dataset.surface = surface
    // Re-run the fade so the new photograph eases in instead of snapping.
    document.body.classList.remove('surface-swap')
    void document.body.offsetWidth
    document.body.classList.add('surface-swap')
  }, [pathname])

  return null
}
