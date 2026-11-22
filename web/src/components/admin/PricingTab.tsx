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
      toast.push('Settings saved — applied to new calls', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <AdminCard title="Pricing" subtitle="Changes apply to new calls; running calls keep their rate">
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          <Field label="Voice call price (coins / minute)">
            <input
              className="input"
              type="number"
              value={form.voice_price}
              onChange={(event) => set('voice_price', Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field label="Video call price (coins / minute)">
            <input
              className="input"
              type="number"
              value={form.video_price}
              onChange={(event) => set('video_price', Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field label="Free attempts per day">
            <input
              className="input"
              type="number"
              value={form.free_calls_per_day}
              onChange={(event) => set('free_calls_per_day', Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field label="Admin share (%)" hint={`Host receives ${form.host_percent}%`}>
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
          <Field label="Minimum withdrawal (coins)">
            <input
              className="input"
              type="number"
              value={form.min_withdrawal_coins}
              onChange={(event) => set('min_withdrawal_coins', Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field label="Coin → IQD rate">
            <input
              className="input"
              type="number"
              value={form.coin_to_iqd_rate}
              onChange={(event) => set('coin_to_iqd_rate', Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field label="App name">
            <input className="input" value={form.app_name} onChange={(event) => set('app_name', event.target.value)} />
          </Field>
          <Field label="Support contact">
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
          label="Enable paid calls (coins)"
        />
        <Toggle
          checked={form.free_calls_enabled}
          onChange={(value) => set('free_calls_enabled', value)}
          label="Enable free attempts"
        />
        <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => void save()} disabled={busy}>
          Save settings
        </button>
      </AdminCard>
    </div>
  );
}
