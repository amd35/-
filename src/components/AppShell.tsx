import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  BookOpen,
  CheckSquare,
  HelpCircle,
  History,
  LayoutDashboard,
  List,
  Mail,
  Menu,
  PlusCircle,
  Radio,
  Settings,
  User,
  X,
} from 'lucide-react'

const NAV = [
  { to: '/', label: 'غرف الدردشة', Icon: Radio },
  { to: '/dashboard', label: 'لوحة التحكم', Icon: LayoutDashboard },
  { to: '/data-list', label: 'قائمة الغرف', Icon: List },
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
    <div className="mx-auto min-h-dvh w-full max-w-xl px-5 pt-5 pb-28">
      <header className="photo-base photo-couple relative mb-4 overflow-hidden rounded-3xl border border-white/10 shadow-lg shadow-rose-950/30">
        <div className="relative flex items-center gap-2 px-3 py-4">
          <button
            type="button"
            data-testid="menu-toggle"
            onClick={() => setOpen(true)}
            aria-label="القائمة"
            className="flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white backdrop-blur"
          >
            <Menu size={18} />
          </button>
          <Link to="/" className="min-w-0 flex-1">
            <p className="text-[10px] font-bold tracking-wide text-rose-200">يلا فون</p>
            <p className="truncate text-sm font-black text-white">{current?.label ?? 'غرف الدردشة'}</p>
          </Link>
          <Link
            to="/notifications"
            aria-label="التنبيهات"
            className="flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white backdrop-blur"
          >
            <Bell size={17} />
          </Link>
        </div>
      </header>

      <Outlet />

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <aside className="relative ms-auto flex h-full w-72 flex-col border-s border-white/10 bg-[#0c0718] p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-black text-white">يلا فون</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق"
                className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white"
              >
                <X size={16} />
              </button>
            </div>
            <nav className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1">
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
                        ? 'bg-fuchsia-500/15 text-fuchsia-300'
                        : 'text-slate-300 hover:bg-white/5'
                    }`
                  }
                >
                  <Icon size={16} />
                  {label}
                </NavLink>
              ))}
            </nav>
            <p className="pt-3 text-[10px] text-slate-600">النسخة التجريبية 0.1</p>
          </aside>
        </div>
      )}
    </div>
  )
}
