import { Crown, Gift, Medal } from 'lucide-react'
import type { EventPrize } from '../../lib/eventsApi'
import { PRIZE_ICONS, prizeText } from '../../lib/eventFormat'

const MEDALS = ['🥇', '🥈', '🥉']

export default function EventPrizeList({
  prizes,
  winnersCount,
}: {
  prizes: EventPrize[]
  winnersCount?: number
}) {
  if (prizes.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-4 text-center text-xs text-blush-200/50">
        لم تُحدَّد جوائز هذه الفعالية بعد.
      </p>
    )
  }

  return (
    <ul className="space-y-2" data-testid="event-prizes">
      {prizes.map((prize) => (
        <li
          key={prize.id ?? prize.rank}
          className="flex items-center gap-3 rounded-2xl border border-gold/20 bg-gradient-to-l from-gold/[0.12] via-white/[0.04] to-transparent px-3 py-2.5"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-black/30 text-base">
            {MEDALS[prize.rank - 1] ?? <span className="text-[11px] font-black text-gold">#{prize.rank}</span>}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold text-blush-100">
              المركز {prize.rank}
              {prize.rank === 1 && (
                <Crown size={11} className="ms-1 inline text-gold" />
              )}
            </span>
            <span className="mt-0.5 block text-[10px] text-blush-200/60">
              {prize.kind === 'gift' || prize.kind === 'frame' ? 'جائزة خاصة' : 'تُضاف إلى الحساب بعد الاعتماد'}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[10px] font-black text-gold">
            {prize.kind === 'gift' || prize.kind === 'frame' ? (
              <Gift size={11} />
            ) : (
              <Medal size={11} />
            )}
            {PRIZE_ICONS[prize.kind]} {prizeText(prize)}
          </span>
        </li>
      ))}
      {winnersCount && winnersCount > prizes.length ? (
        <li className="px-2 text-[10px] text-blush-200/45">
          + {winnersCount - prizes.length} مراكز إضافية تُعتمد حسب نتائج المشاركين
        </li>
      ) : null}
    </ul>
  )
}
