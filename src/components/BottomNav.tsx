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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0d0819]/95 backdrop-blur">
      <div className="mx-auto grid max-w-xl grid-cols-3">
        {ITEMS.map(({ key, label, Icon }) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              data-testid={`tab-${key}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => onChange(key)}
              className={`relative flex flex-col items-center gap-1 py-3 text-xs font-bold transition ${
                active ? 'text-fuchsia-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.6 : 2} />
              {label}
              {key === 'friends' && !!friendsBadge && (
                <span className="absolute top-2 right-[calc(50%-22px)] flex size-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                  {friendsBadge}
                </span>
              )}
              {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-fuchsia-400" />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
