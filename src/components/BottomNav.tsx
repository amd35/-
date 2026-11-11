import { Home, Swords, Users } from 'lucide-react'

export type Tab = 'home' | 'battle' | 'friends'

const ITEMS = [
  { key: 'home' as const, label: 'الرئيسية', Icon: Home },
  { key: 'battle' as const, label: 'المعركة', Icon: Swords },
  { key: 'friends' as const, label: 'الأصدقاء', Icon: Users },
]

export default function BottomNav({
  tab,
  onChange,
  friendsBadge,
}: {
  tab: Tab
  onChange: (tab: Tab) => void
  friendsBadge?: number
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto max-w-xl px-3 pb-3">
        <div className="glass-deep safe-bottom grid grid-cols-3 gap-1 rounded-3xl px-2 pt-2 shadow-[0_-10px_30px_-12px_rgba(190,24,93,0.55)]">
          {ITEMS.map(({ key, label, Icon }) => {
            const active = tab === key
            return (
              <button
                key={key}
                type="button"
                data-testid={`tab-${key}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => onChange(key)}
                className={`relative flex flex-col items-center gap-1 rounded-2xl py-2.5 text-[11px] font-bold transition ${
                  active
                    ? 'bg-gradient-to-b from-fuchsia-500/25 to-rose-500/10 text-blush-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon
                  size={21}
                  strokeWidth={active ? 2.6 : 2}
                  className={active ? 'drop-shadow-[0_0_10px_rgba(251,113,133,0.55)]' : ''}
                />
                {label}
                {key === 'friends' && !!friendsBadge && (
                  <span className="absolute top-1 right-[calc(50%-24px)] flex size-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-[0_0_10px_rgba(244,63,94,0.6)]">
                    {friendsBadge}
                  </span>
                )}
                {active && (
                  <span className="absolute inset-x-7 -top-0.5 h-0.5 rounded-full bg-gradient-to-l from-rose-400 via-fuchsia-400 to-amber-300" />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
