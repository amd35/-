import { useState, type ChangeEvent } from 'react';
import { api, assetUrl } from '../../lib/api';
import { Icon, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Toggle, useAdminData } from './shared';

interface AdminTier {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  imageUrl: string | null;
  priceDiamonds: number;
  memberCapacity: number;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY_FORM = {
  id: '',
  name: '',
  nameEn: '',
  description: '',
  imageUrl: '',
  priceDiamonds: 0,
  memberCapacity: 1000,
  sortOrder: 0,
  isActive: true,
};

/**
 * Room store tiers. Every tier the administration publishes here appears inside
 * every room's own store; the room owner buys it with diamonds and the room's
 * member limit becomes the highest tier it owns.
 */
export default function RoomUpgradesTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ tiers: AdminTier[] }>('/admin/rooms/upgrade-tiers');
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const tiers = data?.tiers ?? [];

  const edit = (tier: AdminTier) =>
    setForm({
      id: tier.id,
      name: tier.name,
      nameEn: tier.nameEn,
      description: tier.description,
      imageUrl: tier.imageUrl ?? '',
      priceDiamonds: tier.priceDiamonds,
      memberCapacity: tier.memberCapacity,
      sortOrder: tier.sortOrder,
      isActive: tier.isActive,
    });

  const save = async () => {
    if (!form.name.trim()) {
      toast.push('اسم الترقية مطلوب', 'error');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name,
        nameEn: form.nameEn,
        description: form.description,
        imageUrl: form.imageUrl || null,
        priceDiamonds: form.priceDiamonds,
        memberCapacity: form.memberCapacity,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      };
      if (form.id) {
        await api(`/admin/rooms/upgrade-tiers/${form.id}`, { method: 'PATCH', admin: true, body });
        toast.push('تم تحديث الترقية', 'success');
      } else {
        await api('/admin/rooms/upgrade-tiers', { method: 'POST', admin: true, body });
        toast.push('تمت إضافة الترقية إلى متجر الغرف', 'success');
      }
      setForm(EMPTY_FORM);
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tier: AdminTier) => {
    if (!window.confirm(`حذف ترقية «${tier.name}»؟ الغرف التي اشترتها ستفقد سعتها الإضافية.`)) return;
    try {
      await api(`/admin/rooms/upgrade-tiers/${tier.id}`, { method: 'DELETE', admin: true });
      toast.push('تم حذف الترقية', 'success');
      if (form.id === tier.id) setForm(EMPTY_FORM);
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const toggleActive = async (tier: AdminTier) => {
    try {
      await api(`/admin/rooms/upgrade-tiers/${tier.id}`, {
        method: 'PATCH',
        admin: true,
        body: { ...tier, isActive: !tier.isActive },
      });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    setUploading(true);
    try {
      const response = await api<{ url: string }>('/admin/rooms/upload', {
        method: 'POST',
        admin: true,
        form: body,
      });
      setForm((current) => ({ ...current, imageUrl: response.url }));
      toast.push('تم رفع صورة الترقية', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="admin-stack">
      <AdminCard
        title={form.id ? 'تعديل ترقية' : 'إضافة ترقية جديدة'}
        subtitle="كل ترقية تظهر في متجر كل غرفة: اسمها وصورتها وسعرها بالماس وعدد الأعضاء الذي تفتحه"
        actions={
          form.id ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setForm(EMPTY_FORM)}>
              <Icon name="plus" size={14} /> ترقية جديدة
            </button>
          ) : null
        }
      >
        <div className="admin-grid-2">
          <Field label="اسم الترقية">
            <input
              className="input"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="مثال: ترقية ذهبية"
            />
          </Field>
          <Field label="الاسم بالإنجليزية" hint="اختياري">
            <input
              className="input"
              dir="ltr"
              value={form.nameEn}
              onChange={(event) => setForm({ ...form, nameEn: event.target.value })}
              placeholder="Gold upgrade"
            />
          </Field>
        </div>

        <Field label="الوصف" hint="سطر قصير يظهر تحت الاسم في المتجر">
          <input
            className="input"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </Field>

        <div className="admin-grid-2">
          <Field label="السعر (ماس)">
            <input
              className="input"
              type="number"
              min={0}
              value={form.priceDiamonds}
              onChange={(event) => setForm({ ...form, priceDiamonds: Number(event.target.value) || 0 })}
            />
          </Field>
          <Field label="حد الأعضاء" hint="أقصى عدد أعضاء تفتحه هذه الترقية">
            <input
              className="input"
              type="number"
              min={1}
              value={form.memberCapacity}
              onChange={(event) => setForm({ ...form, memberCapacity: Number(event.target.value) || 1000 })}
            />
          </Field>
        </div>

        <div className="admin-grid-2">
          <Field label="صورة الترقية">
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                dir="ltr"
                value={form.imageUrl}
                onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
                placeholder="/uploads/..."
              />
              <label className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }}>
                <Icon name="image" size={14} /> {uploading ? 'جارٍ الرفع…' : 'رفع صورة'}
                <input type="file" accept="image/*" hidden onChange={(event) => void upload(event)} />
              </label>
            </div>
          </Field>
          <Field label="الترتيب">
            <input
              className="input"
              type="number"
              value={form.sortOrder}
              onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) || 0 })}
            />
          </Field>
        </div>

        <Toggle
          checked={form.isActive}
          onChange={(value) => setForm({ ...form, isActive: value })}
          label="منشورة في متجر الغرف"
        />

        <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : form.id ? 'حفظ التعديلات' : 'إضافة الترقية'}
        </button>
      </AdminCard>

      <AdminCard title="الترقيات" subtitle={`${tiers.length} ترقية — السعر بالماس والسعة لكل ترقية`}>
        {loading ? (
          <p className="tiny muted">جارٍ التحميل…</p>
        ) : tiers.length === 0 ? (
          <Empty text="لا توجد ترقيات بعد — أضف أول ترقية لتظهر في متجر الغرف" />
        ) : (
          <div className="admin-stack">
            {tiers.map((tier) => (
              <div key={tier.id} className="admin-mic-row">
                <span className="room-store-thumb">
                  {tier.imageUrl ? (
                    <img src={assetUrl(tier.imageUrl)} alt={tier.name} />
                  ) : (
                    <Icon name="sparkle" size={18} />
                  )}
                </span>
                <span className="row-main" style={{ minWidth: 140 }}>
                  <b>{tier.name}</b>
                  <span className="tiny muted">
                    {tier.priceDiamonds.toLocaleString('en-US')} ماسة · حتى{' '}
                    {tier.memberCapacity.toLocaleString('en-US')} عضو
                  </span>
                </span>
                <span className={`pill${tier.isActive ? '' : ' off'}`}>
                  {tier.isActive ? 'منشورة' : 'مخفية'}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => void toggleActive(tier)}>
                  <Icon name={tier.isActive ? 'eye' : 'lock'} size={14} />
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => edit(tier)}>
                  <Icon name="settings" size={14} />
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => void remove(tier)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </AdminCard>
    </div>
  );
}
