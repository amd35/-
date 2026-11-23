import { useCallback, useEffect, useState } from 'react'
import { Crown, Flame, Medal, Sparkles } from 'lucide-react'
import Leaderboard from '../components/events/Leaderboard'
import { Screen, ScreenHeader, SectionHead } from '../components/Screen'
import { eventsApi, type LeaderboardRow } from '../lib/eventsApi'
import { useEventsLive } from '../lib/useEventsLive'

const PERIODS = [
  { key: 'daily', label: 'اليومي' },
  { key: 'weekly', label: 'الأسبوعي' },
  { key: 'all', label: 'الكل' },
] as const

type Period = (typeof PERIODS)[number]['key']

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<Period>('weekly')
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    eventsApi
      .leaderboard(period)
      .then((data) => {
        setRows(data.rows)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [period])

  useEffect(() => {
    load()
  }, [load])

  useEventsLive((message) => {
    if (message.type === 'event_update') load()
  })

  return (
    <Screen>
      <ScreenHeader title="لوحة المتصدرين" subtitle="ترتيب يومي وأسبوعي" back={false} />

      <section className="relative overflow-hidden rounded-[26px] border border-gold/25 bg-gradient-to-br from-[#3b1d78] via-[#6d28d9] to-[#1a0b2e] p-4">
        <span className="animate-romance-float pointer-events-none absolute -top-6 left-3 size-24 rounded-full bg-amber-300/20 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 to-yellow-600 text-[#2a1600]">
            <Crown size={24} />
          </span>
          <div>
            <p className="flex items-center gap-1 text-[10px] font-black text-gold">
              <Sparkles size={11} /> أبطال يلا فون
            </p>
            <p className="mt-1 text-sm font-black text-white">من يجمع أكبر عدد من النقاط؟</p>
            <p className="mt-0.5 text-[10px] text-blush-200/70">تُجمع النقاط من مشاركاتك الفعلية فقط</p>
          </div>
        </div>
      </section>

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

      <section className="mt-4">
        <SectionHead
          title={`ترتيب ${PERIODS.find((item) => item.key === period)?.label ?? ''}`}
          icon={<Medal size={14} className="text-gold" />}
          hint={<span className="flex items-center gap-1"><Flame size={10} /> مباشر</span>}
        />
        {rows === null && !error ? (
          <p className="py-8 text-center text-xs text-blush-200/50">جارٍ تحميل الترتيب…</p>
        ) : (
          <Leaderboard rows={rows ?? []} showPlays />
        )}
      </section>

      <p className="mt-4 text-center text-[10px] leading-relaxed text-blush-200/40">
        الترتيب مبني على مجموع نقاط المشاركات المنتهية. يُستبعد أي حساب يثبت تلاعبه.
      </p>
    </Screen>
  )
}
