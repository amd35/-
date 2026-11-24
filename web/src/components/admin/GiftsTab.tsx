import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, Icon, useToast } from '../../lib/ui';
import { GiftAnimation, GiftCover } from '../GiftAnimation';
import { AdminCard, Empty, Field, Table, Toggle, useAdminData } from './shared';

interface AdminGift {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  description: string;
  design: string | null;
  videoUrl: string | null;
  coverUrl: string | null;
  price: number;
  recipientPercent: number | null;
  rarity: string;
  isActive: boolean;
  isDaily: boolean;
  /** `diamond` (default) or `gold` — only the admin picks it, per gift. */
  currency: string;
  sortOrder: number;
  sends: number;
  revenue: number;
  recipientPayout: number;
  adminShare: number;
}

const DESIGNS = [
  'sports-car',
  'golden-car',
  'private-jet',
  'royal-yacht',
  'royal-crown',
  'roses',
  'golden-lion',
  'golden-eagle',
  'diamond',
  'treasure',
  'hearts',
  'legend-dragon',
];

const RARITIES = ['common', 'rare', 'epic', 'legendary', 'vip'];

const RARITY_LABEL: Record<string, string> = {
  common: 'عادي',
  rare: 'نادر',
  epic: 'ملحمي',
  legendary: 'أسطوري',
  vip: 'VIP',
};

const EMPTY_FORM = {
  id: '',
  name: '',
  nameEn: '',
  description: '',
  media: 'design' as 'design' | 'video',
  design: 'sports-car',
  videoUrl: '',
  coverUrl: '',
  price: 5000,
  recipientPercent: '',
  rarity: 'epic',
  sortOrder: 0,
  isActive: true,
  isDaily: false,
  currency: 'diamond' as 'diamond' | 'gold',
};

export default function GiftsTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ gifts: AdminGift[] }>('/admin/gifts');
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<'video' | 'cover' | null>(null);
  // «الهدية المجانية اليومية»: one free gift per user per Baghdad day.
  const settingsData = useAdminData<{
    settings: { daily_free_gift_enabled: boolean; daily_free_gift_id: string };
  }>('/admin/settings');
  const [freeEnabled, setFreeEnabled] = useState(false);
  const [freeGiftId, setFreeGiftId] = useState('');
  const [savingFree, setSavingFree] = useState(false);

  useEffect(() => {
    const settings = settingsData.data?.settings;
    if (!settings) return;
    setFreeEnabled(Boolean(settings.daily_free_gift_enabled));
    setFreeGiftId(settings.daily_free_gift_id || '');
  }, [settingsData.data]);

  const reset = () => setForm(EMPTY_FORM);

  const edit = (gift: AdminGift) => {
    setForm({
      id: gift.id,
      name: gift.name,
      nameEn: gift.nameEn,
      description: gift.description,
      media: gift.videoUrl ? 'video' : 'design',
      design: gift.design ?? 'sports-car',
      videoUrl: gift.videoUrl ?? '',
      coverUrl: gift.coverUrl ?? '',
      price: gift.price,
      recipientPercent: gift.recipientPercent === null ? '' : String(gift.recipientPercent),
      rarity: gift.rarity,
      sortOrder: gift.sortOrder,
      isActive: gift.isActive,
      isDaily: Boolean(gift.isDaily),
      currency: gift.currency === 'gold' ? 'gold' : 'diamond',
    });
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.push('اسم الهدية مطلوب', 'error');
      return;
    }
    if (form.media === 'video' && !form.videoUrl) {
      toast.push('ارفع فيديو الهدية أولاً (MP4 أو WebM)', 'error');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name,
        nameEn: form.nameEn,
        description: form.description,
        design: form.media === 'design' ? form.design : null,
        videoUrl: form.media === 'video' ? form.videoUrl : null,
        coverUrl: form.coverUrl || null,
        price: Number(form.price),
        recipientPercent: form.recipientPercent === '' ? null : Number(form.recipientPercent),
        rarity: form.rarity,
        sortOrder: Number(form.sortOrder),
        isActive: form.isActive,
        isDaily: form.isDaily,
        currency: form.currency,
      };
      if (form.id) {
        await api(`/admin/gifts/${form.id}`, { method: 'PATCH', admin: true, body });
        toast.push('تم تحديث الهدية', 'success');
      } else {
        await api('/admin/gifts', { method: 'POST', admin: true, body });
        toast.push('تمت إضافة الهدية وستظهر للمستخدمين فوراً', 'success');
      }
      reset();
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveFreeGift = async () => {
    setSavingFree(true);
    try {
      await api('/admin/settings', {
        method: 'PUT',
        admin: true,
        body: { daily_free_gift_enabled: freeEnabled, daily_free_gift_id: freeGiftId },
      });
      toast.push('تم حفظ إعداد الهدية المجانية اليومية', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSavingFree(false);
    }
  };

  const toggle = async (gift: AdminGift) => {
    try {
      await api(`/admin/gifts/${gift.id}`, {
        method: 'PATCH',
        admin: true,
        body: { isActive: !gift.isActive },
      });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const remove = async (gift: AdminGift) => {
    if (!window.confirm(`إيقاف الهدية "${gift.name}"؟ ستبقى سجلاتها المالية محفوظة.`)) return;
    try {
      await api(`/admin/gifts/${gift.id}`, { method: 'DELETE', admin: true });
      toast.push('تم إيقاف الهدية', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const upload = async (event: React.ChangeEvent<HTMLInputElement>, kind: 'video' | 'cover') => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    setUploading(kind);
    try {
      const response = await api<{ url: string }>('/admin/gifts/upload', {
        method: 'POST',
        admin: true,
        form: body,
      });
      setForm((current) =>
        kind === 'video'
          ? { ...current, media: 'video', videoUrl: response.url }
          : { ...current, coverUrl: response.url }
      );
      toast.push(kind === 'video' ? 'تم رفع فيديو الهدية' : 'تم رفع صورة الغلاف', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setUploading(null);
      event.target.value = '';
    }
  };

  return (
    <div className="stack">
      <AdminCard
        title="الهدية المجانية اليومية"
        subtitle="تُضاف إلى جنطة الهدايا مرة واحدة لكل مستخدم في اليوم، وتتجدد منتصف الليل بتوقيت بغداد"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Field label="التفعيل">
            <Toggle checked={freeEnabled} onChange={setFreeEnabled} label="فعّل الهدية المجانية" />
          </Field>
          <Field label="الهدية الممنوحة" hint="اتركها فارغة لاستخدام أول هدية من قسم «هدايا اليوم»">
            <select
              className="select"
              value={freeGiftId}
              onChange={(event) => setFreeGiftId(event.target.value)}
            >
              <option value="">أول هدية من «هدايا اليوم»</option>
              {(data?.gifts ?? []).map((gift) => (
                <option key={gift.id} value={gift.id}>
                  {gift.name} · {formatCoins(gift.price)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button className="btn btn-primary" onClick={() => void saveFreeGift()} disabled={savingFree}>
          <Icon name="check" size={16} /> {savingFree ? 'جارٍ الحفظ…' : 'حفظ إعداد الهدية المجانية'}
        </button>
      </AdminCard>

      <AdminCard
        title={form.id ? 'تعديل هدية' : 'إضافة هدية جديدة'}
        subtitle="هدية متحركة جاهزة أو فيديو MP4/WebM ترفعه من جهازك — تظهر للمستخدمين مباشرة بعد النشر"
        actions={
          form.id ? (
            <button className="btn btn-ghost btn-xs" onClick={reset}>
              إلغاء التعديل
            </button>
          ) : undefined
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <Field label="اسم الهدية (عربي)">
            <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="الاسم الإنجليزي">
            <input
              className="input"
              dir="ltr"
              value={form.nameEn}
              onChange={(event) => setForm({ ...form, nameEn: event.target.value })}
            />
          </Field>
          <Field label="السعر" hint="يُخصم بالعملة المختارة أدناه">
            <input
              className="input"
              type="number"
              min={0}
              dir="ltr"
              value={form.price}
              onChange={(event) => setForm({ ...form, price: Number(event.target.value) })}
            />
          </Field>
          <Field
            label="عملة الهدية"
            hint="الماس للهدايا — اختر الذهب فقط للهدايا المحددة التي تريد بيعها بالذهب"
          >
            <select
              className="select"
              value={form.currency}
              onChange={(event) =>
                setForm({ ...form, currency: event.target.value === 'gold' ? 'gold' : 'diamond' })
              }
            >
              <option value="diamond">ماس 💎</option>
              <option value="gold">ذهب 🥇</option>
            </select>
          </Field>
          <Field label="نسبة أرباح المستلم %" hint="اتركها فارغة لاستخدام النسبة العامة من إعدادات الأسعار">
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              dir="ltr"
              value={form.recipientPercent}
              onChange={(event) => setForm({ ...form, recipientPercent: event.target.value })}
            />
          </Field>
          <Field label="الندرة">
            <select
              className="select"
              dir="ltr"
              value={form.rarity}
              onChange={(event) => setForm({ ...form, rarity: event.target.value })}
            >
              {RARITIES.map((rarity) => (
                <option key={rarity} value={rarity}>
                  {RARITY_LABEL[rarity]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ترتيب العرض">
            <input
              className="input"
              type="number"
              dir="ltr"
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
            />
          </Field>
          <Field label="الوصف">
            <input
              className="input"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
        </div>

        <div className="seg" style={{ maxWidth: 320 }}>
          <button
            className={form.media === 'design' ? 'active' : ''}
            onClick={() => setForm({ ...form, media: 'design' })}
          >
            تصميم متحرك جاهز
          </button>
          <button
            className={form.media === 'video' ? 'active' : ''}
            onClick={() => setForm({ ...form, media: 'video' })}
          >
            فيديو MP4 / WebM
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {form.media === 'design' ? (
            <Field label="التصميم المتحرك">
              <select
                className="select"
                dir="ltr"
                value={form.design}
                onChange={(event) => setForm({ ...form, design: event.target.value })}
              >
                {DESIGNS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="فيديو الهدية" hint="MP4 أو WebM — حتى 60 ميغابايت">
              <div className="inline">
                <label className="btn btn-ghost btn-xs">
                  <Icon name="video" size={14} /> {uploading === 'video' ? 'جارٍ الرفع…' : 'رفع فيديو'}
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    hidden
                    onChange={(event) => void upload(event, 'video')}
                  />
                </label>
                {form.videoUrl ? (
                  <span className="tiny muted" dir="ltr">
                    {form.videoUrl}
                  </span>
                ) : null}
              </div>
            </Field>
          )}
          <Field label="صورة الغلاف" hint="اختيارية — تظهر أثناء تحميل الفيديو">
            <div className="inline">
              <label className="btn btn-ghost btn-xs">
                <Icon name="image" size={14} /> {uploading === 'cover' ? 'جارٍ الرفع…' : 'رفع غلاف'}
                <input
                  type="file"
                  accept="image/png,image/webp,image/jpeg,image/gif"
                  hidden
                  onChange={(event) => void upload(event, 'cover')}
                />
              </label>
              {form.coverUrl ? (
                <span className="tiny muted" dir="ltr">
                  {form.coverUrl}
                </span>
              ) : null}
            </div>
          </Field>
          <Field label="الحالة">
            <Toggle checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} label="نشطة في المتجر" />
          </Field>
          <Field label="هدايا اليوم">
            <Toggle
              checked={form.isDaily}
              onChange={(value) => setForm({ ...form, isDaily: value })}
              label="ضمن قسم «هدايا اليوم» المحدود"
            />
          </Field>
        </div>

        <div className="inline" style={{ gap: 14 }}>
          <div className="gift-admin-preview">
            {form.media === 'video' && form.videoUrl ? (
              <GiftAnimation
                sound
                loop={false}
                gift={{
                  name: form.name || 'Gift',
                  design: null,
                  videoUrl: form.videoUrl,
                  coverUrl: form.coverUrl,
                  rarity: form.rarity,
                }}
              />
            ) : (
              <GiftCover
                gift={{
                  name: form.name || 'Gift',
                  design: form.media === 'design' ? form.design : null,
                  videoUrl: form.media === 'video' ? form.videoUrl : null,
                  coverUrl: form.coverUrl,
                  rarity: form.rarity,
                }}
              />
            )}
          </div>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            <Icon name="check" size={16} /> {busy ? 'جارٍ الحفظ…' : form.id ? 'حفظ التعديلات' : 'نشر الهدية'}
          </button>
        </div>
      </AdminCard>

      <AdminCard title="هدايا المتجر" subtitle="الإرسال والخصم والأرباح تُسجَّل تلقائياً لكل هدية">
        {loading ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : (data?.gifts.length ?? 0) === 0 ? (
          <Empty text="لا توجد هدايا" />
        ) : (
          <Table head={['معاينة', 'الاسم', 'السعر', 'النسبة', 'الندرة', 'أُرسلت', 'الإيراد', 'أرباح الإدارة', 'الحالة', 'إجراءات']}>
            {data?.gifts.map((gift) => (
              <tr key={gift.id}>
                <td>
                  <div className="gift-admin-thumb">
                    <GiftCover
                      gift={{
                        name: gift.name,
                        design: gift.design,
                        videoUrl: gift.videoUrl,
                        coverUrl: gift.coverUrl,
                        rarity: gift.rarity,
                      }}
                    />
                  </div>
                </td>
                <td>
                  <b>{gift.name}</b>
                  <div className="tiny muted" dir="ltr">
                    {gift.slug}
                  </div>
                </td>
                <td className="amount">
                  {formatCoins(gift.price)} {gift.currency === 'gold' ? '🥇' : '💎'}
                </td>
                <td className="tiny" dir="ltr">
                  {gift.recipientPercent === null ? 'افتراضي' : `${gift.recipientPercent}%`}
                </td>
                <td>
                  <span className={`pill rarity-${gift.rarity}`} style={{ fontSize: 10 }}>
                    {RARITY_LABEL[gift.rarity] ?? gift.rarity}
                  </span>
                </td>
                <td dir="ltr">{gift.sends}</td>
                <td className="amount">{formatCoins(gift.revenue)}</td>
                <td className="amount plus">{formatCoins(gift.adminShare)}</td>
                <td>
                  <span className={`pill ${gift.isActive ? 'pill-green' : 'pill-red'}`} style={{ fontSize: 10 }}>
                    {gift.isActive ? 'نشطة' : 'موقوفة'}
                  </span>
                </td>
                <td>
                  <div className="inline">
                    <button className="btn btn-ghost btn-xs" onClick={() => edit(gift)}>
                      <Icon name="sparkle" size={13} /> تعديل
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void toggle(gift)}>
                      {gift.isActive ? 'إيقاف' : 'تفعيل'}
                    </button>
                    <button className="btn btn-danger btn-xs" onClick={() => void remove(gift)}>
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>
    </div>
  );
}
