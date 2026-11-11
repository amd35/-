import { Facebook, Globe, Instagram, Send, Youtube, type LucideIcon } from 'lucide-react'
import type { Account } from '../lib/api'

const ICONS: Record<string, LucideIcon> = {
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  telegram: Send,
  website: Globe,
}

export default function AccountCard({ account }: { account: Account }) {
  const Icon = ICONS[account.platform.toLowerCase()] ?? Globe

  return (
    <a
      href={account.url}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-white/25 hover:bg-white/10"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white group-hover:bg-white/20">
        <Icon size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-white">{account.name}</span>
        <span className="block truncate text-sm text-slate-400" dir="ltr">
          {account.handle}
        </span>
      </span>
      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
        تابع
      </span>
    </a>
  )
}
