import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CalendarDays,
  Coins,
  Crown,
  Flame,
  Gift,
  Medal,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react'
import EventPrizeList from '../components/events/EventPrizeList'
import GamePlay from '../components/events/GamePlay'
import Leaderboard from '../components/events/Leaderboard'
import Countdown from '../components/events/Countdown'
import { Screen, ScreenHeader, SectionHead } from '../components/Screen'
import { eventsApi, type EventWinner, type GameEvent } from '../lib/eventsApi'
import { KIND_ICONS, PHASE_LABELS, formatDateTime, teamLabel } from '../lib/eventFormat'
import { useEventsLive } from '../lib/useEventsLive'

const WINNER_STATUS: Record<string, string> = {
  pending: 'قيد الاعتماد',
  approved: 'معتمدة',
  sent: 'تم الصرف',
  cancelled: 'ملغاة',
}

function WinnersList({ winners }: { winners: EventWinner[] }) {
  return (
    <ul className="space-y-2" data-testid="event-winners">
      {winners.map((winner) => (
        <li
          key={winner.id}
          className="flex items-center gap-3 rounded-2xl border border-gold/25 bg-gradient-to-l from-gold/[0.12] to-transparent px-3 py-2.5"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-black/30 text-sm font-black text-gold">
            {winner.rank === 1 ? '🥇' : winner.rank === 2 ? '🥈' : winner.rank === 3 ? '🥉' : `#${winner.rank}`}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] font-bold text-white">{winner.user_name}</span>
            <span className="mt-0.5 block text-[10px] text-blush-200/60">
              {winner.prize_label || `${winner.prize_kind_label} ${winner.prize_amount}`}
            </span>
          </span>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black ${
              winner.status === 'sent'
                ? 'border-emerald-300/30 bg-emerald-400/15 text-emerald-200'
                : winner.status === 'cancelled'
                  ? 'border-red-300/30 bg-red-400/15 text-red-200'
                  : 'border-amber-300/30 bg-amber-400/10 text-amber-200'
            }`}
          >
            {WINNER_STATUS[winner.status] ?? winner.status}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function EventDetailPage() {
  const { id } = useParams()
  const [event, setEvent] = useState<GameEvent | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!id) return
    eventsApi
      .get(id)
      .then((data) => {
        setEvent(data)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  useEventsLive((message) => {
    if (
      message.type === 'event_update' &&
      (!message.event_id || String(message.event_id) === id)
    ) {
      load()
    }
  })

  if (error) {
    return (
      <Screen>
        <ScreenHeader title="الفعالية" />
        <p className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-center text-xs text-red-200">
          {error}
        </p>
        <Link
          to="/events"
          className="gold-btn mx-auto mt-3 flex w-fit rounded-full px-4 py-2 text-xs font-black"
        >
          العودة إلى الفعاليات
        </Link>
      </Screen>
    )
  }

  if (!event) {
    return (
      <Screen>
        <ScreenHeader title="الفعالية" />
        <p className="py-12 text-center text-xs text-blush-200/50">جارٍ تحميل تفاصيل الفعالية…</p>
      </Screen>
    )
  }

  const active = event.phase === 'active' || event.phase === 'ending'

  return (
    <Screen>
      <ScreenHeader
        title="تفاصيل الفعالية"
        subtitle={event.kind_label}
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

      <section className="event-hero relative overflow-hidden rounded-[28px] border border-gold/25">
        <div className="relative h-48 w-full overflow-hidden">
          {event.media_url && event.media_type === 'video' ? (
            <video
              src={event.media_url}
              className="h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          ) : event.media_url ? (
            <img src={event.media_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[#3b1d78] via-[#7c3aed] to-[#1a0b2e]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#080314] via-[#0d0620]/55 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/35 px-2 py-0.5 text-[9px] font-black text-blush-100 backdrop-blur">
                {KIND_ICONS[event.kind]} {event.kind_label}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black backdrop-blur ${
                  active
                    ? 'border-emerald-300/40 bg-emerald-400/15 text-emerald-200'
                    : 'border-white/15 bg-white/10 text-blush-200/70'
                }`}
              >
                {active && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
                {PHASE_LABELS[event.phase]}
              </span>
              {event.joined && (
                <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[9px] font-black text-gold">
                  شاركت
                </span>
              )}
            </div>
            <h1 className="font-display mt-2 text-2xl leading-tight font-bold text-white drop-shadow">
              {event.title}
            </h1>
            <p className="mt-1 flex items-center gap-2 text-[10px] font-bold text-blush-200/75">
              <Users size={11} /> {event.participants} مشارك
              <span className="text-blush-200/35">·</span>
              <Trophy size={11} className="text-gold" /> {event.game_name}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-white/10 bg-black/25 p-3">
          <div className="text-center">
            <p className="text-[9px] font-bold text-blush-200/50">البداية</p>
            <p className="mt-0.5 text-[10px] font-black text-blush-100">{formatDateTime(event.starts_at)}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-bold text-blush-200/50">النهاية</p>
            <p className="mt-0.5 text-[10px] font-black text-blush-100">{formatDateTime(event.ends_at)}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] font-bold text-blush-200/50">الوقت المتبقي</p>
            <p className="mt-0.5">
              {event.phase === 'ended' ? (
                <span className="text-[10px] font-black text-blush-200/60">انتهت</span>
              ) : (
                <Countdown
                  target={event.phase === 'upcoming' ? event.starts_at : event.ends_at}
                  compact
                />
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-3 grid grid-cols-3 gap-2">
        <div className="glass rounded-2xl px-2 py-2 text-center">
          <Coins size={14} className="mx-auto text-gold" />
          <p className="mt-1 text-[11px] font-black text-white">
            {event.entry_fee_gold > 0 ? `${event.entry_fee_gold} ذهب` : 'مجانية'}
          </p>
          <p className="text-[9px] text-blush-200/50">رسوم الدخول</p>
        </div>
        <div className="glass rounded-2xl px-2 py-2 text-center">
          <Crown size={14} className="mx-auto text-gold" />
          <p className="mt-1 text-[11px] font-black text-white">{event.winners_count}</p>
          <p className="text-[9px] text-blush-200/50">عدد الفائزين</p>
        </div>
        <div className="glass rounded-2xl px-2 py-2 text-center">
          <Flame size={14} className="mx-auto text-red-400" />
          <p className="mt-1 text-[11px] font-black text-white">{event.game_duration}ث</p>
          <p className="text-[9px] text-blush-200/50">مدة اللعبة</p>
        </div>
      </section>

      {event.description && (
        <section className="mt-3">
          <SectionHead title="عن الفعالية" icon={<Sparkles size={14} className="text-gold" />} />
          <p className="glass rounded-2xl px-3 py-3 text-[11px] leading-relaxed text-blush-100/85">
            {event.description}
          </p>
        </section>
      )}

      <div className="mt-3">
        <GamePlay event={event} onUpdated={(updated) => setEvent(updated)} />
      </div>

      <section className="mt-4">
        <SectionHead
          title="الجوائز"
          icon={<Trophy size={14} className="text-gold" />}
          hint={`${event.winners_count} فائز`}
        />
        <EventPrizeList prizes={event.prizes} winnersCount={event.winners_count} />
      </section>

      {(event.rules || event.conditions) && (
        <section className="mt-4 grid gap-2">
          {event.rules && (
            <div className="glass rounded-2xl px-3 py-3">
              <p className="mb-1 flex items-center gap-1 text-[11px] font-black text-white">
                <ScrollText size={13} className="text-gold" /> طريقة اللعب
              </p>
              <p className="text-[11px] leading-relaxed text-blush-200/75">{event.rules}</p>
            </div>
          )}
          {event.conditions && (
            <div className="glass rounded-2xl px-3 py-3">
              <p className="mb-1 flex items-center gap-1 text-[11px] font-black text-white">
                <ShieldCheck size={13} className="text-emerald-300" /> الشروط
              </p>
              <p className="text-[11px] leading-relaxed text-blush-200/75">{event.conditions}</p>
            </div>
          )}
        </section>
      )}

      {Object.keys(event.team_scores ?? {}).length > 0 && (
        <section className="mt-4">
          <SectionHead title="حصيلة الفرق" icon={<Users size={14} className="text-fuchsia-300" />} />
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(event.team_scores).map(([team, score]) => (
              <div
                key={team}
                className={`rounded-2xl border px-3 py-2 text-center ${
                  team === 'fire'
                    ? 'border-red-300/30 bg-red-500/10'
                    : 'border-fuchsia-300/30 bg-fuchsia-500/10'
                }`}
              >
                <p className="text-[10px] font-bold text-blush-100">{teamLabel(team)}</p>
                <p className="mt-0.5 text-lg font-black text-amber-200">{score}</p>
                <p className="text-[9px] text-blush-200/45">نقطة</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-4">
        <SectionHead
          title="ترتيب المتصدرين"
          icon={<Medal size={14} className="text-gold" />}
          hint={`${event.participants} مشارك`}
        />
        <Leaderboard rows={event.leaderboard} empty="لا نتائج بعد — شارك وكن الأول." />
      </section>

      {event.winners.length > 0 && (
        <section className="mt-4">
          <SectionHead
            title="الفائزون"
            icon={<Gift size={14} className="text-fuchsia-300" />}
            hint="بعد اعتماد الإدارة"
          />
          <WinnersList winners={event.winners} />
        </section>
      )}

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[10px] text-blush-200/40">
        <CalendarDays size={11} className="text-gold" /> تُحدَّث الصفحة لحظيًا عبر WebSocket
      </p>
    </Screen>
  )
}
