import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  ChevronLeft,
  Coins,
  Crown,
  Diamond,
  Gem,
  Grid2x2,
  Headphones,
  Heart,
  Image as ImageIcon,
  Mic2,
  Pencil,
  Rocket,
  Settings,
  Shield,
  ShoppingBag,
  Sparkles,
  Star,
  Users,
  Wallet,
} from 'lucide-react'
import Avatar from '../components/Avatar'
import { Field, Notice, inputClass } from '../components/ui'
import { api, type Me, type Metrics } from '../lib/api'

const PRIVILEGES = [
  { label: 'الوكالة', Icon: Building2, href: '/contact' },
  { label: 'مركز المضيف', Icon: Mic2, href: '/dashboard' },
  { label: 'غرفي', Icon: Headphones, href: '/data-list' },
  { label: 'الشارات', Icon: BadgeCheck, href: '/tasks' },
]

const FEATURES = [
  { label: 'شحن', Icon: Coins, href: '/vcoin' },
  { label: 'منشوراتي', Icon: ImageIcon, href: '/notifications' },
  { label: 'المتجر', Icon: ShoppingBag, href: '/store' },
  { label: 'الأصدقاء', Icon: Users, href: '/friends' },
]

export default function ProfilePage() {
  const [me, setMe] = useState<Me | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .me()
      .then((profile) => {
        if (!active) return
        setMe(profile)
        setName(profile.name)
        setHandle(profile.handle)
        setBio(profile.bio)
      })
      .catch((err: Error) => active && setError(err.message))
    api
      .metrics()
      .then((data) => active && setMetrics(data))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      const updated = await api.updateMe({ name: name.trim(), handle: handle.trim(), bio: bio.trim() })
      setMe(updated)
      setNotice('تم تحديث الملف الشخصي')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const stats = [
    { label: 'المتابعون', value: metrics?.friends_total ?? 0, Icon: Users },
    { label: 'المعجبون', value: metrics?.listeners_total ?? 0, Icon: Heart },
    { label: 'الغرف', value: metrics?.rooms_total ?? 0, Icon: Mic2 },
  ]

  return (
    <div className="app-bg relative min-h-dvh w-full">
      <div className="relative z-10 px-4 pt-3 pb-10">
        <header className="mb-3 flex items-center gap-2">
          <a
            href="/"
            aria-label="رجوع"
            className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white"
          >
            <ChevronLeft size={18} className="rotate-180" />
          </a>
          <h1 className="flex-1 text-center text-base font-black text-white">الملف الشخصي</h1>
          <a
            href="/settings"
            aria-label="الإعدادات"
            className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white"
          >
            <Settings size={17} />
          </a>
        </header>

        {/* بطاقة المستخدم */}
        <section className="relative overflow-hidden rounded-[26px] border border-white/10">
          <div aria-hidden className="photo-base photo-evening absolute inset-0 opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#1a0b33]/50 via-[#160a2e]/85 to-[#0f0620]" />

          <div className="relative z-10 flex flex-col items-center px-4 pt-6 pb-4">
            <div className="relative">
              <span className="block rounded-full bg-gradient-to-br from-gold via-fuchsia-500 to-violet-700 p-[2.5px] shadow-[0_0_28px_-6px_rgba(255,209,102,0.85)]">
                <Avatar name={me?.name ?? 'المستخدم'} size={84} />
              </span>
              <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#160a2e] px-2 py-0.5 text-[9px] font-black text-gold ring-1 ring-gold/40">
                <Crown size={9} /> Lv {me?.level ?? 1}
              </span>
            </div>

            <p className="mt-3 text-lg font-black text-white">{me?.name ?? '…'}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-blush-200/70">
              <span dir="ltr">{me?.handle ?? '—'}</span>
              <span className="size-1 rounded-full bg-blush-200/40" />
              <span>مستوى {me?.level ?? 1}</span>
            </p>
            <p className="mt-1.5 line-clamp-1 max-w-[85%] text-center text-[11px] text-blush-200/60">
              {me?.bio || 'أضف نبذة عنك ليظهر أثرك في الغرف ✨'}
            </p>

            <a
              href="#edit-profile"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-[11px] font-bold text-white"
            >
              <Pencil size={12} /> تعديل الملف
            </a>
          </div>

          <div className="relative z-10 grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
            {stats.map(({ label, value, Icon }) => (
              <div key={label} className="flex flex-col items-center gap-0.5 py-2.5">
                <p className="text-sm font-black text-white">{value.toLocaleString('en-US')}</p>
                <p className="flex items-center gap-1 text-[9px] font-semibold text-blush-200/60">
                  <Icon size={9} /> {label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* المحفظة */}
        <section className="glass mt-3 flex items-center gap-3 rounded-3xl p-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-sky-600 text-[#06182b]">
            <Diamond size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-blush-200/60">ألماسي</p>
            <p className="text-lg leading-none font-black text-white">
              {(me?.diamonds ?? 0).toLocaleString('en-US')}
            </p>
          </div>
          <a
            href="/diamond"
            className="flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-[11px] font-bold text-gold"
          >
            <Wallet size={12} /> محفظتي
          </a>
          <a
            href="/vcoin"
            aria-label="مركز VCoin"
            className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-yellow-600 text-[#2a1600]"
          >
            <Gem size={16} />
          </a>
        </section>

        {/* الامتيازات */}
        <section className="glass mt-3 rounded-3xl p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-black text-white">
            <Star size={13} className="text-gold" /> امتيازات المضيف و VIP
          </p>
          <div className="grid grid-cols-4 gap-2">
            {PRIVILEGES.map(({ label, Icon, href }) => (
              <a key={label} href={href} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/[0.04] py-2.5">
                <span className="flex size-9 items-center justify-center rounded-full bg-violet-500/20 text-blush-100">
                  <Icon size={16} />
                </span>
                <span className="text-[9px] font-bold text-blush-200">{label}</span>
              </a>
            ))}
          </div>
        </section>

        {/* الميزات */}
        <section className="glass mt-3 rounded-3xl p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-black text-white">
            <Sparkles size={13} className="text-fuchsia-300" /> ميزاتي
          </p>
          <div className="grid grid-cols-4 gap-2">
            {FEATURES.map(({ label, Icon, href }) => (
              <a key={label} href={href} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/[0.04] py-2.5">
                <span className="flex size-9 items-center justify-center rounded-full bg-fuchsia-500/20 text-blush-100">
                  <Icon size={16} />
                </span>
                <span className="text-[9px] font-bold text-blush-200">{label}</span>
              </a>
            ))}
          </div>
        </section>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href="/games"
            className="glass flex items-center gap-2 rounded-2xl p-2.5 text-[11px] font-bold text-white"
          >
            <Rocket size={14} className="text-gold" /> الألعاب
            <ArrowLeft size={13} className="ms-auto text-blush-200/60" />
          </a>
          <a
            href="/dashboard"
            className="glass flex items-center gap-2 rounded-2xl p-2.5 text-[11px] font-bold text-white"
          >
            <Grid2x2 size={14} className="text-fuchsia-300" /> لوحة التحكم
            <ArrowLeft size={13} className="ms-auto text-blush-200/60" />
          </a>
        </div>

        {/* تعديل الملف */}
        <form id="edit-profile" onSubmit={save} className="glass mt-4 space-y-3 rounded-3xl p-4">
          <p className="flex items-center gap-1.5 text-xs font-black text-white">
            <Shield size={13} className="text-gold" /> تعديل الملف
          </p>
          <Field label="الاسم">
            <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
          </Field>
          <Field label="المعرّف">
            <input
              value={handle}
              onChange={(event) => setHandle(event.target.value)}
              className={inputClass}
              dir="ltr"
            />
          </Field>
          <Field label="نبذة">
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              rows={3}
              className={inputClass}
            />
          </Field>

          {notice && <Notice>{notice}</Notice>}
          {error && <Notice tone="rose">{error}</Notice>}

          <button
            type="submit"
            disabled={saving || name.trim().length < 2}
            className="gold-btn w-full rounded-2xl py-3 text-sm font-black transition active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
          </button>
        </form>
      </div>
    </div>
  )
}
