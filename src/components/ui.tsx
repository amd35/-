import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl leading-tight font-black text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-xs leading-relaxed text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 ${className}`}>
      {children}
    </div>
  )
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
    default: 'border-white/10 bg-white/5 text-slate-200',
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    fuchsia: 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-300',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  }

  return (
    <div className={`rounded-2xl border px-3 py-3 ${tones[tone]}`}>
      <p className="text-xl leading-none font-black" data-testid={testId}>
        {value}
      </p>
      <p className="mt-1.5 text-[10px] font-semibold text-slate-400">{label}</p>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold text-slate-300">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-400/60 focus:outline-none'

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full rounded-xl bg-gradient-to-l from-fuchsia-500 to-violet-600 py-3 text-sm font-black text-white transition disabled:opacity-50 ${props.className ?? ''}`}
    >
      {children}
    </button>
  )
}

export function Notice({ children, tone = 'emerald' }: { children: ReactNode; tone?: 'emerald' | 'rose' }) {
  const tones = {
    emerald: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    rose: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  }
  return (
    <p className={`rounded-xl border px-3 py-2.5 text-xs ${tones[tone]}`} role="status">
      {children}
    </p>
  )
}
