import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, PlusCircle } from 'lucide-react'
import { BarList } from '../components/Charts'
import { Card, PageHeader, StatTile } from '../components/ui'
import { api, type Metrics } from '../lib/api'

export default function DashboardPage() {
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

  return (
    <div>
      <PageHeader
        title="لوحة التحكم"
        subtitle="نظرة سريعة على أداء التطبيق الآن"
        action={
          <Link
            to="/add-item"
            aria-label="إضافة غرفة"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fuchsia-600 text-white"
          >
            <PlusCircle size={18} />
          </Link>
        }
      />

      {error && <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</p>}
      {!metrics && !error && <p className="py-10 text-center text-xs text-slate-400">جارٍ تحميل المؤشرات…</p>}

      {metrics && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <StatTile label="الغرف" value={metrics.rooms_total} testId="metric-rooms" />
            <StatTile label="في المعركة" value={metrics.battle_rooms} tone="amber" />
            <StatTile label="المستمعون" value={metrics.listeners_total} tone="fuchsia" />
            <StatTile label="أصدقاء متصلون" value={`${metrics.friends_online}/${metrics.friends_total}`} tone="emerald" />
            <StatTile label="مهام مفتوحة" value={metrics.tasks_open} />
            <StatTile label="مهام منجزة" value={metrics.tasks_done} />
            <StatTile
              label="أنظمة الكتالوج"
              value={metrics.systems_total}
              tone="fuchsia"
              testId="metric-systems"
            />
            <StatTile label="أنظمة تعمل" value={metrics.systems_online} tone="emerald" />
            <StatTile label="الاختصاصات" value={metrics.specialties_total} tone="amber" />
          </div>

          <Link
            to="/systems"
            data-testid="systems-link"
            className="glass mt-3 flex items-center justify-between gap-3 rounded-3xl p-4 transition hover:border-fuchsia-300/40"
          >
            <div>
              <p className="text-xs font-bold text-white">دليل الأنظمة الشامل</p>
              <p className="mt-0.5 text-[11px] text-blush-200/60">
                {metrics.systems_total} نظامًا موزّعة على {metrics.specialties_total} اختصاصًا
              </p>
            </div>
            <ArrowLeft size={16} className="shrink-0 text-fuchsia-300" />
          </Link>

          <Card className="mt-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white">تنبيهات غير مقروءة</p>
              <p className="mt-0.5 text-[11px] text-slate-400">راجعها لتتابع آخر التحديثات</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xl font-black text-amber-300" data-testid="metric-unread">
                {metrics.unread_notifications}
              </span>
              <Link
                to="/notifications"
                className="flex items-center gap-1 text-[11px] font-bold text-fuchsia-300"
              >
                عرض <ArrowLeft size={13} />
              </Link>
            </div>
          </Card>

          <Card className="mt-3">
            <p className="mb-3 text-xs font-bold text-white">توزيع الغرف على الأقسام</p>
            <BarList data={metrics.categories.map((item) => ({ label: item.name, value: item.count }))} />
          </Card>

          <Card className="mt-3">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold text-white">أكثر الغرف نشاطًا</p>
              <Link to="/data-list" className="text-[11px] font-bold text-fuchsia-300">
                كل الغرف
              </Link>
            </div>
            <ul className="space-y-2">
              {metrics.top_rooms.map((room) => (
                <li key={room.title} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="truncate text-slate-300">{room.title}</span>
                  <span className="shrink-0 font-bold text-slate-400">{room.listeners}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
