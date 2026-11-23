import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Stat, Table, Toggle, useAdminData } from './shared';

interface GameAdminData {
  settings: { enabled: boolean; entryFee: number; minEntry: number; maxEntry: number; appPercent: number };
  totals: { matches: number; entries: number; prizes: number; appCut: number };
  live: {
    id: string;
    mode: string;
    entry_fee: number;
    pot: number;
    prize: number;
    started_at: string | null;
    white_name: string | null;
    black_name: string | null;
    white_score: number | null;
    black_score: number | null;
  }[];
  recent: {
    id: string;
    mode: string;
    entry_fee: number;
    pot: number;
    prize: number;
    app_cut: number;
    status: string;
    ended_at: string | null;
    winner_name: string | null;
  }[];
  bans: { user_id: string; display_name: string; username: string; reason: string; until: string }[];
  reports: {
    id: string;
    reason: string;
    status: string;
    created_at: string;
    reporter_name: string;
    target_name: string;
    target_username: string;
  }[];
  ledger: {
    id: string;
    display_name: string;
    type: string;
    amount: number;
    balance_after: number;
    ref_id: string | null;
    created_at: string;
  }[];
}

const TYPE_LABEL: Record<string, string> = {
  game_entry: 'رسوم دخول',
  game_prize: 'جائزة فائز',
  game_refund: 'إعادة رسوم',
};

export default function GameTab() {
  const { data, loading, reload } = useAdminData<GameAdminData>('/admin/game/overview');
  const toast = useToast();
  const [form, setForm] = useState<GameAdminData['settings'] | null>(null);
  const [saving, setSaving] = useState(false);
  const [banUser, setBanUser] = useState('');
  const [banHours, setBanHours] = useState(24);
  const [banReason, setBanReason] = useState('');

  useEffect(() => {
    if (data) setForm(data.settings);
  }, [data]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await api('/admin/game/settings', { method: 'PATCH', admin: true, body: form });
      toast.push('تم حفظ إعدادات اللعبة', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const ban = async () => {
    if (!banUser.trim()) return;
    try {
      await api('/admin/game/ban', {
        method: 'POST',
        admin: true,
        body: { userId: banUser.trim(), hours: banHours, reason: banReason },
      });
      setBanUser('');
      setBanReason('');
      toast.push('تم حظر اللاعب من اللعبة', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const unban = async (userId: string) => {
    try {
      await api(`/admin/game/ban/${userId}`, { method: 'DELETE', admin: true });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const resolveReport = async (id: string, status: 'resolved' | 'dismissed') => {
    try {
      await api(`/admin/game/reports/${id}/resolve`, {
        method: 'POST',
        admin: true,
        body: { status },
      });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  if (loading || !data || !form) return <Empty text="جاري تحميل لعبة أم الحجار…" />;

  return (
    <div className="stack">
      <AdminCard title="إعدادات لعبة أم الحجار" subtitle="الرسوم والجوائز ونسبة التطبيق">
        <Toggle checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} label="تشغيل اللعبة" />
        <div className="grid-2">
          <Field label="رسوم الدخول (ذهب)">
            <input
              className="input"
              type="number"
              min={0}
              value={form.entryFee}
              onChange={(event) => setForm({ ...form, entryFee: Number(event.target.value) })}
            />
          </Field>
          <Field label="الحد الأدنى">
            <input
              className="input"
              type="number"
              min={0}
              value={form.minEntry}
              onChange={(event) => setForm({ ...form, minEntry: Number(event.target.value) })}
            />
          </Field>
          <Field label="الحد الأعلى">
            <input
              className="input"
              type="number"
              min={0}
              value={form.maxEntry}
              onChange={(event) => setForm({ ...form, maxEntry: Number(event.target.value) })}
            />
          </Field>
          <Field label="نسبة التطبيق %" hint="الباقي جائزة الفائز">
            <input
              className="input"
              type="number"
              min={0}
              max={50}
              value={form.appPercent}
              onChange={(event) => setForm({ ...form, appPercent: Number(event.target.value) })}
            />
          </Field>
        </div>
        <div className="inline">
          <button type="button" className="btn btn-gold" disabled={saving} onClick={() => void save()}>
            حفظ الإعدادات
          </button>
        </div>
      </AdminCard>

      <div className="stat-grid">
        <Stat label="مباريات منتهية" value={formatCoins(data.totals.matches)} />
        <Stat label="ذهب الدخول" value={formatCoins(data.totals.entries)} accent="#ffd75e" />
        <Stat label="جوائز الفائزين" value={formatCoins(data.totals.prizes)} accent="#7ff0b0" />
        <Stat label="أرباح التطبيق" value={formatCoins(data.totals.appCut)} accent="#ff9d9d" />
      </div>

      <AdminCard title="المباريات الجارية" subtitle="مباشرة الآن بين لاعبين حقيقيين">
        {data.live.length ? (
          <Table head={['اللاعب الأبيض', 'النتيجة', 'اللاعب الأسود', 'الرسوم', 'الجائزة', 'البداية']}>
            {data.live.map((match) => (
              <tr key={match.id}>
                <td>{match.white_name || '—'}</td>
                <td>
                  {match.white_score ?? 0} - {match.black_score ?? 0}
                </td>
                <td>{match.black_name || '—'}</td>
                <td>{formatCoins(match.entry_fee)}</td>
                <td>{formatCoins(match.prize)}</td>
                <td>{match.started_at ? new Date(match.started_at).toLocaleTimeString('ar-IQ') : '—'}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty text="لا مباريات جارية الآن" />
        )}
      </AdminCard>

      <AdminCard title="سجل المباريات">
        {data.recent.length ? (
          <Table head={['الحالة', 'الفائز', 'الرسوم', 'الجائزة', 'ربح التطبيق', 'الانتهاء']}>
            {data.recent.map((match) => (
              <tr key={match.id}>
                <td>{match.status === 'finished' ? 'منتهية' : 'ملغاة'}</td>
                <td>{match.winner_name || '—'}</td>
                <td>{formatCoins(match.entry_fee)}</td>
                <td>{formatCoins(match.prize)}</td>
                <td>{formatCoins(match.app_cut)}</td>
                <td>{match.ended_at ? new Date(match.ended_at).toLocaleString('ar-IQ') : '—'}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty text="لا مباريات بعد" />
        )}
      </AdminCard>

      <AdminCard title="حركة الذهب" subtitle="كل خصم وجائزة وإعادة رسوم">
        {data.ledger.length ? (
          <Table head={['اللاعب', 'النوع', 'المبلغ', 'الرصيد بعده', 'الوقت']}>
            {data.ledger.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.display_name}</td>
                <td>{TYPE_LABEL[entry.type] ?? entry.type}</td>
                <td style={{ color: entry.amount < 0 ? '#ff9d9d' : '#7ff0b0' }}>
                  {entry.amount > 0 ? '+' : ''}
                  {formatCoins(entry.amount)}
                </td>
                <td>{formatCoins(entry.balance_after)}</td>
                <td>{new Date(entry.created_at).toLocaleString('ar-IQ')}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty text="لا حركة ذهب بعد" />
        )}
      </AdminCard>

      <AdminCard title="حظر اللاعبين" subtitle="امنع لاعباً من دخول مباريات اللعبة">
        <div className="grid-2">
          <Field label="معرّف اللاعب (ID)">
            <input className="input" value={banUser} onChange={(event) => setBanUser(event.target.value)} />
          </Field>
          <Field label="المدة بالساعات">
            <input
              className="input"
              type="number"
              min={1}
              value={banHours}
              onChange={(event) => setBanHours(Number(event.target.value))}
            />
          </Field>
        </div>
        <Field label="السبب">
          <input className="input" value={banReason} onChange={(event) => setBanReason(event.target.value)} />
        </Field>
        <div className="inline">
          <button type="button" className="btn btn-gold" onClick={() => void ban()}>
            حظر اللاعب
          </button>
        </div>
        {data.bans.length ? (
          <Table head={['اللاعب', 'السبب', 'حتى', '']}>
            {data.bans.map((entry) => (
              <tr key={entry.user_id}>
                <td>
                  {entry.display_name} ({entry.username})
                </td>
                <td>{entry.reason || '—'}</td>
                <td>{new Date(entry.until).toLocaleString('ar-IQ')}</td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void unban(entry.user_id)}>
                    رفع الحظر
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty text="لا لاعبين محظورين" />
        )}
      </AdminCard>

      <AdminCard title="بلاغات اللعبة">
        {data.reports.length ? (
          <Table head={['المُبلِّغ', 'اللاعب', 'السبب', 'الحالة', '']}>
            {data.reports.map((report) => (
              <tr key={report.id}>
                <td>{report.reporter_name}</td>
                <td>
                  {report.target_name} ({report.target_username})
                </td>
                <td>{report.reason || '—'}</td>
                <td>{report.status === 'open' ? 'مفتوح' : report.status === 'resolved' ? 'معالج' : 'مرفوض'}</td>
                <td>
                  {report.status === 'open' ? (
                    <div className="inline">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void resolveReport(report.id, 'resolved')}
                      >
                        معالجة
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => void resolveReport(report.id, 'dismissed')}
                      >
                        رفض
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty text="لا بلاغات" />
        )}
      </AdminCard>
    </div>
  );
}
