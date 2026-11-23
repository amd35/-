import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  Crown,
  Flame,
  Gift,
  Medal,
  Settings2,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react'
import BottomNav from '../components/BottomNav'
import EventCard from '../components/events/EventCard'
import Leaderboard from '../components/events/Leaderboard'
import { Screen, ScreenHeader, SectionHead } from '../components/Screen'
import { eventsApi, type GameEvent, type LeaderboardRow } from '../lib/eventsApi'
import { KIND_ICONS } from '../lib/eventFormat'
import { useEventsLive } from '../lib/useEventsLive'

const FILTERS = [
  { key: '', label: 'الكل' },
  { key: 'daily', label: 'يومية' },
  { key: 'weekly', label: 'أسبوعية' },
  { key: 'competition', label: 'مسابقات' },
  { key: 'challenge', label: 'تحديات' },
  { key: 'occasion', label: 'مناسبات' },
  { key: 'exclusive', label: 'حصرية' },
]

export default function EventsPage() {
  const [events, setEvents] = useState<GameEvent[] | null>(null)
  const [top, setTop] = useState<LeaderboardRow[]>([])
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([eventsApi.list(filter || undefined), eventsApi.leaderboard('weekly')])
      .then(([list, board]) => {
        setEvents(list)
        setTop(board.rows.slice(0, 5))
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  useEventsLive((message) => {
    if (message.type === 'event_update' || message.type === 'games_update') load()
  })

  const live = (events ?? []).filter((event) => event.phase === 'active' || event.phase === 'ending')
  const upcoming = (events ?? []).filter((event) => event.phase === 'upcoming')
  const past = (events ?? []).filter((event) => event.phase === 'ended' || event.phase === 'paused')

  return (
    <Screen>
      <ScreenHeader
        title="النشاطات والفعاليات"
        subtitle="جوائز ذهبية · تحديات · مسابقات"
        back={false}
        action={
          <Link
            to="/admin/events"
            aria-label="إدارة الفعاليات"
            className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-blush-200"
          >
            <Settings2 size={16} />
          </Link>
        }
      />

      <section className="event-hero relative overflow-hidden rounded-[28px] border border-gold/25 p-4">
        <span className="animate-romance-float pointer-events-none absolute -top-8 left-0 size-28 rounded-full bg-amber-300/20 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 via-yellow-500 to-red-600 text-[#2a1600] shadow-[0_10px_30px_-12px_rgba(255,201,60,0.9)]">
            <Trophy size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[10px] font-black tracking-wide text-gold">
              <Sparkles size={11} /> موسم الجوائز
            </p>
            <p className="mt-1 text-sm font-black text-white">العب، نافس، واربح ذهبًا حقيقيًا</p>
            <p className="mt-0.5 text-[10px] text-blush-200/70">
              كل النتائج تُحسب على السيرفر — منع التلاعب وتكرار الاستلام
            </p>
          </div>
        </div>
        <div className="relative mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/10 bg-black/25 px-2 py-2 text-center">
            <p className="text-lg font-black text-amber-200">{live.length}</p>
            <p className="text-[9px] font-bold text-blush-200/60">مباشرة الآن</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 px-2 py-2 text-center">
            <p className="text-lg font-black text-amber-200">{events?.length ?? 0}</p>
            <p className="text-[9px] font-bold text-blush-200/60">إجمالي الفعاليات</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 px-2 py-2 text-center">
            <p className="text-lg font-black text-amber-200">
              {(events ?? []).reduce((total, event) => total + event.participants, 0)}
            </p>
            <p className="text-[9px] font-bold text-blush-200/60">مشاركة</p>
          </div>
        </div>
      </section>

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((item) => (
          <button
            key={item.key || 'all'}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-bold transition ${
              filter === item.key
                ? 'gold-btn'
                : 'border border-white/10 bg-white/[0.06] text-blush-200/75'
            }`}
          >
            {item.key ? `${KIND_ICONS[item.key]} ` : ''}
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-center text-xs text-red-200">
          {error}
        </p>
      )}

      {events === null && !error && (
        <p className="py-10 text-center text-xs text-blush-200/50">جارٍ تحميل الفعاليات…</p>
      )}

      {events !== null && events.length === 0 && (
        <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-center">
          <p className="text-xs text-blush-200/60">لا توجد فعاليات منشورة في هذا التصنيف بعد.</p>
          <Link
            to="/admin/events"
            className="gold-btn mt-2 inline-flex rounded-full px-4 py-1.5 text-[11px] font-black"
          >
            أنشئ فعالية من لوحة الإدارة
          </Link>
        </div>
      )}

      {live.length > 0 && (
        <section className="mt-4">
          <SectionHead
            title="مباشرة الآن"
            icon={<Flame size={14} className="text-red-400" />}
            hint={`${live.length} فعالية`}
          />
          <div className="space-y-3">
            {live.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mt-5">
          <SectionHead title="تبدأ قريبًا" icon={<CalendarDays size={14} className="text-amber-300" />} />
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} compact />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="mt-5">
          <SectionHead title="فعاليات منتهية" icon={<Gift size={14} className="text-blush-300" />} />
          <div className="space-y-3">
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-5">
        <SectionHead
          title="متصدرو الأسبوع"
          icon={<Medal size={14} className="text-gold" />}
          hint={
            <Link to="/leaderboard" className="text-gold">
              الترتيب الكامل
            </Link>
          }
        />
        <Leaderboard rows={top} empty="لا مشاركات هذا الأسبوع بعد." showPlays />
      </section>

      <section className="mt-4 grid grid-cols-2 gap-2">
        <Link
          to="/my-events"
          className="glass flex items-center gap-2 rounded-2xl px-3 py-3 text-[11px] font-bold text-blush-100"
        >
          <Gift size={16} className="text-fuchsia-300" /> مشاركاتي وجوائزي
        </Link>
        <Link
          to="/leaderboard"
          className="glass flex items-center gap-2 rounded-2xl px-3 py-3 text-[11px] font-bold text-blush-100"
        >
          <Crown size={16} className="text-gold" /> لوحة المتصدرين
        </Link>
      </section>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[10px] text-blush-200/40">
        <Zap size={11} className="text-gold" /> تحديث لحظي عبر WebSocket
      </p>

      <BottomNav />
    </Screen>
  )
}
