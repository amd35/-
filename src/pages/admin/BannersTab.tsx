import { useState } from 'react'
import {
  BarChart3,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Megaphone,
  MousePointerClick,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Field, Notice, inputClass } from '../../components/ui'
import {
  adminApi,
  type Banner,
  type BannerInput,
  type GameEvent,
} from '../../lib/eventsApi'
import { formatDateTime } from '../../lib/eventFormat'

const LINK_TYPES = [
  { key: 'event', label: 'فعالية' },
  { key: 'store', label: 'المتجر' },
  { key: 'gifts', label: 'الهدايا' },
  { key: 'frames', label: 'الإطارات' },
  { key: 'rooms', label: 'الغرف' },
  { key: 'activity', label: 'سجل النشاط' },
  { key: 'leaderboard', label: 'المتصدرون' },
  { key: 'url', label: 'رابط خارجي' },
]

function localInput(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function fromLocal(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function toInput(banner: Banner): BannerInput {
  return {
    title: banner.title,
    subtitle: banner.subtitle,
    media_url: banner.media_url,
    media_type: banner.media_type,
    link_type: banner.link_type,
    link_ref: banner.link_ref,
    starts_at: localInput(banner.starts_at),
    ends_at: banner.ends_at ? localInput(banner.ends_at) : '',
    active: banner.active,
    sort_order: banner.sort_order,
  }
}

function defaults(events: GameEvent[]): BannerInput {
  return {
    title: '',
    subtitle: '',
    media_url: '',
    media_type: 'image',
    link_type: 'event',
    link_ref: events[0] ? String(events[0].id) : null,
    starts_at: localInput(new Date().toISOString()),
    ends_at: '',
    active: true,
    sort_order: 0,
  }
}

export default function BannersTab({
  banners,
  events,
  onRefresh,
}: {
  banners: Banner[]
  events: GameEvent[]
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Banner | null>(null)
  const [form, setForm] = useState<BannerInput>(() => defaults(events))
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function patch<K extends keyof BannerInput>(key: K, value: BannerInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function startCreate() {
    setEditing(null)
    setForm(defaults(events))
    setError(null)
    setNotice(null)
    setOpen(true)
  }

  function startEdit(banner: Banner) {
    setEditing(banner)
    setForm(toInput(banner))
    setError(null)
    setNotice(null)
    setOpen(true)
  }

  async function upload(file: File) {
    setUploading(true)
    setError(null)
    try {
      const result = await adminApi.upload(file)
      patch('media_url', result.url)
      patch('media_type', result.media_type)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر رفع الملف')
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    setError(null)
    if (!form.title.trim()) {
      setError('اكتب عنوان البانر.')
      return
    }
    if (!form.starts_at) {
      setError('حدّد تاريخ بداية البانر.')
      return
    }
    if (form.link_type === 'event' && !form.link_ref) {
      setError('اختر الفعالية المرتبطة.')
      return
    }
    if (form.link_type === 'url' && !(form.link_ref ?? '').startsWith('http')) {
      setError('أدخل رابطًا يبدأ بـ http.')
      return
    }
    const payload: BannerInput = {
      ...form,
      title: form.title.trim(),
      starts_at: fromLocal(form.starts_at),
      ends_at: form.ends_at ? fromLocal(form.ends_at) : null,
      link_ref:
        form.link_type === 'event' || form.link_type === 'url'
          ? form.link_ref
          : null,
    }
    setBusy(true)
    try {
      if (editing) await adminApi.updateBanner(editing.id, payload)
      else await adminApi.createBanner(payload)
      setOpen(false)
      setNotice(editing ? 'حُدّث البانر' : 'أُنشئ البانر')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر حفظ البانر')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(banner: Banner) {
    setBusy(true)
    setError(null)
    try {
      const input = toInput(banner)
      await adminApi.updateBanner(banner.id, {
        ...input,
        starts_at: fromLocal(input.starts_at),
        ends_at: input.ends_at ? fromLocal(input.ends_at) : null,
        active: !banner.active,
      })
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر التحديث')
    } finally {
      setBusy(false)
    }
  }

  async function remove(banner: Banner) {
    if (!window.confirm(`حذف البانر «${banner.title}»؟`)) return
    setBusy(true)
    setError(null)
    try {
      await adminApi.deleteBanner(banner.id)
      setNotice('حُذف البانر')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الحذف')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-blush-200/60">
          {banners.length} بانر · مشاهدات ونقرات تُسجَّل على السيرفر
        </p>
        <button
          type="button"
          onClick={startCreate}
          className="gold-btn flex items-center gap-1 rounded-full px-3.5 py-2 text-[11px] font-black"
        >
          <Plus size={13} /> بانر جديد
        </button>
      </div>

      {error && <div className="mb-2"><Notice tone="rose">{error}</Notice></div>}
      {notice && <div className="mb-2"><Notice>{notice}</Notice></div>}

      {banners.length === 0 && (
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] py-8 text-center text-xs text-blush-200/50">
          لا بانرات بعد — أنشئ أول إعلان للرئيسية.
        </p>
      )}

      <ul className="space-y-2">
        {banners.map((banner) => (
          <li key={banner.id} className="glass rounded-2xl p-3">
            <div className="flex items-start gap-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/35 to-fuchsia-600/25 text-sm">
                <Megaphone size={16} className="text-gold" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold text-white">{banner.title}</p>
                <p className="mt-0.5 truncate text-[10px] text-blush-200/55">
                  {banner.subtitle || banner.path}
                </p>
                <p className="mt-0.5 text-[9px] text-blush-200/45">
                  {formatDateTime(banner.starts_at)} → {banner.ends_at ? formatDateTime(banner.ends_at) : 'بدون نهاية'}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black ${
                  banner.active
                    ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
                    : 'border-white/15 bg-white/[0.05] text-blush-200/55'
                }`}
              >
                {banner.active ? 'نشط' : 'متوقف'}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-3 text-[10px] font-bold text-blush-200/60">
              <span className="flex items-center gap-1">
                <BarChart3 size={11} className="text-fuchsia-300" /> {banner.views} مشاهدة
              </span>
              <span className="flex items-center gap-1">
                <MousePointerClick size={11} className="text-gold" /> {banner.clicks} نقرة
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => startEdit(banner)}
                className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold text-blush-100"
              >
                <Pencil size={10} /> تعديل
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => toggle(banner)}
                className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold text-blush-100 disabled:opacity-50"
              >
                {banner.active ? <EyeOff size={10} /> : <Eye size={10} />}
                {banner.active ? 'إيقاف' : 'تفعيل'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(banner)}
                className="flex items-center gap-1 rounded-full border border-red-300/25 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold text-red-200 disabled:opacity-50"
              >
                <Trash2 size={10} /> حذف
              </button>
            </div>
          </li>
        ))}
      </ul>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="إغلاق"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'تعديل بانر' : 'بانر جديد'}
            className="glass-deep relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-gold/25 p-4 sm:rounded-[28px]"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-black tracking-wide text-gold uppercase">
                  {editing ? 'تعديل بانر' : 'بانر جديد'}
                </p>
                <h3 className="font-display mt-1 text-lg font-bold text-white">إعلان الرئيسية</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق"
                className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white"
              >
                <X size={15} />
              </button>
            </div>

            {error && <div className="mb-3"><Notice tone="rose">{error}</Notice></div>}

            <div className="space-y-3">
              <Field label="العنوان">
                <input
                  className={inputClass}
                  value={form.title}
                  onChange={(event) => patch('title', event.target.value)}
                />
              </Field>
              <Field label="وصف قصير">
                <input
                  className={inputClass}
                  value={form.subtitle}
                  onChange={(event) => patch('subtitle', event.target.value)}
                />
              </Field>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <p className="mb-2 flex items-center gap-1 text-[11px] font-bold text-white">
                  <ImagePlus size={13} className="text-gold" /> صورة أو فيديو البانر
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-[11px] font-bold text-blush-100">
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    رفع ملف
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) upload(file)
                      }}
                    />
                  </label>
                  <select
                    className={`${inputClass} w-auto py-2`}
                    value={form.media_type}
                    onChange={(event) => patch('media_type', event.target.value as 'image' | 'video')}
                  >
                    <option value="image">صورة</option>
                    <option value="video">فيديو</option>
                  </select>
                </div>
                <input
                  className={`${inputClass} mt-2`}
                  value={form.media_url}
                  onChange={(event) => patch('media_url', event.target.value)}
                  placeholder="أو رابط الصورة/الفيديو"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="نوع الرابط">
                  <select
                    className={inputClass}
                    value={form.link_type}
                    onChange={(event) => {
                      const value = event.target.value
                      patch('link_type', value)
                      if (value === 'event') patch('link_ref', events[0] ? String(events[0].id) : null)
                      else if (value !== 'url') patch('link_ref', null)
                    }}
                  >
                    {LINK_TYPES.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>
                {form.link_type === 'event' ? (
                  <Field label="الفعالية">
                    <select
                      className={inputClass}
                      value={form.link_ref ?? ''}
                      onChange={(event) => patch('link_ref', event.target.value || null)}
                    >
                      <option value="">اختر فعالية</option>
                      {events.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : form.link_type === 'url' ? (
                  <Field label="الرابط الخارجي">
                    <input
                      className={inputClass}
                      value={form.link_ref ?? ''}
                      onChange={(event) => patch('link_ref', event.target.value)}
                      placeholder="https://…"
                      dir="ltr"
                    />
                  </Field>
                ) : (
                  <Field label="ترتيب العرض">
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={form.sort_order}
                      onChange={(event) => patch('sort_order', Number(event.target.value))}
                    />
                  </Field>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="يبدأ">
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={form.starts_at}
                    onChange={(event) => patch('starts_at', event.target.value)}
                  />
                </Field>
                <Field label="ينتهي (اختياري)">
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={form.ends_at ?? ''}
                    onChange={(event) => patch('ends_at', event.target.value || null)}
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-bold text-blush-100">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => patch('active', event.target.checked)}
                />
                البانر نشط ويظهر في الرئيسية
              </label>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-full border border-white/15 bg-white/[0.06] py-2.5 text-xs font-bold text-blush-100"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || uploading}
                className="gold-btn flex flex-[1.4] items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-black disabled:opacity-60"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                {editing ? 'حفظ البانر' : 'إنشاء البانر'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
