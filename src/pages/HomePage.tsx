import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Coins, Gem, Heart, Plus, Search, Sparkles } from 'lucide-react'
import Avatar from '../components/Avatar'
import PageBackdrop from '../components/PageBackdrop'
import RoomCard from '../components/RoomCard'
import { Chip, EmptyState, Pill, SectionTitle } from '../components/ui'
import { api, type Me, type Room } from '../lib/api'

export default function HomePage({ onOpenRoom }: { onOpenRoom: (room: Room) => void }) {
  const [me, setMe] = useState<Me | null>(null)
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('الكل')

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

  const categories = useMemo(
    () => ['الكل', ...new Set((rooms ?? []).map((room) => room.category))],
    [rooms],
  )

  const visibleRooms = useMemo(
    () =>
      (rooms ?? []).filter((room) => {
        const matchCategory = category === 'الكل' || room.category === category
        const term = query.trim()
        const matchQuery =
          term.length === 0 || room.title.includes(term) || room.host.includes(term)
        return matchCategory && matchQuery
      }),
    [rooms, category, query],
  )

  const featured = (rooms ?? []).filter((room) => room.featured)

  return (
    <PageBackdrop photo="roses">
      <section className="glass-deep blush-glow relative overflow-hidden rounded-[1.75rem] p-4">
        <span className="animate-romance-float pointer-events-none absolute -top-10 -left-8 size-32 rounded-full bg-rose-500/25 blur-2xl" />
        <span className="pointer-events-none absolute -right-6 bottom-0 size-28 rounded-full bg-fuchsia-500/20 blur-2xl" />

        <div className="relative flex items-center gap-3">
          <span className="rounded-full bg-gradient-to-br from-rose-400 to-fuchsia-600 p-[2px] shadow-[0_0_22px_-4px_rgba(244,63,94,0.8)]">
            <Avatar name={me?.name ?? 'المستخدم'} size={48} online />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[11px] font-semibold text-blush-200/80">
              مساء الورد
              <Heart size={10} className="text-rose-300" fill="currentColor" />
            </p>
            <h1 className="font-display truncate text-xl leading-tight font-bold text-romance-gradient">
              {me?.name ?? '…'}
            </h1>
            <p className="mt-0.5 text-[10px] font-semibold tracking-wide text-blush-200/60">
              يلا فون · غرف دردشة صوتية بلمسة رومانسية
            </p>
          </div>
          <button
            type="button"
            aria-label="التنبيهات"
            className="relative flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/25 text-white backdrop-blur transition active:scale-95"
          >
            <Bell size={18} />
            <span className="absolute top-2 left-2.5 size-2 rounded-full bg-rose-400 shadow-[0_0_8px_2px_rgba(251,113,133,0.7)]" />
          </button>
        </div>

        <div className="relative mt-3.5 grid grid-cols-2 gap-2">
          <Pill tone="amber" icon={<Coins size={15} />}>
            {(me?.coins ?? 0).toLocaleString('en-US')}
          </Pill>
          <Pill tone="cyan" icon={<Gem size={15} />}>
            {(me?.diamonds ?? 0).toLocaleString('en-US')}
          </Pill>
        </div>
      </section>

      <div className="glass mt-4 flex items-center gap-2 rounded-2xl px-3 py-2.5">
        <Search size={17} className="text-blush-200/60" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث عن غرفة أو مضيف"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
        <Sparkles size={14} className="text-amber-300/70" />
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-center text-xs text-red-200 backdrop-blur">
          {error}
        </p>
      )}

      {featured.length > 0 && (
        <section className="mt-6">
          <SectionTitle icon={<Sparkles size={14} className="text-amber-300" />} hint="مختارة لك">
            غرف مميزة
          </SectionTitle>
          <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-2">
            {featured.map((room) => (
              <RoomCard key={room.id} room={room} onOpen={onOpenRoom} compact />
            ))}
          </div>
        </section>
      )}

      <section className="mt-5">
        <SectionTitle hint={`${visibleRooms.length} غرفة`}>الغرف النشطة</SectionTitle>

        <div className="no-scrollbar -mx-5 mb-3 flex gap-2 overflow-x-auto px-5 pb-1">
          {categories.map((item) => (
            <Chip
              key={item}
              active={category === item}
              data-testid={`category-${item}`}
              onClick={() => setCategory(item)}
            >
              {item}
            </Chip>
          ))}
        </div>

        {rooms === null && !error && (
          <p className="py-8 text-center text-xs text-blush-200/50">جارٍ تحميل الغرف…</p>
        )}

        {rooms !== null && visibleRooms.length === 0 && (
          <EmptyState>لا توجد غرف مطابقة.</EmptyState>
        )}

        <div className="space-y-2.5">
          {visibleRooms.map((room) => (
            <RoomCard key={room.id} room={room} onOpen={onOpenRoom} />
          ))}
        </div>
      </section>

      <Link
        to="/add-item"
        data-testid="create-room-link"
        className="blush-glow mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-rose-500 via-fuchsia-500 to-violet-600 py-3.5 text-sm font-black text-white transition active:scale-[0.99]"
      >
        <Plus size={18} /> أنشئ غرفة جديدة
      </Link>
    </PageBackdrop>
  )
}
