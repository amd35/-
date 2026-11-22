import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  Crown,
  Flame,
  Rocket,
  Search,
  Sparkles,
  Trophy,
  Users,
  Volleyball,
  X,
} from 'lucide-react'
import Avatar from '../components/Avatar'
import RoomCard from '../components/RoomCard'
import { useAppMenu } from '../components/AppShell'
import { Screen } from '../components/Screen'
import { api, type Me, type Room } from '../lib/api'

const TABS = [
  { key: 'all', label: 'الكل' },
  { key: 'chat', label: 'دردشة' },
  { key: 'games', label: 'ألعاب' },
  { key: 'new', label: 'الجدد' },
  { key: 'events', label: 'فعاليات' },
] as const

type TabKey = (typeof TABS)[number]['key']

const QUICK = [
  { key: 'events' as TabKey, label: 'أفضل الغرف', Icon: Trophy, tint: 'from-amber-300 to-yellow-600' },
  { key: 'games' as TabKey, label: 'كورة مجنونة', Icon: Volleyball, tint: 'from-emerald-300 to-teal-600' },
  { key: 'new' as TabKey, label: 'معركة السرعة', Icon: Rocket, tint: 'from-fuchsia-400 to-violet-700' },
]

export default function HomePage({ onOpenRoom }: { onOpenRoom: (room: Room) => void }) {
  const openMenu = useAppMenu()
  const [me, setMe] = useState<Me | null>(null)
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [tab, setTab] = useState<TabKey>('all')

  useEffect(() => {
    let active = true
    Promise.all([api.me(), api.rooms()])
      .then(([profile, data]) => {
        if (!active) return
        setMe(profile)
        setRooms(data)
      })
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  const visibleRooms = useMemo(() => {
    const term = query.trim()
    const list = (rooms ?? []).filter((room) => {
      const matchQuery = term === '' || room.title.includes(term) || room.host.includes(term)
      if (!matchQuery) return false
      if (tab === 'chat') return !room.is_battle && room.category !== 'ألعاب'
      if (tab === 'games') return room.is_battle || room.category === 'ألعاب'
      if (tab === 'events') return room.featured
      return true
    })
    return tab === 'new' ? [...list].sort((a, b) => b.id - a.id) : list
  }, [rooms, tab, query])

  return (
    <Screen>
      {/* الشريط العلوي */}
      <header className="mb-3 flex items-center gap-2">
        <button
          type="button"
          data-testid="menu-toggle"
          onClick={openMenu}
          aria-label="القائمة"
          className="shrink-0 rounded-full bg-gradient-to-br from-amber-300 to-fuchsia-600 p-[2px] transition active:scale-95"
        >
          <Avatar name={me?.name ?? 'المستخدم'} size={40} online />
        </button>

        <div className="min-w-0 flex-1 text-center">
          <p className="font-display truncate text-xl leading-none font-bold gold-text">يلا فون</p>
          <p className="mt-0.5 text-[9px] font-bold tracking-[0.25em] text-blush-200/60">YALLA PHONE</p>
        </div>

        <button
          type="button"
          aria-label="بحث"
          onClick={() => setSearchOpen((value) => !value)}
          className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition active:scale-95"
        >
          {searchOpen ? <X size={17} /> : <Search size={17} />}
        </button>
        <Link
          to="/notifications"
          aria-label="التنبيهات"
          className="relative flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white transition active:scale-95"
        >
          <Bell size={17} />
          <span className="absolute top-2 left-2 size-1.5 rounded-full bg-neon shadow-[0_0_8px_2px_rgba(255,59,212,0.85)]" />
        </Link>
      </header>

      {searchOpen && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2">
          <Search size={15} className="text-blush-200/60" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث عن غرفة أو مضيف"
            className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 focus:outline-none"
          />
        </div>
      )}

      {/* البانر */}
      <section className="relative overflow-hidden rounded-[26px] border border-white/10">
        <div aria-hidden className="photo-base photo-couple absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-l from-[#170a33]/95 via-[#2b1160]/85 to-[#4c1d95]/35" />
        <div className="relative z-10 p-4">
          <p className="text-[11px] font-bold text-amber-200/90">
            مساء الورد، <span className="text-white">{me?.name ?? '…'}</span>
          </p>
          <h1 className="font-display mt-1 text-[22px] leading-tight font-bold text-white">
            أهلاً بك في يلا فون
          </h1>
          <p className="mt-1 max-w-[62%] text-[11px] leading-relaxed text-blush-100/80">
            دردشة صوتية، ألعاب وهدايا مع أصدقائك في غرف مباشرة
          </p>
          <Link
            to="/add-item"
            data-testid="create-room-link"
            className="gold-btn mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-black transition active:scale-95"
          >
            <Sparkles size={14} /> انضم الآن
          </Link>
        </div>
      </section>

      {/* اختصارات */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {QUICK.map(({ key, label, Icon, tint }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`glass flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 transition active:scale-[0.98] ${
              tab === key ? 'border-gold/50' : ''
            }`}
          >
            <span className={`flex size-9 items-center justify-center rounded-full bg-gradient-to-br ${tint} text-[#1a0b2e]`}>
              <Icon size={17} />
            </span>
            <span className="text-[10px] font-bold text-blush-100">{label}</span>
          </button>
        ))}
      </div>

      {/* التبويبات */}
      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            data-testid={`category-${item.key}`}
            onClick={() => setTab(item.key)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition ${
              tab === item.key
                ? 'gold-btn'
                : 'border border-white/10 bg-white/[0.06] text-blush-200/80'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-center text-xs text-red-200">
          {error}
        </p>
      )}

      {/* قائمة الغرف */}
      <section className="mt-4">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-black text-white">
            <Flame size={14} className="text-neon" /> الغرف النشطة
          </h2>
          <span className="flex items-center gap-1 text-[10px] font-semibold text-blush-200/60">
            <Users size={11} /> {visibleRooms.length} غرفة
          </span>
        </div>

        {rooms === null && !error && (
          <p className="py-8 text-center text-xs text-blush-200/50">جارٍ تحميل الغرف…</p>
        )}

        {rooms !== null && visibleRooms.length === 0 && (
          <p className="rounded-3xl border border-white/10 bg-white/[0.04] py-8 text-center text-xs text-blush-200/50">
            لا توجد غرف مطابقة الآن.
          </p>
        )}

        <div className="space-y-2.5">
          {visibleRooms.map((room) => (
            <RoomCard key={room.id} room={room} onOpen={onOpenRoom} />
          ))}
        </div>

        {visibleRooms.length > 0 && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-blush-200/40">
            <Crown size={11} className="text-gold" /> غرف مميزة كل ساعة
          </p>
        )}
      </section>
    </Screen>
  )
}
