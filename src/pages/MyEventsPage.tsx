import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Coins,
  Crown,
  Diamond,
  Gem,
  Gift,
  History,
  Receipt,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { Screen, ScreenHeader, SectionHead } from '../components/Screen'
import { eventsApi, type MyEvents } from '../lib/eventsApi'
import { PHASE_LABELS, formatDateTime } from '../lib/eventFormat'
import { useEventsLive } from '../lib/useEventsLive'

const TABS = [
  { key: 'participations', label: 'مشاركاتي', Icon: History },
  { key: 'winners', label: 'جوائزي', Icon: Trophy },
  { key: 'ledger', label: 'السجل المالي', Icon: Receipt },
] as const

type TabKey = (typeof TABS)[number]['key']

const LEDGER_KINDS: Record<string, string> = {
  entry_fee: 'رسوم دخول',
  prize: 'جائزة',
  adjustment: 'تعديل',
}

const WINNER_STATUS: Record<string, string> = {
  pending: 'قيد الاعتماد',
  approved: 'معتمدة — بانتظار الإرسال',
  sent: 'تمت الإضافة للحساب',
  cancelled: 'ملغاة',
}

export default function MyEventsPage() {
  const [data, setData] = useState<MyEvents | null>(null)
  const [tab, setTab] = useState<TabKey>('participations')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    eventsApi
      .mine()
      .then((result) => {
        setData(result)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEventsLive((message) => {
    if (message.type === 'event_update') load()
  })

  return (
    <Screen>
      <ScreenHeader title="مشاركاتي وجوائزي" subtitle="سجل كامل لكل مشاركة وفوز وصرف" back={false} />

      <section className="grid grid-cols-3 gap-2">
        <div className="glass rounded-2xl px-2 py-2.5 text-center">
          <Coins size={15} className="mx-auto text-gold" />
          <p className="mt-1 text-base font-black text-amber-200">{data?.gold ?? 0}</p>
          <p className="text-[9px] text-blush-200/50">ذهب</p>
        </div>
        <div className="glass rounded-2xl px-2 py-2.5 text-center">
          <Gem size={15} className="mx-auto text-amber-300" />
          <p className="mt-1 text-base font-black text-amber-200">{data?.coins ?? 0}</p>
          <p className="text-[9px] text-blush-200/50">عملات</p>
        </div>
        <div className="glass rounded-2xl px-2 py-2.5 text-center">
          <Diamond size={15} className="mx-auto text-cyan-300" />
          <p className="mt-1 text-base font-black text-cyan-200">{data?.diamonds ?? 0}</p>
          <p className="text-[9px] text-blush-200/50">ألماس</p>
        </div>
      </section>

      <div className="glass mt-3 grid grid-cols-3 gap-1 rounded-2xl p-1">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-bold transition ${
              tab === key ? 'purple-btn' : 'text-blush-200/60'
            }`}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-center text-xs text-red-200">
          {error}
        </p>
      )}

      {!data && !error && (
        <p className="py-10 text-center text-xs text-blush-200/50">جارٍ تحميل سجلك…</p>
      )}

      {data && tab === 'participations' && (
        <section className="mt-4">
          <SectionHead title="آخر المشاركات" icon={<History size={14} className="text-fuchsia-300" />} hint={`${data.participations.length} مشاركة`} />
          {data.participations.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-center">
              <p className="text-xs text-blush-200/60">لم تشارك في أي فعالية بعد.</p>
              <Link to="/events" className="gold-btn mt-2 inline-flex rounded-full px-4 py-1.5 text-[11px] font-black">
                استعرض الفعاليات
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.participations.map((item) => (
                <li key={item.id}>
                  <Link
                    to={`/events/${item.event_id}`}
                    className="glass flex items-center gap-3 rounded-2xl px-3 py-2.5 transition active:scale-[0.99]"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/40 to-fuchsia-600/30 text-sm">
                      {item.event_phase === 'ended' ? '🏁' : '🎯'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-bold text-white">{item.event_title}</span>
                      <span className="mt-0.5 block text-[9px] text-blush-200/55">
                        {formatDateTime(item.created_at)} · {PHASE_LABELS[item.event_phase as keyof typeof PHASE_LABELS] ?? item.event_phase}
                      </span>
                    </span>
                    <span className="shrink-0 text-end">
                      <span className="block text-sm font-black text-amber-200">{item.score}</span>
                      <span className="text-[9px] text-blush-200/45">
                        {item.status === 'playing' ? 'قيد اللعب' : 'نقطة'}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {data && tab === 'winners' && (
        <section className="mt-4">
          <SectionHead title="جوائزي" icon={<Trophy size={14} className="text-gold" />} hint={`${data.winners.length} جائزة`} />
          {data.winners.length === 0 ? (
            <p className="rounded-3xl border border-white/10 bg-white/[0.04] py-8 text-center text-xs text-blush-200/50">
              لا جوائز بعد — فوزك الأول يقترب.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.winners.map((winner) => (
                <li key={winner.id} className="glass rounded-2xl px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-black/30 text-sm">
                      {winner.rank === 1 ? '🥇' : winner.rank === 2 ? '🥈' : winner.rank === 3 ? '🥉' : `#${winner.rank}`}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-bold text-white">{winner.event_title}</p>
                      <p className="mt-0.5 text-[10px] text-gold">
                        {winner.prize_label || `${winner.prize_kind_label} ${winner.prize_amount}`}
                      </p>
                    </div>
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
                  </div>
                  {winner.sent_at && (
                    <p className="mt-1.5 text-end text-[9px] text-blush-200/45">
                      أُضيفت في {formatDateTime(winner.sent_at)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {data && tab === 'ledger' && (
        <section className="mt-4">
          <SectionHead title="السجل المالي" icon={<Receipt size={14} className="text-gold" />} hint="كل حركة لها مرجع فريد" />
          {data.ledger.length === 0 ? (
            <p className="rounded-3xl border border-white/10 bg-white/[0.04] py-8 text-center text-xs text-blush-200/50">
              لا حركات مالية بعد.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.ledger.map((row) => (
                <li key={row.id} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-black/30 text-[10px]">
                    {row.kind === 'prize' ? <Crown size={12} className="text-gold" /> : <Coins size={12} className="text-blush-200" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] font-bold text-white">
                      {LEDGER_KINDS[row.kind] ?? row.kind} · {row.detail || row.currency}
                    </span>
                    <span className="text-[9px] text-blush-200/45">{formatDateTime(row.created_at)}</span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className={`block text-[11px] font-black ${row.kind === 'prize' ? 'text-emerald-300' : 'text-red-300'}`}>
                      {row.kind === 'prize' ? '+' : '−'}{row.amount}
                    </span>
                    <span className="text-[9px] text-blush-200/45">الرصيد {row.balance_after}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[10px] text-blush-200/40">
        <Sparkles size={11} className="text-gold" /> كل فوز يُعتمد ويُصرف من لوحة الإدارة
      </p>

      <Link
        to="/events"
        className="glass mt-3 flex items-center justify-center gap-1.5 rounded-2xl py-2.5 text-[11px] font-bold text-blush-100"
      >
        <Gift size={14} className="text-fuchsia-300" /> استعرض الفعاليات المتاحة
      </Link>
    </Screen>
  )
}
