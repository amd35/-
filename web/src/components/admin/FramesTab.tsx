import { useState } from 'react';
import { api } from '../../lib/api';
import { Avatar, formatCoins, Icon, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Table, Toggle, useAdminData } from './shared';

interface AdminFrame {
  id: string;
  slug: string;
  name: string;
  nameEn: string;
  kind: string;
  design: string | null;
  imageUrl: string | null;
  price: number;
  rarity: string;
  durationDays: number;
  isRare: boolean;
  isActive: boolean;
  sortOrder: number;
  owners: number;
  equippedCount: number;
}

const DESIGN_KEYS = [
  'eagle-gold',
  'eagle-silver',
  'royal-crown',
  'sports-car',
  'racing-led',
  'fire',
  'lightning',
  'royal-purple',
  'diamond-gold',
  'galaxy',
  'aurora',
  'emerald',
  'rainbow',
];

const RARITIES = ['common', 'rare', 'epic', 'legendary', 'vip'];

const EMPTY_FORM = {
  id: '',
  name: '',
  nameEn: '',
  kind: 'design',
  design: 'eagle-gold',
  imageUrl: '',
  price: 1000,
  rarity: 'common',
  durationDays: 0,
  isRare: false,
  sortOrder: 0,
};

export default function FramesTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ frames: AdminFrame[] }>('/admin/frames');
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const reset = () => setForm(EMPTY_FORM);

  const edit = (frame: AdminFrame) => {
    setForm({
      id: frame.id,
      name: frame.name,
      nameEn: frame.nameEn,
      kind: frame.kind,
      design: frame.design ?? 'eagle-gold',
      imageUrl: frame.imageUrl ?? '',
      price: frame.price,
      rarity: frame.rarity,
      durationDays: frame.durationDays,
      isRare: frame.isRare,
      sortOrder: frame.sortOrder,
    });
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.push('اسم الإطار مطلوب', 'error');
      return;
    }
    if (form.kind === 'image' && !form.imageUrl) {
      toast.push('ارفع صورة الإطار أولاً', 'error');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name,
        nameEn: form.nameEn,
        kind: form.kind,
        design: form.kind === 'design' ? form.design : null,
        imageUrl: form.kind === 'image' ? form.imageUrl : null,
        price: Number(form.price),
        rarity: form.rarity,
        durationDays: Number(form.durationDays),
        isRare: form.isRare,
        sortOrder: Number(form.sortOrder),
      };
      if (form.id) {
        await api(`/admin/frames/${form.id}`, { method: 'PATCH', admin: true, body });
        toast.push('تم تحديث الإطار', 'success');
      } else {
        await api('/admin/frames', { method: 'POST', admin: true, body });
        toast.push('تمت إضافة الإطار', 'success');
      }
      reset();
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (frame: AdminFrame) => {
    try {
      await api(`/admin/frames/${frame.id}`, {
        method: 'PATCH',
        admin: true,
        body: { isActive: !frame.isActive },
      });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const uploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    setUploading(true);
    try {
      const response = await api<{ url: string }>('/admin/frames/upload', {
        method: 'POST',
        admin: true,
        form: body,
      });
      setForm((current) => ({ ...current, kind: 'image', imageUrl: response.url }));
      toast.push('تم رفع الصورة', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="stack">
      <AdminCard
        title={form.id ? 'تعديل إطار' : 'إضافة إطار جديد'}
        subtitle="إطارات التصميم مبنية داخل التطبيق ومتحركة، أو ارفع صورة PNG/WebP شفافة"
        actions={
          form.id ? (
            <button className="btn btn-ghost btn-xs" onClick={reset}>
              إلغاء التعديل
            </button>
          ) : undefined
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          <Field label="اسم الإطار (عربي)">
            <input
              className="input"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="الاسم الإنجليزي">
            <input
              className="input"
              dir="ltr"
              value={form.nameEn}
              onChange={(event) => setForm({ ...form, nameEn: event.target.value })}
            />
          </Field>
          <Field label="نوع الإطار">
            <select
              className="select"
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value })}
            >
              <option value="design">تصميم متحرك جاهز</option>
              <option value="image">صورة مرفوعة (PNG/WebP)</option>
            </select>
          </Field>
          {form.kind === 'design' ? (
            <Field label="التصميم">
              <select
                className="select"
                dir="ltr"
                value={form.design}
                onChange={(event) => setForm({ ...form, design: event.target.value })}
              >
                {DESIGN_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="صورة الإطار" hint="PNG أو WebP شفافة، بمقاس مربع">
              <div className="inline">
                <label className="btn btn-ghost btn-xs">
                  <Icon name="image" size={14} /> {uploading ? 'جارٍ الرفع…' : 'رفع صورة'}
                  <input type="file" accept="image/png,image/webp,image/gif" hidden onChange={(event) => void uploadImage(event)} />
                </label>
                {form.imageUrl ? <span className="tiny muted" dir="ltr">{form.imageUrl}</span> : null}
              </div>
            </Field>
          )}
          <Field label="السعر بالكونز">
            <input
              className="input"
              type="number"
              min={0}
              dir="ltr"
              value={form.price}
              onChange={(event) => setForm({ ...form, price: Number(event.target.value) })}
            />
          </Field>
          <Field label="الفئة">
            <select
              className="select"
              dir="ltr"
              value={form.rarity}
              onChange={(event) => setForm({ ...form, rarity: event.target.value })}
            >
              {RARITIES.map((rarity) => (
                <option key={rarity} value={rarity}>
                  {rarity}
                </option>
              ))}
            </select>
          </Field>
          <Field label="مدة الصلاحية (0 = دائم)">
            <input
              className="input"
              type="number"
              min={0}
              dir="ltr"
              value={form.durationDays}
              onChange={(event) => setForm({ ...form, durationDays: Number(event.target.value) })}
            />
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
          <Field label="إطار نادر">
            <Toggle checked={form.isRare} onChange={(value) => setForm({ ...form, isRare: value })} label="نادر / VIP" />
          </Field>
        </div>

        <div className="inline" style={{ gap: 14 }}>
          <div className="frame-preview" style={{ height: 96 }}>
            <Avatar
              user={{
                displayName: form.name || 'A',
                frame: {
                  id: 'preview',
                  kind: form.kind,
                  design: form.kind === 'design' ? form.design : null,
                  imageUrl: form.kind === 'image' ? form.imageUrl : null,
                  rarity: form.rarity,
                },
              }}
              size={72}
            />
          </div>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            <Icon name="check" size={16} /> {busy ? 'جارٍ الحفظ…' : form.id ? 'حفظ التعديلات' : 'إضافة الإطار'}
          </button>
        </div>
      </AdminCard>

      <AdminCard title="إطارات التطبيق" subtitle="تفعيل/تعطيل، الأسعار، الترتيب والمدة">
        {loading ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : (data?.frames.length ?? 0) === 0 ? (
          <Empty text="لا توجد إطارات" />
        ) : (
          <Table head={['معاينة', 'الاسم', 'النوع', 'السعر', 'الفئة', 'المدة', 'المالكون', 'الحالة', 'إجراءات']}>
            {data?.frames.map((frame) => (
              <tr key={frame.id}>
                <td>
                  <Avatar
                    user={{
                      displayName: frame.name,
                      frame: {
                        id: frame.id,
                        kind: frame.kind,
                        design: frame.design,
                        imageUrl: frame.imageUrl,
                        rarity: frame.rarity,
                      },
                    }}
                    size={40}
                  />
                </td>
                <td>
                  <b>{frame.name}</b>
                  <div className="tiny muted" dir="ltr">
                    {frame.slug}
                  </div>
                </td>
                <td className="tiny" dir="ltr">
                  {frame.kind === 'image' ? 'image' : frame.design}
                </td>
                <td>{frame.price > 0 ? formatCoins(frame.price) : 'مجاني'}</td>
                <td>
                  <span className={`pill rarity-${frame.rarity}`} style={{ fontSize: 10 }}>
                    {frame.rarity}
                  </span>
                </td>
                <td className="tiny">{frame.durationDays > 0 ? `${frame.durationDays} يوم` : 'دائم'}</td>
                <td dir="ltr">{frame.owners}</td>
                <td>
                  <span className={`pill ${frame.isActive ? 'pill-green' : 'pill-red'}`} style={{ fontSize: 10 }}>
                    {frame.isActive ? 'نشط' : 'معطّل'}
                  </span>
                </td>
                <td>
                  <div className="inline">
                    <button className="btn btn-ghost btn-xs" onClick={() => edit(frame)}>
                      <Icon name="sparkle" size={13} /> تعديل
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void toggle(frame)}>
                      {frame.isActive ? 'تعطيل' : 'تفعيل'}
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
