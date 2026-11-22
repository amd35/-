import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Stat, Table, Toggle, useAdminData } from './shared';

interface FreeCallsResponse {
  settings: {
    free_calls_enabled: boolean;
    free_calls_per_day: number;
    free_calls_shared: boolean;
    free_calls_exempt_user_ids: string[];
  };
  usage: {
    id: string;
    display_name: string;
    username: string;
    used: number;
    voice_used: number;
    video_used: number;
    free_calls_total: number;
    earnings: number;
  }[];
  totals: { used: number; users: number };
  today: string;
}

export default function FreeCallsTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<FreeCallsResponse>('/admin/free-calls');
  const [enabled, setEnabled] = useState(true);
  const [perDay, setPerDay] = useState(5);
  const [shared, setShared] = useState(true);
  const [exempt, setExempt] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.settings.free_calls_enabled);
    setPerDay(data.settings.free_calls_per_day);
    setShared(data.settings.free_calls_shared);
    setExempt(data.settings.free_calls_exempt_user_ids.join(', '));
  }, [data]);

  const save = async () => {
    setBusy(true);
    try {
      await api('/admin/settings', {
        method: 'PUT',
        admin: true,
        body: {
          free_calls_enabled: enabled,
          free_calls_per_day: perDay,
          free_calls_shared: shared,
          free_calls_exempt_user_ids: exempt
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        },
      });
      toast.push('Free-call settings saved', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="skeleton" style={{ height: 260 }} />;

  return (
    <div className="stack">
      <div className="stat-grid">
        <Stat label="Attempts used today" value={formatCoins(data?.totals.used ?? 0)} accent="#ffd75e" />
        <Stat label="Accounts using free calls" value={formatCoins(data?.totals.users ?? 0)} />
        <Stat label="Baghdad day" value={data?.today ?? '—'} />
        <Stat label="Renews" value="00:00 Baghdad" hint="Server-side, device clock ignored" />
      </div>

      <AdminCard title="Free attempts system" subtitle="Applies to calls accepted after saving">
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          <Toggle checked={enabled} onChange={setEnabled} label="Enable free attempts" />
          <Toggle checked={shared} onChange={setShared} label="Shared between voice and video" />
          <Field label="Attempts per day">
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={perDay}
              onChange={(event) => setPerDay(Number(event.target.value))}
              dir="ltr"
            />
          </Field>
          <Field label="Exempt user IDs" hint="Comma separated — these accounts never consume attempts">
            <input
              className="input"
              value={exempt}
              onChange={(event) => setExempt(event.target.value)}
              placeholder="uuid, uuid"
              dir="ltr"
            />
          </Field>
        </div>
        <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => void save()} disabled={busy}>
          Save free-call settings
        </button>
      </AdminCard>

      <AdminCard title="Usage today" subtitle="Who consumed free attempts and what they earned">
        {(data?.usage.length ?? 0) === 0 ? (
          <Empty text="No usage yet" />
        ) : (
          <Table head={['User', 'Used today', 'Voice', 'Video', 'Free calls total', 'Earnings']}>
            {data?.usage.map((row) => (
              <tr key={row.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{row.display_name}</div>
                  <div className="tiny muted">@{row.username}</div>
                </td>
                <td>{row.used}</td>
                <td>{row.voice_used}</td>
                <td>{row.video_used}</td>
                <td>{row.free_calls_total}</td>
                <td className="amount plus">{formatCoins(row.earnings)}</td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>
    </div>
  );
}
