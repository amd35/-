import { useState } from 'react'
import { ImagePlus, Loader2, Plus, Trash2, Upload, X } from 'lucide-react'
import { Field, Notice, inputClass } from '../../components/ui'
import {
  adminApi,
  type EventInput,
  type GameCatalogItem,
  type GameEvent,
  type PrizeInput,
  type PrizeKind,
} from '../../lib/eventsApi'
import {
  KIND_LABELS,
  PRIZE_KIND_LABELS,
} from '../../lib/eventFormat'

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

function defaults(event?: GameEvent | null): EventInput {
  if (event) {
    return {
      title: event.title,
      kind: event.kind,
      game_key: event.game_key,
      description: event.description,
      media_url: event.media_url,
      media_type: event.media_type,
      rules: event.rules,
      conditions: event.conditions,
      starts_at: localInput(event.starts_at),
      ends_at: localInput(event.ends_at),
      entry_fee_gold: event.entry_fee_gold,
      winners_count: event.winners_count,
      status: event.status,
      published: event.published,
      prizes: event.prizes.map((prize) => ({
        rank: prize.rank,
        kind: prize.kind,
        amount: prize.amount,
        label: prize.label,
      })),
    }
  }
  const now = new Date()
  const end = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return {
    title: '',
    kind: 'daily',
    game_key: 'lucky_challenge',
    description: '',
    media_url: '',
    media_type: 'image',
    rules: '',
    conditions: 'مشاركة واحدة لكل حساب. يُمنع التلاعب أو تعدد الحسابات.',
    starts_at: localInput(now.toISOString()),
    ends_at: localInput(end.toISOString()),
    entry_fee_gold: 0,
    winners_count: 3,
    status: 'active',
    published: true,
    prizes: [
      { rank: 1, kind: 'gold', amount: 500, label: '500 ذهب' },
      { rank: 2, kind: 'gold', amount: 250, label: '250 ذهب' },
      { rank: 3, kind: 'gold', amount: 100, label: '100 ذهب' },
    ],
  }
}

export default function EventForm({
  event,
  games,
  onClose,
  onSaved,
}: {
  event?: GameEvent | null
  games: GameCatalogItem[]
  onClose: () => void
  onSaved: (event: GameEvent) => void
}) {
  const [form, setForm] = useState<EventInput>(() => defaults(event))
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function patch<K extends keyof EventInput>(key: K, value: EventInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function patchPrize(index: number, change: Partial<PrizeInput>) {
    setForm((current) => ({
      ...current,
      prizes: current.prizes.map((prize, position) =>
        position === index ? { ...prize, ...change } : prize,
      ),
    }))
  }

  function addPrize() {
    setForm((current) => ({
      ...current,
      prizes: [
        ...current.prizes,
        {
          rank: current.prizes.length + 1,
          kind: 'gold',
          amount: 100,
          label: '',
        },
      ],
    }))
  }

  function removePrize(index: number) {
    setForm((current) => ({
      ...current,
      prizes: current.prizes
        .filter((_, position) => position !== index)
        .map((prize, position) => ({ ...prize, rank: position + 1 })),
    }))
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
    const startsAt = fromLocal(form.starts_at)
    const endsAt = fromLocal(form.ends_at)
    if (!form.title.trim()) {
      setError('اكتب عنوان الفعالية.')
      return
    }
    if (!startsAt || !endsAt) {
      setError('حدّد تاريخ البداية والنهاية.')
      return
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError('يجب أن تكون النهاية بعد البداية.')
      return
    }
    if (!form.game_key) {
      setError('اختر لعبة للفعالية.')
      return
    }
    const payload: EventInput = {
      ...form,
      title: form.title.trim(),
      starts_at: startsAt,
      ends_at: endsAt,
      winners_count: Math.max(1, Number(form.winners_count) || 1),
      entry_fee_gold: Math.max(0, Number(form.entry_fee_gold) || 0),
      prizes: form.prizes
        .filter((prize) => prize.rank >= 1)
        .map((prize, index) => ({
          ...prize,
          rank: index + 1,
          amount: Math.max(0, Number(prize.amount) || 0),
        })),
    }
    setBusy(true)
    try {
      const saved = event
        ? await adminApi.updateEvent(event.id, payload)
        : await adminApi.createEvent(payload)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر حفظ الفعالية')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event ? 'تعديل فعالية' : 'فعالية جديدة'}
        className="glass-deep relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-gold/25 p-4 sm:rounded-[28px]"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-black tracking-wide text-gold uppercase">
              {event ? 'تعديل فعالية' : 'فعالية جديدة'}
            </p>
            <h3 className="font-display mt-1 text-lg font-bold text-white">
              {event ? event.title : 'أنشئ نشاطًا جديدًا'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex size-8 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <X size={15} />
          </button>
        </div>

        {error && (
          <div className="mb-3">
            <Notice tone="rose">{error}</Notice>
          </div>
        )}

        <div className="space-y-3">
          <Field label="عنوان الفعالية">
            <input
              className={inputClass}
              value={form.title}
              onChange={(event) => patch('title', event.target.value)}
              placeholder="مثال: تحدي الحظ اليومي"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="نوع الفعالية">
              <select
                className={inputClass}
                value={form.kind}
                onChange={(event) => patch('kind', event.target.value as EventInput['kind'])}
              >
                {Object.entries(KIND_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="اللعبة">
              <select
                className={inputClass}
                value={form.game_key}
                onChange={(event) => patch('game_key', event.target.value)}
              >
                {games.map((game) => (
                  <option key={game.key} value={game.key}>
                    {game.name} {game.enabled ? '' : '(موقوفة)'}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="الوصف">
            <textarea
              className={inputClass}
              rows={3}
              value={form.description}
              onChange={(event) => patch('description', event.target.value)}
              placeholder="وصف الفعالية والجوائز"
            />
          </Field>

          <Field label="طريقة اللعب / القواعد">
            <textarea
              className={inputClass}
              rows={2}
              value={form.rules}
              onChange={(event) => patch('rules', event.target.value)}
              placeholder="كيف يشارك المستخدم؟"
            />
          </Field>

          <Field label="الشروط">
            <textarea
              className={inputClass}
              rows={2}
              value={form.conditions}
              onChange={(event) => patch('conditions', event.target.value)}
            />
          </Field>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="mb-2 flex items-center gap-1 text-[11px] font-bold text-white">
              <ImagePlus size={13} className="text-gold" /> صورة أو فيديو الفعالية
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
              placeholder="أو ألصق رابط الصورة/الفيديو"
              dir="ltr"
            />
            {form.media_url && (
              <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
                {form.media_type === 'video' ? (
                  <video src={form.media_url} className="h-24 w-full object-cover" muted loop autoPlay playsInline />
                ) : (
                  <img src={form.media_url} alt="" className="h-24 w-full object-cover" />
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="تبدأ">
              <input
                type="datetime-local"
                className={inputClass}
                value={form.starts_at}
                onChange={(event) => patch('starts_at', event.target.value)}
              />
            </Field>
            <Field label="تنتهي">
              <input
                type="datetime-local"
                className={inputClass}
                value={form.ends_at}
                onChange={(event) => patch('ends_at', event.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Field label="رسوم الدخول (ذهب)">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={form.entry_fee_gold}
                onChange={(event) => patch('entry_fee_gold', Number(event.target.value))}
              />
            </Field>
            <Field label="عدد الفائزين">
              <input
                type="number"
                min={1}
                max={50}
                className={inputClass}
                value={form.winners_count}
                onChange={(event) => patch('winners_count', Number(event.target.value))}
              />
            </Field>
            <Field label="الحالة">
              <select
                className={inputClass}
                value={form.status}
                onChange={(event) => patch('status', event.target.value)}
              >
                <option value="draft">مسودة</option>
                <option value="active">مفعّلة</option>
                <option value="paused">موقوفة</option>
                <option value="ended">منتهية</option>
              </select>
            </Field>
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-bold text-blush-100">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(event) => patch('published', event.target.checked)}
            />
            نشر الفعالية في الرئيسية وصفحة الفعاليات
          </label>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold text-white">جوائز المراكز</p>
              <button
                type="button"
                onClick={addPrize}
                className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-1 text-[10px] font-bold text-gold"
              >
                <Plus size={11} /> إضافة مركز
              </button>
            </div>
            <div className="space-y-2">
              {form.prizes.map((prize, index) => (
                <div key={index} className="rounded-xl border border-white/10 bg-black/20 p-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-black text-gold">المركز #{index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removePrize(index)}
                      aria-label="حذف المركز"
                      className="text-red-300"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select
                      className={`${inputClass} py-1.5 text-[11px]`}
                      value={prize.kind}
                      onChange={(event) => patchPrize(index, { kind: event.target.value as PrizeKind })}
                    >
                      {Object.entries(PRIZE_KIND_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      className={`${inputClass} py-1.5 text-[11px]`}
                      value={prize.amount}
                      onChange={(event) => patchPrize(index, { amount: Number(event.target.value) })}
                      placeholder="المبلغ"
                    />
                  </div>
                  <input
                    className={`${inputClass} mt-1.5 py-1.5 text-[11px]`}
                    value={prize.label}
                    onChange={(event) => patchPrize(index, { label: event.target.value })}
                    placeholder="نص الجائزة (اختياري)"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-white/15 bg-white/[0.06] py-2.5 text-xs font-bold text-blush-100"
          >
            إلغاء
          </button>
          <button
            type="button"
            data-testid="save-event"
            onClick={save}
            disabled={busy || uploading}
            className="gold-btn flex flex-[1.4] items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-black disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {event ? 'حفظ التعديلات' : 'إنشاء الفعالية'}
          </button>
        </div>
      </div>
    </div>
  )
}
