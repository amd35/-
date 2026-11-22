import { useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, Icon, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Table, useAdminData } from './shared';

interface PremiumIdRow {
  id: string;
  code: string;
  price: number;
  isSold: boolean;
  soldAt: string | null;
  ownerName: string | null;
}

export default function PremiumIdsTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ ids: PremiumIdRow[] }>('/admin/premium-ids');
  const [code, setCode] = useState('');
  const [price, setPrice] = useState(3000);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!/^\d{1,12}$/.test(code.trim())) {
      toast.push('الآي دي يجب أن يكون أرقاماً فقط', 'error');
      return;
    }
    setBusy(true);
    try {
      await api('/admin/premium-ids', {
        method: 'POST',
        admin: true,
        body: { code: code.trim(), price: Number(price) },
      });
      toast.push('تمت إضافة الرقم إلى المتجر', 'success');
      setCode('');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const updatePrice = async (row: PremiumIdRow, value: string) => {
    const next = Math.round(Number(value));
    if (!Number.isFinite(next) || next < 0 || next === row.price) return;
    try {
      await api(`/admin/premium-ids/${row.id}`, { method: 'PATCH', admin: true, body: { price: next } });
      toast.push('تم تحديث السعر', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const remove = async (row: PremiumIdRow) => {
    if (!window.confirm(`حذف الرقم #${row.code} من المتجر؟`)) return;
    try {
      await api(`/admin/premium-ids/${row.id}`, { method: 'DELETE', admin: true });
      toast.push('تم حذف الرقم', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <div className="stack">
      <AdminCard
        title="إضافة رقم ID مميز"
        subtitle="يُعرض في المتجر ضمن قسم «أرقام ID مميزة»، وعند الشراء يُصبح رقم حساب المشتري"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <Field label="الرقم المميز" hint="أرقام فقط، حتى 12 رقماً">
            <input
              className="input"
              dir="ltr"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="777777"
            />
          </Field>
          <Field label="السعر بالكونز">
            <input
              className="input"
              type="number"
              min={0}
              dir="ltr"
              value={price}
              onChange={(event) => setPrice(Number(event.target.value))}
            />
          </Field>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={() => void add()}>
          <Icon name="check" size={16} /> {busy ? 'جارٍ الإضافة…' : 'إضافة الرقم'}
        </button>
      </AdminCard>

      <AdminCard title="أرقام ID في المتجر" subtitle="الأسعار قابلة للتعديل، والمباع منها لا يُحذف">
        {loading ? (
          <div className="skeleton" style={{ height: 140 }} />
        ) : (data?.ids.length ?? 0) === 0 ? (
          <Empty text="لا توجد أرقام مميزة" />
        ) : (
          <Table head={['الرقم', 'السعر', 'الحالة', 'المشتري', 'إجراءات']}>
            {data?.ids.map((row) => (
              <tr key={row.id}>
                <td dir="ltr">
                  <b>#{row.code}</b>
                </td>
                <td>
                  {row.isSold ? (
                    formatCoins(row.price)
                  ) : (
                    <input
                      className="input"
                      type="number"
                      min={0}
                      dir="ltr"
                      defaultValue={row.price}
                      style={{ maxWidth: 110 }}
                      onBlur={(event) => void updatePrice(row, event.target.value)}
                    />
                  )}
                </td>
                <td>
                  <span className={`pill ${row.isSold ? 'pill-red' : 'pill-green'}`} style={{ fontSize: 10 }}>
                    {row.isSold ? 'مُباع' : 'متاح'}
                  </span>
                </td>
                <td className="tiny">{row.ownerName ?? '—'}</td>
                <td>
                  {row.isSold ? null : (
                    <button className="btn btn-ghost btn-xs" onClick={() => void remove(row)}>
                      <Icon name="trash" size={13} /> حذف
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>
    </div>
  );
}
