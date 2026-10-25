// Photographic surface of each section of the app (design only).
// The files live in web/public/img/bg and their licences are listed in
// web/public/img/bg/CREDITS.md.
const RULES = [
  [/^\/$/, 'home'],
  [/^\/login/, 'auth'],
  [/^\/rooms/, 'rooms'],
  [/^\/games/, 'games'],
  [/^\/store/, 'store'],
  [/^\/recharge/, 'wallet'],
  [/^\/(friends|notifications|search)/, 'social'],
  [/^\/profile/, 'profile'],
]

// Everything else (admin and service pages) keeps the app's original green table surface.
const PANEL = 'panel'

export function surfaceFor(pathname) {
  const match = RULES.find(([pattern]) => pattern.test(pathname))
  return match ? match[1] : PANEL
}
