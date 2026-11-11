import type { ReactNode } from 'react'

export type BackdropPhoto = 'roses' | 'petals' | 'couple' | 'evening'

/**
 * Full-screen romantic photographic backdrop for a main screen.
 * The photo sits behind all content; the content keeps its own dark surfaces
 * so text stays readable over the imagery.
 */
export default function PageBackdrop({
  photo,
  children,
}: {
  photo: BackdropPhoto
  children: ReactNode
}) {
  return (
    <>
      <div
        aria-hidden
        data-testid={`backdrop-${photo}`}
        className={`photo-base photo-scene photo-${photo} pointer-events-none fixed inset-0 z-0 overflow-hidden`}
      >
        <span className="animate-romance-sheen absolute -top-24 -left-16 size-64 rounded-full bg-rose-500/20 blur-3xl" />
        <span className="animate-romance-sheen absolute top-1/3 -right-20 size-56 rounded-full bg-fuchsia-500/15 blur-3xl" />
      </div>
      <div className="relative z-10">{children}</div>
    </>
  )
}
