import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  Crown,
  Loader2,
  RefreshCw,
  Send,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react'
import {
  adminApi,
  type EventWinner,
  type GameEvent,
  type ParticipantRow,
} from '../../lib/eventsApi'
import { teamLabel } from '../../lib/eventFormat'

const WINNER_STATUS: Record<string, string> = {
  pending: 'بانتظار الاعتماد',
  approved: 'معتمدة',
  sent: 'تم الصرف',
  cancelled: 'ملغاة',
}

export default function ResultsTab({
  events,
  initialEventId,
  onRefresh,
}: {
  events: GameEvent[]
  initialEventId?: number | null
  onRefresh: () => void
}) {
  const [selected, setSelected] = useState<number | ''>(
    initialEventId ?? events[0]?.id ?? '',
  )
  const [participants, setParticipants] = useState<ParticipantRow[]>([])
  const [teams, setTeams] = useState<Record<string, number>>({})
  const [event, setEvent] = useState<GameEvent | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (initialEventId) setSelected(initialEventId)
  }, [initialEventId])

  const load = useCallback(() => {
    if (!selected) return
    setBusy(true)
    setError(null)
    adminApi
      .participants(Number(selected))
      .then((data) => {
        setEvent(data.event)
        setParticipants(data.participants)
        setTeams(data.teams)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false))
  }, [selected])

  useEffect(() => {
    load()
  }, [load])

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(message)
      load()
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تنفيذ العملية')
    } finally {
      setBusy(false)
    }
  }

  async function finalize() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const result = await adminApi.finalize(Number(selected))
      setNotice(
        result.created > 0
          ? `تم احتساب ${result.created} فائزًا — راجع الجوائز واعتمدها.`
          : 'لا توجد مشاركات منتهية لاحتسابها.',
      )
      load()
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر احتساب النتائج')
    } finally {
      setBusy(false)
    }
  }

  function winnerAction(winner: EventWinner, action: 'approve' | 'send' | 'cancel') {
    if (!selected) return
    const call =
      action === 'approve'
        ? adminApi.approveWinner(Number(selected), winner.id)
        : action === 'send'
          ? adminApi.sendWinner(Number(selected), winner.id)
          : adminApi.cancelWinner(Number(selected), winner.id)
    const message =
      action === 'approve'
        ? 'تم اعتماد الجائزة'
        : action === 'send'
          ? 'تم إرسال الجائزة إلى الحساب'
          : 'أُلغيت الجائزة'
    run(() => call, message)
  }

  if (events.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/[0.04] py-8 text-center text-xs text-blush-200/50">
        أنشئ فعالية أولًا لتتابع المشاركين والنتائج.
      </p>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          className="w-full rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2.5 text-xs text-white focus:outline-none"
          value={selected}
          onChange={(event) => setSelected(event.target.value ? Number(event.target.value) : '')}
        >
          {events.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title} — {item.participants} مشارك
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={load}
          aria-label="تحديث"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] text-blush-100"
        >
          <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <p className="mt-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-2 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-200">
          {notice}
        </p>
      )}

      {event && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="glass rounded-2xl px-2 py-2 text-center">
              <Users size={14} className="mx-auto text-fuchsia-300" />
              <p className="mt-1 text-base font-black text-white">{event.participants}</p>
              <p className="text-[9px] text-blush-200/50">مشارك</p>
            </div>
            <div className="glass rounded-2xl px-2 py-2 text-center">
              <Trophy size={14} className="mx-auto text-gold" />
              <p className="mt-1 text-base font-black text-white">{event.winners_count}</p>
              <p className="text-[9px] text-blush-200/50">فائز مطلوب</p>
            </div>
            <div className="glass rounded-2xl px-2 py-2 text-center">
              <Crown size={14} className="mx-auto text-amber-300" />
              <p className="mt-1 text-base font-black text-white">{event.pending_winners ?? 0}</p>
              <p className="text-[9px] text-blush-200/50">بانتظار الاعتماد</p>
            </div>
          </div>

          <button
            type="button"
            onClick={finalize}
            disabled={busy || event.finalized}
            className="purple-btn mt-2 flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-[11px] font-black disabled:opacity-60"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Trophy size={13} />}
            {event.finalized ? 'تم احتساب النتائج واعتماد الفائزين' : 'احتساب النتائج واعتماد الفائزين'}
          </button>

          {Object.keys(teams).length > 0 && (
            <div className="mt-2 flex gap-2">
              {Object.entries(teams).map(([team, score]) => (
                <span
                  key={team}
                  className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5 text-center text-[10px] font-bold text-blush-100"
                >
                  {teamLabel(team)}: {score}
                </span>
              ))}
            </div>
          )}

          {event.winners.length > 0 && (
            <section className="mt-3">
              <p className="mb-2 text-[11px] font-black text-white">الفائزون والجوائز</p>
              <ul className="space-y-2">
                {event.winners.map((winner) => (
                  <li key={winner.id} className="glass rounded-2xl p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-full bg-black/30 text-[11px] font-black text-gold">
                        {winner.rank === 1 ? '🥇' : winner.rank === 2 ? '🥈' : winner.rank === 3 ? '🥉' : `#${winner.rank}`}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-bold text-white">{winner.user_name}</p>
                        <p className="text-[10px] text-gold">
                          {winner.prize_label || `${winner.prize_kind_label} ${winner.prize_amount}`}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${
                          winner.status === 'sent'
                            ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
                            : winner.status === 'cancelled'
                              ? 'border-red-300/30 bg-red-400/10 text-red-200'
                              : 'border-amber-300/30 bg-amber-400/10 text-amber-200'
                        }`}
                      >
                        {WINNER_STATUS[winner.status] ?? winner.status}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {winner.status === 'pending' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => winnerAction(winner, 'approve')}
                          className="flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-bold text-amber-200 disabled:opacity-50"
                        >
                          <CheckCircle2 size={10} /> اعتماد
                        </button>
                      )}
                      {winner.status !== 'sent' && winner.status !== 'cancelled' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => winnerAction(winner, 'send')}
                          className="gold-btn flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black disabled:opacity-50"
                        >
                          <Send size={10} /> إرسال للحساب
                        </button>
                      )}
                      {winner.status !== 'sent' && winner.status !== 'cancelled' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => winnerAction(winner, 'cancel')}
                          className="flex items-center gap-1 rounded-full border border-red-300/25 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold text-red-200 disabled:opacity-50"
                        >
                          <XCircle size={10} /> إلغاء
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-3">
            <p className="mb-2 text-[11px] font-black text-white">المشاركون ({participants.length})</p>
            {participants.length === 0 ? (
              <p className="rounded-2xl border border-white/10 bg-white/[0.04] py-6 text-center text-[11px] text-blush-200/50">
                لا مشاركات بعد.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {participants.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5"
                  >
                    <span className="w-6 shrink-0 text-[10px] font-black text-blush-200/60">#{row.rank}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10px] font-bold text-white">{row.name}</span>
                      <span className="text-[9px] text-blush-200/45">
                        {row.status === 'playing' ? 'قيد اللعب' : 'منتهية'}
                        {row.team ? ` · ${teamLabel(row.team)}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] font-black text-amber-200">{row.score}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[9px] leading-relaxed text-blush-200/45">
            إرسال الجائزة يضيف الذهب/العملات/الألماس إلى الحساب مرة واحدة فقط، ويُسجَّل بمرجع فريد.
            جوائز الهدايا والإطارات تُسجَّل كاستحقاق في سجل الفائز وتظهر في «جوائزي».
          </p>
        </>
      )}
    </div>
  )
}
