import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Stat, Table, Toggle, useAdminData } from './shared';

interface LuckyTier {
  amount: number;
  weight: number;
}

interface LuckySettings {
  lucky_gift_enabled: boolean;
  lucky_gift_price: number;
  lucky_gift_prizes: LuckyTier[];
}

interface SpinRow {
  id: string;
  cost: number;
  prize: number;
  created_at: string;
  display_name: string | null;
  username: string | null;
  room_name: string | null;
}

interface LuckyTotals {
  spins: number;
  spent: number;
  paid: number;
  profit: number;
  winners: number;
}

const KEYS: (keyof LuckySettings)[] = ['lucky_gift_enabled', 'lucky_gift_price', 'lucky_gift_prizes'];

export default function LuckyGiftsTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ settings: LuckySettings }>('/admin/settings');
  const { data: history, reload: reloadHistory } = useAdminData<{
    totals: LuckyTotals;
    spins: SpinRow[];
  }>('/admin/lucky-gifts');
  const [form, setForm] = useState<LuckySettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      lucky_gift_enabled: Boolean(data.settings.lucky_gift_enabled),
      lucky_gift_price: Number(data.settings.lucky_gift_price) || 1000,
      lucky_gift_prizes: (data.settings.lucky_gift_prizes ?? []).map((tier) => ({
        amount: Number(tier.amount) || 0,
        weight: Number(tier.weight) || 0,
      })),
    });
  }, [data]);

  if (loading || !form) return <div className="skeleton" style={{ height: 320 }} />;

  const setTier = (index: number, patch: Partial<LuckyTier>) =>
    setForm((current) =>
      current
        ? {
            ...current,
            lucky_gift_prizes: current.lucky_gift_prizes.map((tier, i) =>
              i === index ? { ...tier, ...patch } : tier
            ),
          }
        : current
    );

  const addTier = () =>
    setForm((current) =>
      current
        ? { ...current, lucky_gift_prizes: [...current.lucky_gift_prizes, { amount: 0, weight: 1 }] }
        : current
    );

  const removeTier = (index: number) =>
    setForm((current) =>
      current
        ? { ...current, lucky_gift_prizes: current.lucky_gift_prizes.filter((_, i) => i !== index) }
        : current
    );

  const totalWeight = form.lucky_gift_prizes.reduce((sum, tier) => sum + Math.max(0, tier.weight), 0);

  const save = async () => {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const key of KEYS) payload[key] = form[key];
      await api('/admin/settings', { method: 'PUT', admin: true, body: payload });
      toast.push('تم حفظ إعدادات هدايا الحظ', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const totals = history?.totals;

  return (
    <div className="stack">
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
        <Stat label="محاولات الحظ" value={formatCoins(totals?.spins ?? 0)} />
        <Stat label="ماسات مدفوعة" value={formatCoins(totals?.spent ?? 0)} />
        <Stat label="جوائز موزعة" value={formatCoins(totals?.paid ?? 0)} />
        <Stat label="صافي الربح" value={formatCoins(totals?.profit ?? 0)} />
        <Stat label="فائزون" value={formatCoins(totals?.winners ?? 0)} />
      </div>

      <AdminCard
        title="هدايا الحظ داخل الغرف الصوتية"
        subtitle="فقاعة ذهبية تنفجر بجائزة فورية؛ السحب يحدث على الخادم حسب الأوزان أدناه"
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => void save()} disabled={busy}>
            {busy ? <span className="spinner" /> : 'حفظ التغييرات'}
          </button>
        }
      >
        <Toggle
          checked={form.lucky_gift_enabled}
          onChange={(value) =>
            setForm((current) => (current ? { ...current, lucky_gift_enabled: value } : current))
          }
          label="تشغيل هدايا الحظ في الغرف"
        />
        <Field label="سعر المحاولة الواحدة (ماسة)" hint="من 1000 إلى 5000 ماسة كحد أقصى">
          <input
            className="input"
            type="number"
            min={1000}
            max={5000}
            value={form.lucky_gift_price}
            onChange={(event) =>
              setForm((current) =>
                current ? { ...current, lucky_gift_price: Number(event.target.value) || 1000 } : current
              )
            }
            dir="ltr"
          />
        </Field>
      </AdminCard>

      <AdminCard
        title="سلّم الجوائز والاحتمالات"
        subtitle={`الوزن نسبي: مجموع الأوزان الحالي ${formatCoins(totalWeight)} — نسبة كل جائزة = وزنها ÷ المجموع`}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={addTier}>
            + إضافة جائزة
          </button>
        }
      >
        {form.lucky_gift_prizes.length === 0 ? (
          <Empty text="أضف جائزة واحدة على الأقل" />
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {form.lucky_gift_prizes.map((tier, index) => (
              <div
                key={index}
                className="row"
                style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
              >
                <Field label="الجائزة (ماسة)">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={tier.amount}
                    onChange={(event) => setTier(index, { amount: Number(event.target.value) || 0 })}
                    dir="ltr"
                  />
                </Field>
                <Field label="الوزن (الاحتمال)">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.1"
                    value={tier.weight}
                    onChange={(event) => setTier(index, { weight: Number(event.target.value) || 0 })}
                    dir="ltr"
                  />
                </Field>
                <Field label="النسبة">
                  <input
                    className="input"
                    readOnly
                    value={`${totalWeight > 0 ? ((Math.max(0, tier.weight) / totalWeight) * 100).toFixed(2) : '0.00'}%`}
                    dir="ltr"
                  />
                </Field>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeTier(index)}
                  aria-label="حذف الجائزة"
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard
        title="آخر المحاولات"
        subtitle="أحدث 100 محاولة مع الجائزة التي سُحبت"
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => void reloadHistory()}>
            تحديث
          </button>
        }
      >
        {!history || history.spins.length === 0 ? (
          <Empty text="لا توجد محاولات بعد" />
        ) : (
          <Table head={['اللاعب', 'الغرفة', 'التكلفة', 'الجائزة', 'التاريخ']}>
            {history.spins.map((spin) => (
              <tr key={spin.id}>
                <td>{spin.display_name || spin.username || '—'}</td>
                <td>{spin.room_name || '—'}</td>
                <td dir="ltr">{formatCoins(spin.cost)}</td>
                <td dir="ltr" style={{ color: spin.prize > 0 ? '#ffd75e' : undefined }}>
                  {formatCoins(spin.prize)}
                </td>
                <td className="tiny muted">
                  {new Date(spin.created_at).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' })}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>
    </div>
  );
}
