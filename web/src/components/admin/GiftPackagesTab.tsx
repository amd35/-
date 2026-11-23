import { useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, Icon, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Table, useAdminData } from './shared';

interface PackageItem {
  giftId: string;
  name: string;
  quantity: number;
}

interface AdminPackage {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  price: number;
  isActive: boolean;
  sortOrder: number;
  items: PackageItem[];
  purchases: number;
  revenue: number;
}

interface AdminGift {
  id: string;
  name: string;
  price: number;
  rarity: string;
}

/**
 * «باقات الهدايا»: the admin builds bundles here; a user who recharges one gets
 * every line inside it in their gift bag, ready to send for free.
 */
export default function GiftPackagesTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{
    packages: AdminPackage[];
    gifts: AdminGift[];
  }>('/admin/gift-packages');
  const [drafts, setDrafts] = useState<Record<string, Partial<AdminPackage>>>({});
  const [form, setForm] = useState({
    name: '',
    nameEn: '',
    description: '',
    price: 3000,
    items: [] as PackageItem[],
  });
  const [pick, setPick] = useState({ giftId: '', quantity: 1 });
  const [grant, setGrant] = useState({ user: '', packageId: '' });

  const value = <K extends keyof AdminPackage>(pkg: AdminPackage, key: K): AdminPackage[K] =>
    (drafts[pkg.id]?.[key] as AdminPackage[K]) ?? pkg[key];

  const setDraft = (id: string, key: keyof AdminPackage, next: unknown) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [key]: next } }));

  const giftName = (giftId: string) =>
    data?.gifts.find((gift) => gift.id === giftId)?.name ?? giftId;

  const addItem = () => {
    if (!pick.giftId || pick.quantity <= 0) return;
    setForm((current) => {
      const existing = current.items.find((item) => item.giftId === pick.giftId);
      const items = existing
        ? current.items.map((item) =>
            item.giftId === pick.giftId
              ? { ...item, quantity: item.quantity + pick.quantity }
              : item
          )
        : [
            ...current.items,
            { giftId: pick.giftId, name: giftName(pick.giftId), quantity: pick.quantity },
          ];
      return { ...current, items };
    });
    setPick({ giftId: '', quantity: 1 });
  };

  const removeItem = (giftId: string) =>
    setForm((current) => ({
      ...current,
      items: current.items.filter((item) => item.giftId !== giftId),
    }));

  const create = async () => {
    if (!form.name.trim()) {
      toast.push('اكتب اسم الباقة', 'error');
      return;
    }
    if (form.items.length === 0) {
      toast.push('أضف هدية واحدة على الأقل', 'error');
      return;
    }
    try {
      await api('/admin/gift-packages', {
        method: 'POST',
        admin: true,
        body: {
          name: form.name,
          nameEn: form.nameEn,
          description: form.description,
          price: Number(form.price),
          items: form.items.map((item) => ({ giftId: item.giftId, quantity: item.quantity })),
        },
      });
      toast.push('تم إنشاء الباقة', 'success');
      setForm({ name: '', nameEn: '', description: '', price: 3000, items: [] });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const save = async (pkg: AdminPackage) => {
    try {
      await api(`/admin/gift-packages/${pkg.id}`, {
        method: 'PUT',
        admin: true,
        body: {
          name: value(pkg, 'name'),
          nameEn: pkg.nameEn,
          description: pkg.description,
          price: Number(value(pkg, 'price')),
          isActive: Boolean(value(pkg, 'isActive')),
        },
      });
      toast.push('تم حفظ الباقة', 'success');
      setDrafts((current) => {
        const next = { ...current };
        delete next[pkg.id];
        return next;
      });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const deactivate = async (pkg: AdminPackage) => {
    try {
      await api(`/admin/gift-packages/${pkg.id}`, { method: 'DELETE', admin: true });
      toast.push('تم إيقاف الباقة', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const grantPackage = async () => {
    if (!grant.user.trim() || !grant.packageId) {
      toast.push('اختر الباقة واكتب آي دي المستخدم', 'error');
      return;
    }
    try {
      await api(`/admin/gift-packages/${grant.packageId}/grant`, {
        method: 'POST',
        admin: true,
        body: { user: grant.user.trim() },
      });
      toast.push('تمت إضافة الباقة إلى جنطة المستخدم', 'success');
      setGrant({ user: '', packageId: '' });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <div className="stack">
      <AdminCard
        title="باقات الهدايا"
        subtitle="تظهر في متجر الهدايا — الشحن يضع الهدايا داخل جنطة المستخدم"
      >
        {loading ? (
          <div className="skeleton" style={{ height: 180 }} />
        ) : (data?.packages.length ?? 0) === 0 ? (
          <Empty text="لا توجد باقات" />
        ) : (
          <Table head={['الاسم', 'السعر (ماس)', 'المحتويات', 'الشحنات', 'الإيراد', 'مفعّلة', 'إجراءات']}>
            {data?.packages.map((pkg) => (
              <tr key={pkg.id}>
                <td>
                  <input
                    className="input"
                    style={{ width: 140, padding: '6px 10px' }}
                    value={String(value(pkg, 'name'))}
                    onChange={(event) => setDraft(pkg.id, 'name', event.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    style={{ width: 90, padding: '6px 10px' }}
                    value={Number(value(pkg, 'price'))}
                    onChange={(event) => setDraft(pkg.id, 'price', Number(event.target.value))}
                    dir="ltr"
                  />
                </td>
                <td>
                  <span className="tiny muted">
                    {pkg.items.map((item) => `${item.name} ×${item.quantity}`).join(' · ') || '—'}
                  </span>
                </td>
                <td>{formatCoins(pkg.purchases)}</td>
                <td>{formatCoins(pkg.revenue)}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={Boolean(value(pkg, 'isActive'))}
                    onChange={(event) => setDraft(pkg.id, 'isActive', event.target.checked)}
                  />
                </td>
                <td>
                  <div className="inline">
                    <button className="btn btn-primary btn-xs" onClick={() => void save(pkg)}>
                      حفظ
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void deactivate(pkg)}>
                      إيقاف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>

      <AdminCard title="باقة جديدة" subtitle="اختر الهدايا وكمياتها، ثم أنشئ الباقة">
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
          <Field label="الاسم">
            <input
              className="input"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="الاسم بالإنجليزية">
            <input
              className="input"
              dir="ltr"
              value={form.nameEn}
              onChange={(event) => setForm({ ...form, nameEn: event.target.value })}
            />
          </Field>
          <Field label="السعر بالماس">
            <input
              className="input"
              type="number"
              dir="ltr"
              value={form.price}
              onChange={(event) => setForm({ ...form, price: Number(event.target.value) })}
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

        <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select
            className="input"
            style={{ maxWidth: 220 }}
            value={pick.giftId}
            onChange={(event) => setPick({ ...pick, giftId: event.target.value })}
          >
            <option value="">اختر هدية…</option>
            {data?.gifts.map((gift) => (
              <option key={gift.id} value={gift.id}>
                {gift.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="number"
            min={1}
            style={{ width: 90 }}
            dir="ltr"
            value={pick.quantity}
            onChange={(event) => setPick({ ...pick, quantity: Number(event.target.value) })}
          />
          <button className="btn btn-ghost" onClick={addItem}>
            <Icon name="plus" size={15} /> إضافة
          </button>
        </div>

        {form.items.length > 0 ? (
          <div className="inline" style={{ gap: 6, flexWrap: 'wrap' }}>
            {form.items.map((item) => (
              <button
                key={item.giftId}
                className="btn btn-ghost btn-xs"
                onClick={() => removeItem(item.giftId)}
              >
                {item.name} ×{item.quantity} ✕
              </button>
            ))}
          </div>
        ) : (
          <span className="tiny muted">لم تُضف هدايا بعد</span>
        )}

        <div className="inline" style={{ justifyContent: 'space-between' }}>
          <span className="tiny muted">
            {form.items.length} هدية · {formatCoins(form.price)} ماس
          </span>
          <button className="btn btn-primary" onClick={() => void create()}>
            إنشاء الباقة
          </button>
        </div>
      </AdminCard>

      <AdminCard title="إهداء باقة لمستخدم" subtitle="تصل الباقة إلى جنطة المستخدم بدون خصم">
        <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
          <select
            className="input"
            style={{ maxWidth: 240 }}
            value={grant.packageId}
            onChange={(event) => setGrant({ ...grant, packageId: event.target.value })}
          >
            <option value="">اختر الباقة…</option>
            {data?.packages
              .filter((pkg) => pkg.isActive)
              .map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name}
                </option>
              ))}
          </select>
          <input
            className="input"
            style={{ maxWidth: 220 }}
            placeholder="آي دي المستخدم أو بريده أو رقمه"
            value={grant.user}
            onChange={(event) => setGrant({ ...grant, user: event.target.value })}
          />
          <button className="btn btn-gold" onClick={() => void grantPackage()}>
            <Icon name="gift" size={15} /> إهداء
          </button>
        </div>
      </AdminCard>
    </div>
  );
}
