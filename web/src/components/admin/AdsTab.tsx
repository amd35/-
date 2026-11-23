import { useState } from 'react';
import { api, assetUrl } from '../../lib/api';
import { compressImage } from '../../lib/imageCompress';
import { Icon, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Table, Toggle, useAdminData } from './shared';

interface AdminAd {
  id: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  linkUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  isActive: boolean;
  showBanner: boolean;
  showPopup: boolean;
  viewCount: number;
  clickCount: number;
  isLive: boolean;
  createdAt: string;
}

interface FormState {
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  linkUrl: string;
  startsAt: string;
  endsAt: string;
  sortOrder: string;
  isActive: boolean;
  showBanner: boolean;
  showPopup: boolean;
}

const EMPTY_FORM: FormState = {
  titleAr: '',
  titleEn: '',
  bodyAr: '',
  bodyEn: '',
  mediaType: 'image',
  mediaUrl: '',
  linkUrl: '',
  startsAt: '',
  endsAt: '',
  sortOrder: '0',
  isActive: true,
  showBanner: true,
  showPopup: false,
};

/** ISO timestamp → value a datetime-local input accepts (local time). */
function toInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function placementLabel(ad: AdminAd): string {
  const parts: string[] = [];
  if (ad.showBanner) parts.push('بانر الرئيسية');
  if (ad.showPopup) parts.push('نافذة عند الفتح');
  return parts.length ? parts.join(' + ') : 'صفحة الإعلانات فقط';
}

function scheduleLabel(ad: AdminAd): string {
  const now = Date.now();
  if (!ad.isActive) return 'متوقف';
  if (ad.startsAt && new Date(ad.startsAt).getTime() > now) return 'مجدول — لم يبدأ بعد';
  if (ad.endsAt && new Date(ad.endsAt).getTime() < now) return 'انتهت مدته';
  return 'معروض الآن';
}

/**
 * Ads & events: upload an image or a video, write the Arabic and English copy,
 * set the link, the schedule window, the order and the placements (home banner,
 * app-open popup, ads page). Views and clicks are counted per ad.
 */
export default function AdsTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ ads: AdminAd[] }>('/admin/ads');

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditId(null);
  };

  const pickFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) return;
    setUploading(true);
    try {
      const isVideo = picked.type.startsWith('video/');
      const file = isVideo ? picked : await compressImage(picked);
      const body = new FormData();
      body.append('file', file);
      const uploaded = await api<{ url: string; mediaType: 'image' | 'video' }>('/admin/ads/upload', {
        method: 'POST',
        admin: true,
        form: body,
      });
      set('mediaUrl', uploaded.url);
      set('mediaType', uploaded.mediaType);
      toast.push(isVideo ? 'تم رفع الفيديو' : 'تم رفع الصورة', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.mediaUrl) {
      toast.push('ارفع صورة أو فيديو أولاً', 'error');
      return;
    }
    setBusy(true);
    try {
      const body = {
        titleAr: form.titleAr,
        titleEn: form.titleEn,
        bodyAr: form.bodyAr,
        bodyEn: form.bodyEn,
        mediaType: form.mediaType,
        mediaUrl: form.mediaUrl,
        linkUrl: form.linkUrl.trim() || null,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        sortOrder: form.sortOrder === '' ? 0 : Number(form.sortOrder),
        isActive: form.isActive,
        showBanner: form.showBanner,
        showPopup: form.showPopup,
      };
      if (editId) {
        await api(`/admin/ads/${editId}`, { method: 'PATCH', admin: true, body });
        toast.push('تم حفظ تعديلات الإعلان', 'success');
      } else {
        await api('/admin/ads', { method: 'POST', admin: true, body });
        toast.push('تم إنشاء الإعلان', 'success');
      }
      resetForm();
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (ad: AdminAd) => {
    setEditId(ad.id);
    setForm({
      titleAr: ad.titleAr,
      titleEn: ad.titleEn,
      bodyAr: ad.bodyAr,
      bodyEn: ad.bodyEn,
      mediaType: ad.mediaType,
      mediaUrl: ad.mediaUrl,
      linkUrl: ad.linkUrl ?? '',
      startsAt: toInput(ad.startsAt),
      endsAt: toInput(ad.endsAt),
      sortOrder: String(ad.sortOrder),
      isActive: ad.isActive,
      showBanner: ad.showBanner,
      showPopup: ad.showPopup,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleActive = async (ad: AdminAd) => {
    try {
      await api(`/admin/ads/${ad.id}/toggle`, { method: 'POST', admin: true, body: {} });
      toast.push(ad.isActive ? 'تم إيقاف الإعلان' : 'تم تشغيل الإعلان', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const move = async (ad: AdminAd, direction: 'up' | 'down') => {
    try {
      await api(`/admin/ads/${ad.id}/move`, { method: 'POST', admin: true, body: { direction } });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const remove = async (ad: AdminAd) => {
    if (!window.confirm('حذف هذا الإعلان نهائياً؟ لا يمكن التراجع.')) return;
    try {
      await api(`/admin/ads/${ad.id}`, { method: 'DELETE', admin: true });
      toast.push('تم حذف الإعلان', 'success');
      if (editId === ad.id) resetForm();
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const ads = data?.ads ?? [];
  const preview = assetUrl(form.mediaUrl);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <AdminCard
        title={editId ? 'تعديل الإعلان' : 'إضافة إعلان أو حدث جديد'}
        subtitle="صورة أو فيديو + عنوان ونص بالعربية والإنجليزية، رابط، مواعيد العرض، الترتيب، وأماكن الظهور"
        actions={
          editId ? (
            <button className="btn btn-ghost btn-sm" onClick={resetForm}>
              <Icon name="x" size={14} /> إلغاء التعديل
            </button>
          ) : undefined
        }
      >
        <label className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }}>
          <Icon name="image" size={15} />
          {uploading ? 'جارٍ الرفع…' : 'اختيار صورة أو فيديو من الجهاز'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
            hidden
            onChange={(event) => void pickFile(event)}
          />
        </label>

        {preview ? (
          <div className="ad-admin-preview">
            {form.mediaType === 'video' ? (
              <video src={preview} controls muted playsInline />
            ) : (
              <img src={preview} alt="معاينة الإعلان" />
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('mediaUrl', '')}>
              <Icon name="trash" size={14} /> إزالة
            </button>
          </div>
        ) : (
          <span className="tiny muted">JPG / PNG / WebP / GIF أو MP4 / WebM (حتى 80 ميجابايت).</span>
        )}

        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          <Field label="العنوان (عربي)">
            <input
              className="input"
              value={form.titleAr}
              maxLength={160}
              placeholder="مثال: عرض العيد"
              onChange={(event) => set('titleAr', event.target.value)}
            />
          </Field>
          <Field label="العنوان (إنجليزي)">
            <input
              className="input"
              value={form.titleEn}
              maxLength={160}
              dir="ltr"
              placeholder="Eid offer"
              onChange={(event) => set('titleEn', event.target.value)}
            />
          </Field>
        </div>

        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          <Field label="النص (عربي)">
            <textarea
              className="textarea"
              rows={3}
              value={form.bodyAr}
              maxLength={1000}
              placeholder="تفاصيل الإعلان…"
              onChange={(event) => set('bodyAr', event.target.value)}
            />
          </Field>
          <Field label="النص (إنجليزي)">
            <textarea
              className="textarea"
              rows={3}
              value={form.bodyEn}
              maxLength={1000}
              dir="ltr"
              placeholder="Ad details…"
              onChange={(event) => set('bodyEn', event.target.value)}
            />
          </Field>
        </div>

        <Field label="الرابط (اختياري)" hint="https://… أو مسار داخل التطبيق مثل /wallet">
          <input
            className="input"
            value={form.linkUrl}
            dir="ltr"
            placeholder="https://example.com"
            onChange={(event) => set('linkUrl', event.target.value)}
          />
        </Field>

        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
          <Field label="بداية العرض (اختياري)">
            <input
              className="input"
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => set('startsAt', event.target.value)}
            />
          </Field>
          <Field label="نهاية العرض (اختياري)">
            <input
              className="input"
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => set('endsAt', event.target.value)}
            />
          </Field>
          <Field label="الترتيب" hint="الأصغر يظهر أولاً">
            <input
              className="input"
              type="number"
              value={form.sortOrder}
              dir="ltr"
              onChange={(event) => set('sortOrder', event.target.value)}
            />
          </Field>
        </div>

        <Toggle checked={form.isActive} onChange={(value) => set('isActive', value)} label="تشغيل الإعلان" />
        <Toggle
          checked={form.showBanner}
          onChange={(value) => set('showBanner', value)}
          label="عرضه في بانر الصفحة الرئيسية"
        />
        <Toggle
          checked={form.showPopup}
          onChange={(value) => set('showPopup', value)}
          label="عرضه كنافذة منبثقة عند فتح التطبيق"
        />

        <button className="btn btn-primary" onClick={() => void save()} disabled={busy || uploading}>
          {busy ? <span className="spinner" /> : editId ? 'حفظ التعديلات' : 'نشر الإعلان'}
        </button>
      </AdminCard>

      <AdminCard title="الإعلانات والأحداث" subtitle="كل إعلان مع عدد المشاهدات والنقرات ومواعيد عرضه">
        {loading ? (
          <div className="skeleton" style={{ height: 180 }} />
        ) : ads.length === 0 ? (
          <Empty text="لا توجد إعلانات بعد — أضف أول إعلان من الأعلى" />
        ) : (
          <Table
            head={['المعاينة', 'العنوان', 'أماكن الظهور', 'الجدولة', 'الترتيب', 'المشاهدات', 'النقرات', 'إجراءات']}
          >
            {ads.map((ad, index) => (
              <tr key={ad.id}>
                <td>
                  <div className="ad-admin-thumb">
                    {ad.mediaType === 'video' ? (
                      <video src={assetUrl(ad.mediaUrl)} muted />
                    ) : (
                      <img src={assetUrl(ad.mediaUrl)} alt="" />
                    )}
                  </div>
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{ad.titleAr || ad.titleEn}</div>
                  <div className="tiny muted">{ad.titleEn && ad.titleAr ? ad.titleEn : ''}</div>
                </td>
                <td className="tiny">{placementLabel(ad)}</td>
                <td className="tiny">{scheduleLabel(ad)}</td>
                <td>
                  <div className="inline" style={{ gap: 4 }}>
                    <button
                      className="btn btn-ghost btn-xs"
                      disabled={index === 0}
                      onClick={() => void move(ad, 'up')}
                      aria-label="أعلى"
                    >
                      ▲
                    </button>
                    <button
                      className="btn btn-ghost btn-xs"
                      disabled={index === ads.length - 1}
                      onClick={() => void move(ad, 'down')}
                      aria-label="أسفل"
                    >
                      ▼
                    </button>
                  </div>
                </td>
                <td dir="ltr">{ad.viewCount}</td>
                <td dir="ltr">{ad.clickCount}</td>
                <td>
                  <div className="inline" style={{ gap: 4, flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => startEdit(ad)}>
                      تعديل
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void toggleActive(ad)}>
                      {ad.isActive ? 'إيقاف' : 'تشغيل'}
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void remove(ad)}>
                      <Icon name="trash" size={13} /> حذف
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
