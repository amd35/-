import { useEffect, useState } from 'react'
import { BarList, SparkBars } from '../components/Charts'
import { Card, PageHeader, StatTile } from '../components/ui'
import { api, type Metrics } from '../lib/api'

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .metrics()
      .then((data) => active && setMetrics(data))
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  const days = (metrics?.activity_by_day ?? []).map((item) => ({
    label: item.day,
    value: item.count,
  }))

  return (
    <div>
      <PageHeader title="التحليلات" subtitle="اتجاهات الأداء على مدار الأيام الماضية" />

      {error && <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</p>}
      {!metrics && !error && <p className="py-10 text-center text-xs text-slate-400">جارٍ حساب المؤشرات…</p>}

      {metrics && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="إجمالي المستمعين" value={metrics.listeners_total} tone="fuchsia" testId="analytics-listeners" />
            <StatTile label="غرف المعركة" value={metrics.battle_rooms} tone="amber" />
            <StatTile label="مهام منجزة" value={metrics.tasks_done} tone="emerald" />
          </div>

          <Card className="mt-3">
            <p className="mb-3 text-xs font-bold text-white">النشاط اليومي</p>
            {days.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-slate-500">لا يوجد نشاط مسجّل بعد.</p>
            ) : (
              <SparkBars data={days} />
            )}
          </Card>

          <Card className="mt-3">
            <p className="mb-3 text-xs font-bold text-white">الغرف حسب القسم</p>
            <BarList
              data={metrics.categories.map((item) => ({ label: item.name, value: item.count }))}
              color="#a855f7"
            />
          </Card>

          <Card className="mt-3">
            <p className="mb-3 text-xs font-bold text-white">أعلى الغرف استماعًا</p>
            <BarList
              data={metrics.top_rooms.map((room) => ({ label: room.title, value: room.listeners }))}
              color="#f59e0b"
            />
          </Card>

          <Card className="mt-3">
            <p className="mb-2 text-xs font-bold text-white">نسبة إنجاز المهام</p>
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{
                  width: `${(metrics.tasks_done / Math.max(metrics.tasks_done + metrics.tasks_open, 1)) * 100}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              {metrics.tasks_done} منجزة · {metrics.tasks_open} مفتوحة
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
