import { useEffect, useState } from 'react'
import { Activity, Building2, ChevronDown, Layers, MapPin, Search, Users } from 'lucide-react'
import {
  Card,
  Chip,
  EmptyState,
  PageHeader,
  PrimaryButton,
  StatTile,
} from '../components/ui'
import { api, type SystemEntry, type SystemsMeta, type SystemsPage } from '../lib/api'

const PAGE_SIZE = 24

const STATUS_TONES: Record<SystemEntry['status'], string> = {
  يعمل: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200',
  تجريبي: 'border-amber-300/30 bg-amber-400/10 text-amber-200',
  صيانة: 'border-cyan-300/30 bg-cyan-400/10 text-cyan-200',
  متوقف: 'border-white/15 bg-white/5 text-slate-400',
}

function SystemRow({ system }: { system: SystemEntry }) {
  return (
    <li data-testid="system-row" className="glass rounded-3xl p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 font-mono text-[10px] font-bold text-blush-200/70">
          {system.code}
        </span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_TONES[system.status]}`}>
          {system.status}
        </span>
      </div>

      <p className="mt-2 truncate text-sm font-bold text-white">{system.name}</p>
      <p className="mt-1 truncate text-[11px] text-blush-200/60">
        {system.specialty} · {system.vendor}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[10px] font-semibold text-blush-200/50">
        <span className="flex items-center gap-1">
          <MapPin size={11} /> {system.governorate}
        </span>
        <span className="flex items-center gap-1">
          <Users size={11} /> {system.users.toLocaleString('en-US')} مستخدم
        </span>
        <span className="flex items-center gap-1">
          <Activity size={11} /> جاهزية {system.uptime}%
        </span>
        <span className="flex items-center gap-1 font-mono" dir="ltr">
          v{system.version}
        </span>
      </div>
    </li>
  )
}

export default function SystemsPage() {
  const [meta, setMeta] = useState<SystemsMeta | null>(null)
  const [data, setData] = useState<SystemsPage | null>(null)
  const [items, setItems] = useState<SystemEntry[]>([])
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.systemsMeta().then(setMeta).catch(() => undefined)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    api
      .systems({ q: query.trim(), specialty, status, page, page_size: PAGE_SIZE })
      .then((result) => {
        if (!active) return
        setData(result)
        setItems((previous) => (page === 1 ? result.items : [...previous, ...result.items]))
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [query, specialty, status, page])

  function changeQuery(value: string) {
    setQuery(value)
    setPage(1)
  }

  function changeSpecialty(value: string) {
    setSpecialty(value)
    setPage(1)
  }

  function changeStatus(value: string) {
    setStatus(value)
    setPage(1)
  }

  const total = data?.total ?? meta?.total ?? 0
  const hasMore = !!data && items.length < data.total

  return (
    <div>
      <PageHeader
        eyebrow="كتالوج حقيقي"
        title="دليل الأنظمة"
        subtitle={`${(meta?.total ?? 0).toLocaleString('en-US')} نظام في ${meta?.specialties_total ?? 0} اختصاصًا، كل نظام بوظيفته وجهته المطوّرة`}
      />

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="إجمالي الأنظمة" value={(meta?.total ?? 0).toLocaleString('en-US')} tone="fuchsia" testId="systems-total" />
        <StatTile label="الاختصاصات" value={meta?.specialties_total ?? 0} tone="amber" />
        <StatTile label="متوسط الجاهزية" value={`${meta?.uptime_avg ?? 0}%`} tone="emerald" />
      </div>

      <div className="glass mt-4 flex items-center gap-2 rounded-2xl px-3 py-2.5">
        <Search size={17} className="text-blush-200/60" />
        <input
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          placeholder="ابحث بالاسم أو الاختصاص أو الجهة"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
        <span className="text-[10px] font-bold text-blush-200/50">{total.toLocaleString('en-US')}</span>
      </div>

      <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
        <Chip active={status === ''} onClick={() => changeStatus('')}>
          كل الحالات
        </Chip>
        {(meta?.statuses ?? []).map((item) => (
          <Chip
            key={item.name}
            active={status === item.name}
            onClick={() => changeStatus(item.name)}
            data-testid={`status-${item.name}`}
          >
            {item.name} ({item.count})
          </Chip>
        ))}
      </div>

      <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1">
        <Chip active={specialty === ''} onClick={() => changeSpecialty('')}>
          كل الاختصاصات
        </Chip>
        {(meta?.specialties ?? []).map((item) => (
          <Chip
            key={item.name}
            active={specialty === item.name}
            onClick={() => changeSpecialty(item.name)}
            data-testid={`specialty-${item.name}`}
          >
            {item.name} ({item.count})
          </Chip>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-center text-xs text-red-200 backdrop-blur">
          {error}
        </p>
      )}

      {!error && items.length === 0 && !loading && (
        <div className="mt-4">
          <EmptyState>لا توجد أنظمة مطابقة لبحثك.</EmptyState>
        </div>
      )}

      <ul className="mt-3 space-y-2.5" data-testid="systems-list">
        {items.map((system) => (
          <SystemRow key={system.id} system={system} />
        ))}
      </ul>

      {loading && items.length === 0 && (
        <p className="py-8 text-center text-xs text-blush-200/50">جارٍ تحميل الأنظمة…</p>
      )}

      {hasMore && (
        <div className="mt-4">
          <PrimaryButton
            type="button"
            data-testid="systems-more"
            disabled={loading}
            onClick={() => setPage((value) => value + 1)}
          >
            <span className="flex items-center justify-center gap-2">
              {loading ? 'جارٍ التحميل…' : 'عرض المزيد'}
              <ChevronDown size={16} />
            </span>
          </PrimaryButton>
          <p className="mt-2 text-center text-[10px] font-semibold text-blush-200/40">
            عرضت {items.length.toLocaleString('en-US')} من {total.toLocaleString('en-US')}
          </p>
        </div>
      )}

      {meta && (
        <Card className="mt-4 flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-bold text-white">
              <Layers size={14} className="text-amber-300" /> تغطية الكتالوج
            </p>
            <p className="mt-1 text-[11px] text-blush-200/60">
              {(meta.users_total ?? 0).toLocaleString('en-US')} مستخدم مسجّل عبر الأنظمة
            </p>
          </div>
          <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold text-blush-200/70">
            <Building2 size={11} /> 5 جهات مطوّرة
          </span>
        </Card>
      )}
    </div>
  )
}
