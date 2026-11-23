import { useMemo, useState } from 'react';
import { api, assetUrl } from '../../lib/api';
import { compressImage } from '../../lib/imageCompress';
import { Icon, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, useAdminData } from './shared';

interface BackgroundSlot {
  key: string;
  label: string;
  hint: string;
}

interface AdminBackground {
  id: string;
  slot: string;
  title: string;
  imageUrl: string;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Overview {
  slots: BackgroundSlot[];
  backgrounds: AdminBackground[];
  live: Record<string, string>;
}

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif';

/** ISO timestamp → value a datetime-local input accepts (local time). */
function toInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function scheduleLabel(bg: AdminBackground, liveId: string | undefined): string {
  const now = Date.now();
  if (bg.id === liveId) return 'معروضة الآن لجميع المستخدمين';
  if (bg.startsAt && new Date(bg.startsAt).getTime() > now) return 'مجدولة — لم يبدأ عرضها بعد';
  if (bg.endsAt && new Date(bg.endsAt).getTime() < now) return 'انتهت مدة عرضها';
  return 'محفوظة — يمكن استعادتها';
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * General-Admin control over every app image: main background, Yalla cover,
 * login and splash screens, and per-page backgrounds. Uploads are compressed in
 * the browser, previewed before publishing, scheduled if wanted, and the previous
 * image stays saved for one-click restore.
 */
export default function BackgroundsTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<Overview>('/admin/backgrounds');

  const [slot, setSlot] = useState('app_main');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [busy, setBusy] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  const slots = data?.slots ?? [];
  const backgrounds = data?.backgrounds ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, AdminBackground[]>();
    for (const item of backgrounds) {
      if (!map.has(item.slot)) map.set(item.slot, []);
      map.get(item.slot)!.push(item);
    }
    return map;
  }, [backgrounds]);

  const resetForm = () => {
    setFile(null);
    setPreview(null);
    setTitle('');
    setStartsAt('');
    setEndsAt('');
  };

  const pickFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) return;
    const compressed = await compressImage(picked);
    setFile(compressed);
    setPreview(URL.createObjectURL(compressed));
    if (compressed.size < picked.size) {
      toast.push(`تم ضغط الصورة من ${formatSize(picked.size)} إلى ${formatSize(compressed.size)}`, 'success');
    }
  };

  const save = async (publish: boolean) => {
    if (!file) {
      toast.push('اختر صورة أولاً', 'error');
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const uploaded = await api<{ url: string }>('/admin/backgrounds/upload', {
        method: 'POST',
        admin: true,
        form: body,
      });
      await api('/admin/backgrounds', {
        method: 'POST',
        admin: true,
        body: {
          slot,
          title: title.trim(),
          imageUrl: uploaded.url,
          startsAt: startsAt || null,
          endsAt: endsAt || null,
          publish,
        },
      });
      toast.push(publish ? 'تم نشر الخلفية لجميع المستخدمين' : 'تم حفظ الخلفية بدون نشر', 'success');
      resetForm();
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const publish = async (bg: AdminBackground) => {
    try {
      await api(`/admin/backgrounds/${bg.id}/publish`, { method: 'POST', admin: true });
      toast.push('تم تفعيل الخلفية', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const remove = async (bg: AdminBackground) => {
    if (!window.confirm('حذف هذه الخلفية نهائياً؟ لا يمكن التراجع.')) return;
    try {
      await api(`/admin/backgrounds/${bg.id}`, { method: 'DELETE', admin: true });
      toast.push('تم حذف الخلفية', 'success');
      if (editId === bg.id) setEditId(null);
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const openDates = (bg: AdminBackground) => {
    setEditId(bg.id);
    setEditStart(toInput(bg.startsAt));
    setEditEnd(toInput(bg.endsAt));
  };

  const saveDates = async (bg: AdminBackground) => {
    setEditBusy(true);
    try {
      await api(`/admin/backgrounds/${bg.id}`, {
        method: 'PATCH',
        admin: true,
        body: { startsAt: editStart || null, endsAt: editEnd || null },
      });
      toast.push('تم حفظ مواعيد العرض', 'success');
      setEditId(null);
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <AdminCard
        title="إضافة خلفية جديدة"
        subtitle="JPG / PNG / WebP / GIF (المتحركة مدعومة) — تُضغط الصور تلقائياً قبل الرفع"
      >
        <Field label="القسم الذي ستُطبق عليه الخلفية">
          <div className="bg-slot-grid">
            {slots.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`bg-slot ${slot === item.key ? 'active' : ''}`}
                onClick={() => setSlot(item.key)}
              >
                <span className="row-title">{item.label}</span>
                <span className="tiny muted">{item.hint}</span>
              </button>
            ))}
          </div>
        </Field>

        <label className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }}>
          <Icon name="image" size={15} />
          اختيار صورة من الجهاز
          <input type="file" accept={ACCEPTED} hidden onChange={(event) => void pickFile(event)} />
        </label>

        {preview ? (
          <div className="bg-preview">
            <img src={preview} alt="معاينة الخلفية" />
            <div className="bg-preview-meta">
              <span className="tiny">
                معاينة قبل النشر {file ? `— ${formatSize(file.size)}` : ''}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetForm}>
                <Icon name="x" size={14} /> إلغاء
              </button>
            </div>
          </div>
        ) : (
          <span className="tiny muted">اختر صورة لمعاينتها هنا قبل النشر.</span>
        )}

        <Field label="اسم الخلفية (اختياري)">
          <input
            className="input"
            value={title}
            maxLength={120}
            placeholder="مثال: خلفية العيد"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <div className="inline" style={{ gap: 10, flexWrap: 'wrap' }}>
          <Field label="بداية العرض (اختياري)">
            <input
              className="input"
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field label="نهاية العرض (اختياري)">
            <input
              className="input"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>
        </div>
        <span className="tiny muted">
          بدون تواريخ تبقى الخلفية معروضة حتى تغيّرها. مع نهاية المدة تعود الخلفية السابقة تلقائياً.
        </span>

        <div className="inline" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={!file || busy} onClick={() => void save(true)}>
            {busy ? <span className="spinner" /> : 'نشر الخلفية الآن'}
          </button>
          <button className="btn btn-ghost" disabled={!file || busy} onClick={() => void save(false)}>
            حفظ بدون نشر
          </button>
        </div>
      </AdminCard>

      <AdminCard
        title="الخلفيات الحالية والمحفوظة"
        subtitle="المنشورة تظهر لكل المستخدمين فوراً، والباقي يبقى للاستعادة أو الحذف"
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => void reload()}>
            <Icon name="refresh" size={14} /> تحديث
          </button>
        }
      >
        {loading && !data ? (
          <span className="tiny muted">جارٍ التحميل…</span>
        ) : backgrounds.length === 0 ? (
          <Empty text="لم تُضف أي خلفية بعد — ابدأ برفع صورة من الأعلى." />
        ) : (
          <div className="stack" style={{ gap: 18 }}>
            {slots
              .filter((item) => (grouped.get(item.key)?.length ?? 0) > 0)
              .map((item) => {
                const liveId = data?.live[item.key];
                return (
                  <div key={item.key} className="bg-slot-block">
                    <div className="section-head">
                      <div>
                        <h2 style={{ fontSize: 15 }}>{item.label}</h2>
                        <span className="tiny muted">{item.hint}</span>
                      </div>
                      {liveId ? (
                        <span className="pill pill-gold">
                          <Icon name="check" size={13} /> معروضة الآن
                        </span>
                      ) : (
                        <span className="pill">
                          <Icon name="clock" size={13} /> لا خلفية معروضة
                        </span>
                      )}
                    </div>

                    <div className="bg-history">
                      {(grouped.get(item.key) ?? []).map((bg) => (
                        <div key={bg.id} className={`bg-thumb ${bg.id === liveId ? 'live' : ''}`}>
                          <img src={assetUrl(bg.imageUrl)} alt={bg.title || item.label} loading="lazy" />
                          <div className="bg-thumb-body">
                            <span className="row-title">{bg.title || item.label}</span>
                            <span className="tiny muted">{scheduleLabel(bg, liveId)}</span>
                            <div className="bg-thumb-actions">
                              {bg.id !== liveId ? (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => void publish(bg)}
                                >
                                  {bg.isActive ? 'إعادة تفعيل' : 'نشر / استعادة'}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => (editId === bg.id ? setEditId(null) : openDates(bg))}
                              >
                                <Icon name="clock" size={14} /> المواعيد
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => void remove(bg)}
                              >
                                <Icon name="trash" size={14} />
                              </button>
                            </div>

                            {editId === bg.id ? (
                              <div className="bg-dates">
                                <Field label="بداية العرض">
                                  <input
                                    className="input"
                                    type="datetime-local"
                                    value={editStart}
                                    onChange={(event) => setEditStart(event.target.value)}
                                  />
                                </Field>
                                <Field label="نهاية العرض">
                                  <input
                                    className="input"
                                    type="datetime-local"
                                    value={editEnd}
                                    onChange={(event) => setEditEnd(event.target.value)}
                                  />
                                </Field>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={editBusy}
                                  onClick={() => void saveDates(bg)}
                                >
                                  حفظ المواعيد
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </AdminCard>
    </div>
  );
}
