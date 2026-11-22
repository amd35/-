import { Gamepad2, Home, MessageCircle, Mic, ShoppingBag } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const ITEMS = [
  { to: '/', label: 'الرئيسية', Icon: Home },
  { to: '/games', label: 'الألعاب', Icon: Gamepad2 },
  { to: '/store', label: 'المتجر', Icon: ShoppingBag },
  { to: '/messages', label: 'الرسائل', Icon: MessageCircle },
]

export default function BottomNav({ messageBadge }: { messageBadge?: number }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto max-w-[440px] px-3 pb-3">
        <div className="nav-glass safe-bottom grid grid-cols-5 items-end rounded-[26px] px-2 pt-1.5 shadow-[0_-14px_34px_-16px_rgba(124,58,237,0.85)]">
          {ITEMS.slice(0, 2).map(({ to, label, Icon }) => (
            <NavItem key={to} to={to} label={label} Icon={Icon} />
          ))}

          <NavLink
            to="/add-item"
            data-testid="tab-live"
            className="relative -mt-7 flex flex-col items-center gap-1 pb-1"
          >
            <span className="purple-btn flex size-14 items-center justify-center rounded-full ring-4 ring-[#0e0622]">
              <Mic size={23} />
            </span>
            <span className="text-[10px] font-bold text-blush-200">ميكروفون</span>
          </NavLink>

          {ITEMS.slice(2).map(({ to, label, Icon }) => (
            <NavItem
              key={to}
              to={to}
              label={label}
              Icon={Icon}
              badge={to === '/messages' ? messageBadge : undefined}
            />
          ))}
        </div>
      </div>
    </nav>
  )
}

function NavItem({
  to,
  label,
  Icon,
  badge,
}: {
  to: string
  label: string
  Icon: typeof Home
  badge?: number
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      data-testid={`tab-${to.replace('/', '') || 'home'}`}
      className={({ isActive }) =>
        `relative flex flex-col items-center gap-1 rounded-2xl py-2.5 text-[10px] font-bold transition ${
          isActive ? 'text-gold' : 'text-blush-200/55'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={21} strokeWidth={isActive ? 2.6 : 2} />
          <span>{label}</span>
          {!!badge && badge > 0 && (
            <span className="absolute top-1 right-[calc(50%-22px)] flex min-w-4 items-center justify-center rounded-full bg-neon px-1 text-[9px] font-black text-white shadow-[0_0_10px_rgba(255,59,212,0.8)]">
              {badge}
            </span>
          )}
          {isActive && (
            <span className="absolute inset-x-6 -top-0.5 h-0.5 rounded-full bg-gradient-to-l from-gold via-amber-200 to-gold" />
          )}
        </>
      )}
    </NavLink>
  )
}
