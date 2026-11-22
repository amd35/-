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
      toast.push('تم حفظ إعدادات المحاولات المجانية', 'success');
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
        <Stat label="المحاولات المستخدمة اليوم" value={formatCoins(data?.totals.used ?? 0)} accent="#ffd75e" />
        <Stat label="حسابات تستخدم المجاني" value={formatCoins(data?.totals.users ?? 0)} />
        <Stat label="يوم بغداد" value={data?.today ?? '—'} />
        <Stat label="التجديد" value="00:00 بتوقيت بغداد" hint="من السيرفر، يُتجاهل وقت الجهاز" />
      </div>

      <AdminCard title="نظام المحاولات المجانية" subtitle="يُطبَّق على المكالمات المقبولة بعد الحفظ">
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          <Toggle checked={enabled} onChange={setEnabled} label="تشغيل المحاولات المجانية" />
          <Toggle checked={shared} onChange={setShared} label="مشتركة بين الصوت والفيديو" />
          <Field label="المحاولات لكل يوم">
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
          <Field label="معرّفات مستخدمين معفيين" hint="مفصولة بفاصلة — هذه الحسابات لا تستهلك محاولات أبداً">
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
          حفظ إعدادات المحاولات المجانية
        </button>
      </AdminCard>

      <AdminCard title="الاستخدام اليوم" subtitle="من استهلك المحاولات المجانية وماذا ربح">
        {(data?.usage.length ?? 0) === 0 ? (
          <Empty text="لا يوجد استخدام بعد" />
        ) : (
          <Table head={['المستخدم', 'المستخدم اليوم', 'صوتية', 'فيديو', 'إجمالي المجاني', 'الأرباح']}>
            {data?.usage.map((row) => (
              <tr key={row.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{row.display_name}</div>
                  <div className="tiny muted">#{row.username}</div>
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
