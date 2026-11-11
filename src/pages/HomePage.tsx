import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Coins, Gem, Plus, Search } from 'lucide-react'
import Avatar from '../components/Avatar'
import RoomCard from '../components/RoomCard'
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
    <div>
      <section className="photo-base photo-roses relative overflow-hidden rounded-3xl border border-white/10 p-4 shadow-lg shadow-rose-950/30">
        <div className="relative flex items-center gap-3">
          <Avatar name={me?.name ?? 'المستخدم'} size={44} online />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-rose-100/80">أهلًا بعودتك</p>
            <h1 className="truncate text-lg leading-tight font-black text-white">
              {me?.name ?? '…'}
            </h1>
            <p className="mt-0.5 text-[10px] font-semibold tracking-wide text-rose-200/80">
              يلا فون · غرف دردشة صوتية
            </p>
          </div>
          <button
            type="button"
            aria-label="التنبيهات"
            className="relative flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white backdrop-blur"
          >
            <Bell size={18} />
            <span className="absolute top-2 left-2.5 size-2 rounded-full bg-rose-500" />
          </button>
        </div>

        <div className="relative mt-3 flex items-center gap-2">
          <span className="flex flex-1 items-center gap-1.5 rounded-2xl border border-amber-300/25 bg-black/30 px-3 py-2 text-xs font-bold text-amber-200 backdrop-blur">
            <Coins size={15} /> {(me?.coins ?? 0).toLocaleString('en-US')}
          </span>
          <span className="flex flex-1 items-center gap-1.5 rounded-2xl border border-cyan-300/25 bg-black/30 px-3 py-2 text-xs font-bold text-cyan-200 backdrop-blur">
            <Gem size={15} /> {(me?.diamonds ?? 0).toLocaleString('en-US')}
          </span>
        </div>
      </section>

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5">
        <Search size={17} className="text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث عن غرفة أو مضيف"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-center text-xs text-red-200">
          {error}
        </p>
      )}

      {featured.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-bold text-white">غرف مميزة</h2>
          <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2">
            {featured.map((room) => (
              <RoomCard key={room.id} room={room} onOpen={onOpenRoom} compact />
            ))}
          </div>
        </section>
      )}

      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">الغرف النشطة</h2>
          <span className="text-[11px] text-slate-400">{visibleRooms.length} غرفة</span>
        </div>

        <div className="-mx-5 mb-3 flex gap-2 overflow-x-auto px-5 pb-1">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              data-testid={`category-${item}`}
              onClick={() => setCategory(item)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                category === item
                  ? 'bg-fuchsia-600 text-white'
                  : 'border border-white/10 bg-white/5 text-slate-300'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {rooms === null && !error && (
          <p className="py-8 text-center text-xs text-slate-400">جارٍ تحميل الغرف…</p>
        )}

        {rooms !== null && visibleRooms.length === 0 && (
          <p className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-xs text-slate-400">
            لا توجد غرف مطابقة.
          </p>
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
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-fuchsia-500 to-violet-600 py-3.5 text-sm font-black text-white shadow-lg shadow-fuchsia-900/40"
      >
        <Plus size={18} /> أنشئ غرفة جديدة
      </Link>
    </div>
  )
}
