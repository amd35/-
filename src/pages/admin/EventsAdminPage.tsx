import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BarChart3,
  BellRing,
  Gamepad2,
  KeyRound,
  Loader2,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { PageHeader } from '../../components/ui'
import {
  adminApi,
  EventsApiError,
  getAdminKey,
  setAdminKey,
  type Banner,
  type GameCatalogItem,
  type GameEvent,
} from '../../lib/eventsApi'
import { useEventsLive } from '../../lib/useEventsLive'
import BannersTab from './BannersTab'
import EventForm from './EventForm'
import EventsTab from './EventsTab'
import GamesTab from './GamesTab'
import ResultsTab from './ResultsTab'

const TABS = [
  { key: 'events', label: 'الفعاليات', Icon: Trophy },
  { key: 'games', label: 'الألعاب', Icon: Gamepad2 },
  { key: 'banners', label: 'البانرات', Icon: Megaphone },
  { key: 'results', label: 'المشاركون والنتائج', Icon: BarChart3 },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function EventsAdminPage() {
  const [tab, setTab] = useState<TabKey>('events')
  const [events, setEvents] = useState<GameEvent[]>([])
  const [games, setGames] = useState<GameCatalogItem[]>([])
  const [banners, setBanners] = useState<Banner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [needKey, setNeedKey] = useState(false)
  const [keyInput, setKeyInput] = useState(getAdminKey())
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<GameEvent | null>(null)
  const [resultsId, setResultsId] = useState<number | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([adminApi.events(), adminApi.games(), adminApi.banners()])
      .then(([eventRows, gameRows, bannerRows]) => {
        setEvents(eventRows)
        setGames(gameRows)
        setBanners(bannerRows)
        setNeedKey(false)
      })
      .catch((err: Error) => {
        if (err instanceof EventsApiError && err.status === 401) {
          setNeedKey(true)
        } else {
          setError(err.message)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEventsLive((message) => {
    if (
      message.type === 'event_update' ||
      message.type === 'banner_update' ||
      message.type === 'games_update'
    ) {
      load()
    }
  })

  function saveKey() {
    setAdminKey(keyInput.trim())
    load()
  }

  const activeCount = events.filter(
    (event) => event.phase === 'active' || event.phase === 'ending',
  ).length
  const participants = events.reduce((total, event) => total + event.participants, 0)
  const pending = events.reduce(
    (total, event) => total + (event.pending_winners ?? 0),
    0,
  )

  return (
    <div>
      <PageHeader
        title="إدارة النشاطات والفعاليات"
        eyebrow="لوحة تحكم الأدمن"
        subtitle="إنشاء الفعاليات والألعاب والبانرات، متابعة المشاركين، واعتماد الجوائز وصرفها"
        action={
          <Link
            to="/events"
            className="shrink-0 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-[11px] font-bold text-blush-100"
          >
            عرض الموقع
          </Link>
        }
      />

      <div className="mb-3 flex items-start gap-2 rounded-2xl border border-amber-300/25 bg-amber-400/[0.08] px-3 py-2.5">
        <BellRing size={15} className="mt-0.5 shrink-0 text-amber-300" />
        <p className="text-[10px] leading-relaxed text-amber-100/80">
          إشعارات التطبيق الداخلية تعمل الآن (بدء الفعالية، الفوز، وقبل النهاية). أما إشعارات
          Push الحقيقية على الهاتف فتحتاج مفاتيح <span className="font-bold">FCM</span> من Firebase.
        </p>
      </div>

      {needKey && (
        <div className="mb-3 rounded-2xl border border-gold/30 bg-gold/[0.08] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-black text-gold">
            <KeyRound size={13} /> مفتاح الإدارة مطلوب
          </p>
          <p className="mt-1 text-[10px] text-blush-200/60">
            اضبط <span dir="ltr" className="font-mono">EVENTS_ADMIN_KEY</span> في السيرفر، ثم أدخل
            نفس القيمة هنا.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder="مفتاح الإدارة"
              className="w-full rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-white focus:outline-none"
              dir="ltr"
            />
            <button
              type="button"
              onClick={saveKey}
              className="gold-btn shrink-0 rounded-xl px-3 py-2 text-[11px] font-black"
            >
              حفظ
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mb-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">
          {error}
        </p>
      )}

      <section className="mb-3 grid grid-cols-4 gap-1.5">
        <div className="glass rounded-2xl px-1 py-2 text-center">
          <Trophy size={13} className="mx-auto text-gold" />
          <p className="mt-1 text-sm font-black text-white">{events.length}</p>
          <p className="text-[8px] text-blush-200/50">فعالية</p>
        </div>
        <div className="glass rounded-2xl px-1 py-2 text-center">
          <Sparkles size={13} className="mx-auto text-emerald-300" />
          <p className="mt-1 text-sm font-black text-white">{activeCount}</p>
          <p className="text-[8px] text-blush-200/50">مباشرة</p>
        </div>
        <div className="glass rounded-2xl px-1 py-2 text-center">
          <ShieldCheck size={13} className="mx-auto text-fuchsia-300" />
          <p className="mt-1 text-sm font-black text-white">{participants}</p>
          <p className="text-[8px] text-blush-200/50">مشاركة</p>
        </div>
        <div className="glass rounded-2xl px-1 py-2 text-center">
          <BellRing size={13} className="mx-auto text-amber-300" />
          <p className="mt-1 text-sm font-black text-white">{pending}</p>
          <p className="text-[8px] text-blush-200/50">للاعتماد</p>
        </div>
      </section>

      <div className="glass mb-3 grid grid-cols-4 gap-1 rounded-2xl p-1">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex flex-col items-center gap-1 rounded-xl px-0.5 py-1.5 text-[9px] font-bold transition ${
              tab === key ? 'purple-btn text-white' : 'text-blush-200/60'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {loading && events.length === 0 && (
        <p className="flex items-center justify-center gap-2 py-8 text-xs text-blush-200/50">
          <Loader2 size={14} className="animate-spin" /> جارٍ تحميل لوحة الإدارة…
        </p>
      )}

      {!needKey && !loading && tab === 'events' && (
        <EventsTab
          events={events}
          onCreate={() => {
            setEditing(null)
            setFormOpen(true)
          }}
          onEdit={(event) => {
            setEditing(event)
            setFormOpen(true)
          }}
          onResults={(id) => {
            setResultsId(id)
            setTab('results')
          }}
          onRefresh={load}
        />
      )}

      {!needKey && !loading && tab === 'games' && (
        <GamesTab games={games} onRefresh={load} />
      )}

      {!needKey && !loading && tab === 'banners' && (
        <BannersTab banners={banners} events={events} onRefresh={load} />
      )}

      {!needKey && !loading && tab === 'results' && (
        <ResultsTab events={events} initialEventId={resultsId} onRefresh={load} />
      )}

      {formOpen && (
        <EventForm
          event={editing}
          games={games}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false)
            load()
          }}
        />
      )}
    </div>
  )
}
