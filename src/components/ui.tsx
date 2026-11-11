import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'

export function PageHeader({
  title,
  subtitle,
  action,
  eyebrow,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  eyebrow?: string
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] text-blush-300/80 uppercase">
            <Sparkles size={11} className="text-amber-300" />
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-2xl leading-tight font-bold text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-xs leading-relaxed text-blush-200/60">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

export function SectionTitle({
  children,
  hint,
  icon,
}: {
  children: ReactNode
  hint?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-white">
        {icon}
        {children}
      </h2>
      {hint && <span className="text-[11px] font-semibold text-blush-200/50">{hint}</span>}
    </div>
  )
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`glass rounded-3xl p-4 ${className}`}>{children}</div>
}

export function StatTile({
  label,
  value,
  tone = 'default',
  testId,
}: {
  label: string
  value: string | number
  tone?: 'default' | 'emerald' | 'fuchsia' | 'amber'
  testId?: string
}) {
  const tones: Record<string, string> = {
    default: 'border-white/10 bg-white/[0.06] text-slate-100',
    emerald: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200',
    fuchsia: 'border-fuchsia-300/25 bg-fuchsia-400/12 text-blush-200',
    amber: 'border-amber-300/25 bg-amber-400/10 text-amber-200',
  }

  return (
    <div className={`rounded-2xl border px-3 py-3 backdrop-blur-md ${tones[tone]}`}>
      <p className="font-display text-xl leading-none font-bold" data-testid={testId}>
        {value}
      </p>
      <p className="mt-1.5 text-[10px] font-semibold text-blush-200/60">{label}</p>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold text-blush-200/80">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-300/60 focus:ring-2 focus:ring-fuchsia-500/20 focus:outline-none'

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`blush-glow w-full rounded-2xl bg-gradient-to-l from-rose-500 via-fuchsia-500 to-violet-600 py-3 text-sm font-black text-white transition active:scale-[0.99] disabled:opacity-50 ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function Notice({ children, tone = 'emerald' }: { children: ReactNode; tone?: 'emerald' | 'rose' }) {
  const tones = {
    emerald: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200',
    rose: 'border-rose-300/30 bg-rose-400/10 text-rose-200',
  }
  return (
    <p className={`rounded-xl border px-3 py-2.5 text-xs backdrop-blur ${tones[tone]}`} role="status">
      {children}
    </p>
  )
}

export function Chip({
  active,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
        active
          ? 'border border-fuchsia-200/30 bg-gradient-to-l from-rose-500 to-fuchsia-600 text-white shadow-[0_6px_18px_-8px_rgba(236,72,153,0.9)]'
          : 'border border-white/12 bg-white/[0.06] text-blush-200/70 hover:bg-white/10'
      } ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function Pill({
  children,
  icon,
  tone = 'rose',
}: {
  children: ReactNode
  icon?: ReactNode
  tone?: 'rose' | 'amber' | 'cyan' | 'emerald'
}) {
  const tones = {
    rose: 'border-rose-300/25 bg-rose-500/10 text-blush-200',
    amber: 'border-amber-300/25 bg-amber-400/10 text-amber-200',
    cyan: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-200',
    emerald: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200',
  }
  return (
    <span className={`flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-bold backdrop-blur ${tones[tone]}`}>
      {icon}
      {children}
    </span>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-3xl border border-white/10 bg-white/[0.04] py-8 text-center text-xs text-blush-200/50 backdrop-blur">
      {children}
    </p>
  )
}
