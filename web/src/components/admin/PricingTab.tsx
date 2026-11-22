import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/ui';
import { AdminCard, Field, Toggle, useAdminData } from './shared';

interface SettingsResponse {
  settings: {
    voice_price: number;
    video_price: number;
    paid_calls_enabled: boolean;
    free_calls_enabled: boolean;
    free_calls_per_day: number;
    admin_percent: number;
    host_percent: number;
    min_withdrawal_coins: number;
    coin_to_iqd_rate: number;
    coin_to_usd_rate: number;
    gifts_enabled: boolean;
    gift_recipient_percent: number;
    gift_admin_percent: number;
    app_name: string;
    support_contact: string;
  };
}

export default function PricingTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<SettingsResponse>('/admin/settings');
  const [form, setForm] = useState<SettingsResponse['settings'] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setForm(data.settings);
  }, [data]);

  if (loading || !form) return <div className="skeleton" style={{ height: 300 }} />;

  const set = <K extends keyof SettingsResponse['settings']>(key: K, value: SettingsResponse['settings'][K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const save = async () => {
    setBusy(true);
    try {
      await api('/admin/settings', { method: 'PUT', admin: true, body: form });
      toast.push('تم حفظ الإعدادات — تُطبَّق على المكالمات الجديدة', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <AdminCard title="الأسعار" subtitle="التغييرات تُطبَّق على المكالمات الجديدة؛ المكالمات الجارية تحتفظ بسعرها">
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          <Field label="سعر المكالمة الصوتية (كونز / دقيقة)">
            <input
              className="input"
              type="number"
              value={form.voice_price}
              onChange={(event) => set('voice_price', Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field label="سعر مكالمة الفيديو (كونز / دقيقة)">
            <input
              className="input"
              type="number"
              value={form.video_price}
              onChange={(event) => set('video_price', Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field label="المحاولات المجانية لكل يوم">
            <input
              className="input"
              type="number"
              value={form.free_calls_per_day}
              onChange={(event) => set('free_calls_per_day', Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field label="نسبة الإدارة (%)" hint={`المستضيف يستلم ${form.host_percent}%`}>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={form.admin_percent}
              onChange={(event) => set('admin_percent', Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field label="الحد الأدنى للسحب (كونز)">
            <input
              className="input"
              type="number"
              value={form.min_withdrawal_coins}
              onChange={(event) => set('min_withdrawal_coins', Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field label="سعر تحويل الكونز للدينار">
            <input
              className="input"
              type="number"
              value={form.coin_to_iqd_rate}
              onChange={(event) => set('coin_to_iqd_rate', Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field label="سعر تحويل الكونز للدولار" hint="قيمة الدولار الواحد بالكونز = 1 ÷ هذا الرقم">
            <input
              className="input"
              type="number"
              step="0.0001"
              value={form.coin_to_usd_rate}
              onChange={(event) => set('coin_to_usd_rate', Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field
            label="نسبة أرباح مستلم الهدية (%)"
            hint={`عمولة التطبيق ${form.gift_admin_percent}% — تُطبَّق على الهدايا التي لا تحدد نسبة خاصة`}
          >
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={form.gift_recipient_percent}
              onChange={(event) => set('gift_recipient_percent', Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field label="اسم التطبيق">
            <input className="input" value={form.app_name} onChange={(event) => set('app_name', event.target.value)} />
          </Field>
          <Field label="جهة الدعم">
            <input
              className="input"
              value={form.support_contact}
              onChange={(event) => set('support_contact', event.target.value)}
              dir="ltr"
            />
          </Field>
        </div>
        <Toggle
          checked={form.paid_calls_enabled}
          onChange={(value) => set('paid_calls_enabled', value)}
          label="تشغيل المكالمات المدفوعة (كونز)"
        />
        <Toggle
          checked={form.free_calls_enabled}
          onChange={(value) => set('free_calls_enabled', value)}
          label="تشغيل المحاولات المجانية"
        />
        <Toggle
          checked={form.gifts_enabled}
          onChange={(value) => set('gifts_enabled', value)}
          label="تشغيل إرسال الهدايا داخل المحادثات"
        />
        <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => void save()} disabled={busy}>
          حفظ الإعدادات
        </button>
      </AdminCard>
    </div>
  );
}
