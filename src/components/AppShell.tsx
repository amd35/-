import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  BookOpen,
  CheckSquare,
  Heart,
  HelpCircle,
  History,
  LayoutDashboard,
  Layers,
  List,
  Mail,
  Menu,
  PlusCircle,
  Radio,
  Settings,
  Sparkles,
  User,
  X,
} from 'lucide-react'

const NAV = [
  { to: '/', label: 'غرف الدردشة', Icon: Radio },
  { to: '/dashboard', label: 'لوحة التحكم', Icon: LayoutDashboard },
  { to: '/data-list', label: 'قائمة الغرف', Icon: List },
  { to: '/systems', label: 'دليل الأنظمة', Icon: Layers },
  { to: '/add-item', label: 'إضافة غرفة', Icon: PlusCircle },
  { to: '/analytics', label: 'التحليلات', Icon: BarChart3 },
  { to: '/tasks', label: 'المهام', Icon: CheckSquare },
  { to: '/profile', label: 'الملف الشخصي', Icon: User },
  { to: '/settings', label: 'الإعدادات', Icon: Settings },
  { to: '/notifications', label: 'التنبيهات', Icon: Bell },
  { to: '/activity-log', label: 'سجل النشاط', Icon: History },
  { to: '/faq', label: 'الأسئلة الشائعة', Icon: HelpCircle },
  { to: '/help', label: 'مركز المساعدة', Icon: BookOpen },
  { to: '/contact', label: 'اتصل بنا', Icon: Mail },
]

export default function AppShell() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const current = NAV.find((item) => item.to === location.pathname)

  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl px-5 pt-4 pb-28">
      <header className="relative z-20 mb-4">
        <div className="glass-deep flex items-center gap-2 rounded-3xl px-3 py-2.5 shadow-lg shadow-rose-950/30">
          <button
            type="button"
            data-testid="menu-toggle"
            onClick={() => setOpen(true)}
            aria-label="القائمة"
            className="flex size-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition active:scale-95"
          >
            <Menu size={18} />
          </button>

          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="relative flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 via-fuchsia-600 to-violet-600 text-white shadow-lg shadow-fuchsia-900/40">
              <Heart size={17} fill="currentColor" />
              <Sparkles size={9} className="absolute -top-1 -right-1 text-amber-200" />
            </span>
            <span className="min-w-0">
              <span className="font-display block truncate text-lg leading-none font-bold text-romance-gradient">
                يلا فون
              </span>
              <span className="mt-1 block truncate text-[10px] font-semibold tracking-wide text-blush-200/70">
                {location.pathname === '/' ? 'غرف صوتية بلمسة رومانسية' : (current?.label ?? 'يلا فون')}
              </span>
            </span>
          </Link>

          <Link
            to="/notifications"
            aria-label="التنبيهات"
            className="relative flex size-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition active:scale-95"
          >
            <Bell size={17} />
            <span className="absolute top-2.5 left-2.5 size-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_2px_rgba(251,113,133,0.7)]" />
          </Link>
        </div>
        <div className="hairline-gold mx-auto mt-2 h-px w-2/3 opacity-70" />
      </header>

      <Outlet />

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          />
          <aside className="photo-base photo-couple relative ms-auto flex h-full w-72 flex-col border-s border-white/10 p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-display text-lg font-bold text-romance-gradient">يلا فون</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق"
                className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white"
              >
                <X size={16} />
              </button>
            </div>
            <nav className="no-scrollbar -mx-1 flex-1 space-y-1 overflow-y-auto px-1">
              {NAV.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={() => setOpen(false)}
                  data-testid={`nav-${to.replace('/', '') || 'home'}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                      isActive
                        ? 'border border-fuchsia-300/25 bg-fuchsia-500/20 text-blush-100'
                        : 'text-slate-200 hover:bg-white/10'
                    }`
                  }
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              ))}
            </nav>
            <p className="pt-3 text-[10px] text-slate-400">النسخة التجريبية 0.1</p>
          </aside>
        </div>
      )}
    </div>
  )
}
