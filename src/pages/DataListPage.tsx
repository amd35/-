import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Swords, Trash2 } from 'lucide-react'
import { Notice, PageHeader, inputClass } from '../components/ui'
import { api, type Room } from '../lib/api'

export default function DataListPage() {
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .rooms()
      .then((data) => active && setRooms(data))
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  async function remove(room: Room) {
    if (!window.confirm(`حذف الغرفة «${room.title}»؟`)) return
    try {
      await api.deleteRoom(room.id)
      setRooms((list) => (list ?? []).filter((item) => item.id !== room.id))
      setNotice(`تم حذف «${room.title}»`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const term = query.trim()
  const visible = (rooms ?? []).filter(
    (room) =>
      term === '' ||
      room.title.includes(term) ||
      room.host.includes(term) ||
      room.category.includes(term),
  )

  return (
    <div>
      <PageHeader
        title="قائمة الغرف"
        subtitle={`${rooms?.length ?? 0} غرفة مسجّلة — ابحث أو احذف`}
        action={
          <Link
            to="/add-item"
            className="shrink-0 rounded-xl bg-fuchsia-600 px-3 py-2 text-[11px] font-bold text-white"
          >
            إضافة
          </Link>
        }
      />

      <div className="mb-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
        <Search size={16} className="text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث بالعنوان أو المضيف أو القسم"
          className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          data-testid="data-search"
        />
      </div>

      {error && <Notice tone="rose">{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}

      <ul className="mt-3 space-y-2" data-testid="data-rows">
        {rooms === null && <li className="py-8 text-center text-xs text-slate-400">جارٍ التحميل…</li>}
        {rooms !== null && visible.length === 0 && (
          <li className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-xs text-slate-400">
            لا نتائج مطابقة.
          </li>
        )}
        {visible.map((room) => (
          <li
            key={room.id}
            data-testid="data-row"
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-white">
                <span className="truncate">{room.title}</span>
                {room.is_battle && <Swords size={13} className="shrink-0 text-amber-400" />}
              </p>
              <button
                type="button"
                aria-label={`حذف ${room.title}`}
                onClick={() => remove(room)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-300"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-slate-300">{room.category}</span>
              <span>المضيف: {room.host}</span>
              <span>{room.listeners} مستمع</span>
              <span>
                {room.seats_taken}/{room.seats_total} مقعد
              </span>
            </p>
          </li>
        ))}
      </ul>

      <Link
        to="/add-item"
        className={`${inputClass} mt-4 block text-center text-xs font-bold text-fuchsia-300`}
      >
        + إضافة غرفة جديدة
      </Link>
    </div>
  )
}
