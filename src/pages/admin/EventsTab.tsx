import { useState } from 'react'
import {
  BarChart3,
  Eye,
  EyeOff,
  Megaphone,
  Pause,
  Pencil,
  Play,
  Plus,
  Trash2,
  Trophy,
} from 'lucide-react'
import { adminApi, type GameEvent } from '../../lib/eventsApi'
import { KIND_ICONS, PHASE_LABELS, formatDateTime, prizeText } from '../../lib/eventFormat'

export default function EventsTab({
  events,
  onCreate,
  onEdit,
  onResults,
  onRefresh,
}: {
  events: GameEvent[]
  onCreate: () => void
  onEdit: (event: GameEvent) => void
  onResults: (id: number) => void
  onRefresh: () => void
}) {
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function run(id: number, action: () => Promise<unknown>, message: string) {
    setBusyId(id)
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(message)
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تنفيذ العملية')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-blush-200/60">
          {events.length} فعالية · {events.filter((event) => event.phase === 'active' || event.phase === 'ending').length} مباشرة
        </p>
        <button
          type="button"
          onClick={onCreate}
          data-testid="new-event"
          className="gold-btn flex items-center gap-1 rounded-full px-3.5 py-2 text-[11px] font-black"
        >
          <Plus size={13} /> فعالية جديدة
        </button>
      </div>

      {error && (
        <p className="mb-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-2 rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-[11px] text-emerald-200">
          {notice}
        </p>
      )}

      {events.length === 0 && (
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] py-8 text-center text-xs text-blush-200/50">
          لا فعاليات بعد — أنشئ أول فعالية.
        </p>
      )}

      <ul className="space-y-2">
        {events.map((event) => (
          <li key={event.id} className="glass rounded-2xl p-3">
            <div className="flex items-start gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/35 to-fuchsia-600/25 text-sm">
                {KIND_ICONS[event.kind] ?? '✨'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-[12px] font-bold text-white">{event.title}</p>
                  <span className="rounded-full border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-bold text-blush-200/70">
                    {event.kind_label}
                  </span>
                  <span
                    className={`rounded-full border px-1.5 py-0.5 text-[9px] font-black ${
                      event.phase === 'active' || event.phase === 'ending'
                        ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
                        : 'border-white/15 bg-white/[0.05] text-blush-200/60'
                    }`}
                  >
                    {PHASE_LABELS[event.phase]}
                  </span>
                  {!event.published && (
                    <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-200">
                      غير منشورة
                    </span>
                  )}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[9px] text-blush-200/55">
                  <span>{event.game_name}</span>
                  <span>· {event.participants} مشارك</span>
                  <span>· {formatDateTime(event.ends_at)}</span>
                  {event.prizes[0] && (
                    <span className="text-gold">· {prizeText(event.prizes[0])}</span>
                  )}
                </p>
                {event.pending_winners ? (
                  <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold text-amber-200">
                    <Trophy size={9} /> {event.pending_winners} جائزة بانتظار الاعتماد
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onEdit(event)}
                className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold text-blush-100"
              >
                <Pencil size={10} /> تعديل
              </button>
              <button
                type="button"
                disabled={busyId === event.id}
                onClick={() =>
                  run(
                    event.id,
                    () =>
                      adminApi.setStatus(
                        event.id,
                        event.status === 'active' ? 'paused' : 'active',
                      ),
                    event.status === 'active' ? 'تم إيقاف المشاركة' : 'تم تفعيل المشاركة',
                  )
                }
                className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold text-blush-100 disabled:opacity-50"
              >
                {event.status === 'active' ? <Pause size={10} /> : <Play size={10} />}
                {event.status === 'active' ? 'إيقاف المشاركة' : 'تفعيل المشاركة'}
              </button>
              <button
                type="button"
                disabled={busyId === event.id}
                onClick={() =>
                  run(
                    event.id,
                    () => adminApi.setStatus(event.id, event.status, !event.published),
                    event.published ? 'أُخفيت من الرئيسية' : 'نُشرت في الرئيسية',
                  )
                }
                className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold text-blush-100 disabled:opacity-50"
              >
                {event.published ? <EyeOff size={10} /> : <Eye size={10} />}
                {event.published ? 'إخفاء' : 'نشر'}
              </button>
              <button
                type="button"
                disabled={busyId === event.id}
                onClick={() =>
                  run(event.id, () => adminApi.publishEventBanner(event.id), 'نُشر إعلان الفعالية في الرئيسية')
                }
                className="flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[10px] font-bold text-gold disabled:opacity-50"
              >
                <Megaphone size={10} /> إعلان في الرئيسية
              </button>
              <button
                type="button"
                onClick={() => onResults(event.id)}
                className="flex items-center gap-1 rounded-full border border-fuchsia-300/30 bg-fuchsia-500/10 px-2.5 py-1 text-[10px] font-bold text-fuchsia-200"
              >
                <BarChart3 size={10} /> المشاركون والنتائج
              </button>
              <button
                type="button"
                disabled={busyId === event.id}
                onClick={() => {
                  if (!window.confirm(`حذف فعالية «${event.title}» وكل مشاركاتها؟`)) return
                  run(event.id, () => adminApi.deleteEvent(event.id), 'حُذفت الفعالية')
                }}
                className="flex items-center gap-1 rounded-full border border-red-300/25 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold text-red-200 disabled:opacity-50"
              >
                <Trash2 size={10} /> حذف
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
