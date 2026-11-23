import { Crown, Users } from 'lucide-react'
import type { LeaderboardRow } from '../../lib/eventsApi'
import { teamLabel } from '../../lib/eventFormat'

const MEDALS = ['🥇', '🥈', '🥉']

export default function Leaderboard({
  rows,
  empty = 'لا يوجد متصدرون بعد — كن أول المشاركين.',
  showPlays,
}: {
  rows: LeaderboardRow[]
  empty?: string
  showPlays?: boolean
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-6 text-center text-xs text-blush-200/50">
        {empty}
      </p>
    )
  }

  return (
    <ul className="space-y-1.5" data-testid="leaderboard">
      {rows.map((row) => (
        <li
          key={`${row.user_id}-${row.rank}`}
          className={`flex items-center gap-2.5 rounded-2xl border px-3 py-2 ${
            row.rank === 1
              ? 'border-gold/35 bg-gold/[0.1]'
              : 'border-white/10 bg-white/[0.04]'
          }`}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-black/30 text-xs font-black text-gold">
            {MEDALS[row.rank - 1] ?? `#${row.rank}`}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 truncate text-[11px] font-bold text-white">
              {row.name}
              {row.rank === 1 && <Crown size={11} className="shrink-0 text-gold" />}
            </span>
            <span className="mt-0.5 flex items-center gap-2 text-[9px] text-blush-200/55">
              {row.team ? <span>{teamLabel(row.team)}</span> : null}
              {showPlays && row.plays ? (
                <span className="flex items-center gap-0.5">
                  <Users size={9} /> {row.plays} مشاركة
                </span>
              ) : null}
            </span>
          </span>
          <span className="shrink-0 text-sm font-black text-amber-200 tabular-nums">
            {row.score.toLocaleString('en-US')}
          </span>
        </li>
      ))}
    </ul>
  )
}
