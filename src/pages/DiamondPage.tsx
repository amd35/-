import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownToLine, ArrowLeftRight, Diamond, TrendingDown, TrendingUp } from 'lucide-react'
import { Screen, ScreenHeader } from '../components/Screen'
import { api, type Me, type Metrics } from '../lib/api'

const PERIODS = [
  { key: 'today', label: 'اليوم', days: 1 },
  { key: 'week', label: 'الأسبوع', days: 7 },
  { key: 'month', label: 'الشهر', days: 14 },
] as const

type PeriodKey = (typeof PERIODS)[number]['key']

export default function DiamondPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([api.me(), api.metrics()])
      .then(([profile, data]) => {
        if (!active) return
        setMe(profile)
        setMetrics(data)
      })
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  const days = PERIODS.find((item) => item.key === period)?.days ?? 14
  const series = (metrics?.activity_by_day ?? []).slice(-days)
  const values = series.map((item) => item.count)
  const max = Math.max(...values, 1)

  const half = Math.floor(values.length / 2)
  const before = values.slice(0, half).reduce((sum, value) => sum + value, 0)
  const after = values.slice(half).reduce((sum, value) => sum + value, 0)
  const growth = before === 0 ? (after > 0 ? 100 : 0) : Math.round(((after - before) / before) * 100)
  const positive = growth >= 0

  return (
    <Screen>
      <ScreenHeader title="الألماس" subtitle="أرباحك وتفاصيل الدخل" />

      {/* الرصيد */}
      <section className="relative overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-[#3b1d7a] via-[#2a1259] to-[#170a33] p-4">
        <span className="pointer-events-none absolute -top-10 -left-8 size-32 rounded-full bg-cyan-400/20 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-sky-600 text-[#06182b] shadow-[0_10px_30px_-10px_rgba(56,189,248,0.9)]">
            <Diamond size={26} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-blush-200/70">رصيد الألماس</p>
            <p className="font-display text-3xl leading-none font-black text-white">
              {(me?.diamonds ?? 0).toLocaleString('en-US')}
            </p>
          </div>
        </div>

        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <Link
            to="/contact"
            className="flex items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/10 py-2 text-[11px] font-bold text-white"
          >
            <ArrowDownToLine size={13} /> سحب
          </Link>
          <Link
            to="/vcoin"
            className="gold-btn flex items-center justify-center gap-1.5 rounded-full py-2 text-[11px] font-black"
          >
            <ArrowLeftRight size={13} /> استبدال
          </Link>
        </div>
      </section>

      {/* الفترات */}
      <div className="glass mt-3 grid grid-cols-3 gap-1 rounded-2xl p-1">
        {PERIODS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setPeriod(item.key)}
            className={`rounded-xl py-2 text-[11px] font-bold transition ${
              period === item.key ? 'purple-btn' : 'text-blush-200/60'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-center text-xs text-red-200">
          {error}
        </p>
      )}

      {/* الرسم */}
      <section className="glass mt-3 rounded-3xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-black text-white">تفاصيل الأرباح</p>
            <p className="mt-0.5 text-[10px] font-semibold text-blush-200/60">ألماس مستلم من الهدايا</p>
          </div>
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black ${
              positive ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'
            }`}
          >
            {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {positive ? '+' : ''}
            {growth}%
          </span>
        </div>

        {series.length === 0 ? (
          <p className="py-10 text-center text-xs text-blush-200/50">لا توجد بيانات لهذه الفترة بعد.</p>
        ) : (
          <div className="flex h-40 items-end gap-1.5">
            {series.map((item, index) => {
              const value = values[index] ?? 0
              return (
                <div key={item.day} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[9px] font-bold text-blush-200/70">{value}</span>
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-lg bg-gradient-to-t from-violet-700 via-fuchsia-500 to-amber-300"
                      style={{ height: `${Math.max((value / max) * 100, 6)}%` }}
                    />
                  </div>
                  <span className="text-[8px] text-blush-200/40">{item.day.slice(5)}</span>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* أكثر الغرف ربحاً */}
      <section className="glass mt-3 rounded-3xl p-4">
        <p className="mb-2 text-xs font-black text-white">أكثر الغرف نشاطًا</p>
        <ul className="space-y-2">
          {(metrics?.top_rooms ?? []).map((room, index) => (
            <li key={room.title} className="flex items-center gap-2 text-[11px]">
              <span className="flex size-5 items-center justify-center rounded-full bg-gold/15 text-[9px] font-black text-gold">
                {index + 1}
              </span>
              <span className="flex-1 truncate text-slate-300">{room.title}</span>
              <span className="font-bold text-blush-200/70">{room.listeners.toLocaleString('en-US')}</span>
            </li>
          ))}
          {(metrics?.top_rooms ?? []).length === 0 && (
            <li className="py-4 text-center text-[11px] text-blush-200/50">لا توجد بيانات بعد.</li>
          )}
        </ul>
      </section>
    </Screen>
  )
}
