import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

/** Phone-shaped screen surface used by the main app screens. */
export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`app-bg relative min-h-dvh w-full ${className}`}>
      <div className="relative z-10 px-4 pt-3 pb-32">{children}</div>
    </div>
  )
}

export function ScreenHeader({
  title,
  subtitle,
  back = true,
  action,
}: {
  title: string
  subtitle?: string
  back?: boolean
  action?: ReactNode
}) {
  const navigate = useNavigate()

  return (
    <header className="mb-4 flex items-center gap-2">
      {back ? (
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="رجوع"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition active:scale-95"
        >
          <ChevronRight size={19} />
        </button>
      ) : (
        <span className="size-9 shrink-0" />
      )}

      <div className="min-w-0 flex-1 text-center">
        <h1 className="truncate text-base font-black text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-[10px] font-semibold text-blush-200/70">{subtitle}</p>}
      </div>

      <div className="flex size-9 shrink-0 items-center justify-center">{action}</div>
    </header>
  )
}

export function SectionHead({
  title,
  hint,
  icon,
}: {
  title: string
  hint?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-1.5 text-sm font-black text-white">
        {icon}
        {title}
      </h2>
      {hint && <span className="text-[10px] font-semibold text-blush-200/60">{hint}</span>}
    </div>
  )
}
