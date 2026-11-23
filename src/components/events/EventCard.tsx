import { Link } from 'react-router-dom'
import { CalendarDays, Crown, Sparkles, Users } from 'lucide-react'
import type { GameEvent } from '../../lib/eventsApi'
import { KIND_ICONS, PHASE_LABELS, formatDate, prizeText } from '../../lib/eventFormat'
import Countdown from './Countdown'

const GRADIENTS: Record<string, string> = {
  daily: 'from-[#3b1d78] via-[#6d28d9] to-[#1a0b2e]',
  weekly: 'from-[#5b21b6] via-[#a21caf] to-[#1a0b2e]',
  competition: 'from-[#7c2d12] via-[#b45309] to-[#1a0b2e]',
  challenge: 'from-[#4c1d95] via-[#be123c] to-[#1a0b2e]',
  occasion: 'from-[#831843] via-[#7c3aed] to-[#1a0b2e]',
  exclusive: 'from-[#1a0b2e] via-[#a16207] to-[#3b0764]',
  game: 'from-[#312e81] via-[#7c3aed] to-[#1a0b2e]',
}

const PHASE_TONES: Record<string, string> = {
  active: 'border-emerald-300/40 bg-emerald-400/15 text-emerald-200',
  ending: 'border-red-300/40 bg-red-500/20 text-red-200',
  upcoming: 'border-amber-300/40 bg-amber-400/15 text-amber-200',
  ended: 'border-white/15 bg-white/10 text-blush-200/70',
  paused: 'border-white/15 bg-white/10 text-blush-200/70',
  draft: 'border-white/15 bg-white/10 text-blush-200/70',
}

export default function EventCard({
  event,
  compact,
}: {
  event: GameEvent
  compact?: boolean
}) {
  const topPrize = event.prizes[0]
  const gradient = GRADIENTS[event.kind] ?? GRADIENTS.game
  const active = event.phase === 'active' || event.phase === 'ending'

  return (
    <Link
      to={`/events/${event.id}`}
      data-testid="event-card"
      data-event-id={event.id}
      className={`event-card-3d group relative block overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-br ${gradient} ${
        compact ? 'w-[268px] shrink-0 snap-start' : 'w-full'
      }`}
    >
      {event.media_url && event.media_type === 'video' ? (
        <video
          src={event.media_url}
          className="absolute inset-0 h-full w-full object-cover opacity-55"
          muted
          loop
          playsInline
          autoPlay
        />
      ) : event.media_url ? (
        <img
          src={event.media_url}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-500 group-hover:scale-105"
        />
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-t from-[#080314] via-[#0d0620]/70 to-transparent" />
      <div className="event-sheen pointer-events-none absolute inset-0" />

      <div className={`relative z-10 flex h-full flex-col ${compact ? 'p-3.5' : 'p-4'}`}>
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/35 px-2 py-0.5 text-[9px] font-black text-blush-100 backdrop-blur">
            <span>{KIND_ICONS[event.kind] ?? '✨'}</span>
            {event.kind_label}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black backdrop-blur ${
              PHASE_TONES[event.phase] ?? PHASE_TONES.ended
            }`}
          >
            {active && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
            {PHASE_LABELS[event.phase]}
          </span>
        </div>

        <h3 className={`font-display mt-2 leading-tight font-bold text-white ${compact ? 'text-base' : 'text-lg'}`}>
          {event.title}
        </h3>

        {topPrize && (
          <p className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-xl border border-gold/30 bg-gold/10 px-2 py-1 text-[10px] font-black text-gold">
            <Crown size={11} /> الجائزة الأولى: {prizeText(topPrize)}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[10px] font-semibold text-blush-200/75">
          <span className="flex items-center gap-1">
            <Users size={11} /> {event.participants} مشارك
          </span>
          <span className="flex items-center gap-1">
            <CalendarDays size={11} /> {formatDate(event.ends_at)}
          </span>
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          {event.phase === 'ended' ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-blush-200/60">
              <Sparkles size={11} /> اكتملت الفعالية
            </span>
          ) : (
            <Countdown
              target={event.phase === 'upcoming' ? event.starts_at : event.ends_at}
              prefix={event.phase === 'upcoming' ? 'تبدأ بعد' : 'ينتهي بعد'}
              compact
            />
          )}
          {event.joined ? (
            <span className="rounded-full border border-emerald-300/30 bg-emerald-400/15 px-2 py-0.5 text-[9px] font-black text-emerald-200">
              شاركت
            </span>
          ) : (
            <span className="gold-btn rounded-full px-2.5 py-1 text-[9px] font-black">شارك الآن</span>
          )}
        </div>
      </div>
    </Link>
  )
}
