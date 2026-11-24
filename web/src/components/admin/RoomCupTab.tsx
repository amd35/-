import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Stat, Table, Toggle, useAdminData } from './shared';

type CupPeriod = 'daily' | 'weekly' | 'monthly';

interface CupOverview {
  settings: {
    enabled: boolean;
    ownerPercent: number;
    adminPercent: number;
    period: CupPeriod;
    prizes: number[];
  };
  totals: { gifts: number; coins: number; ownerCoins: number; adminCoins: number };
  rooms: {
    id: string;
    name: string;
    ownerId: string | null;
    ownerName: string;
    giftCount: number;
    coins: number;
    ownerCoins: number;
    adminCoins: number;
    competitionEndsAt: string | null;
    competitionPeriod: CupPeriod | null;
  }[];
}

interface CupLedgerEntry {
  id: string;
  roomId: string;
  roomName: string;
  ownerId: string | null;
  ownerName: string | null;
  senderName: string | null;
  recipientName: string | null;
  coins: number;
  ownerCoins: number;
  adminCoins: number;
  ownerPercent: number;
  adminPercent: number;
  status: 'settled' | 'reversed';
  createdAt: string;
  reversedAt: string | null;
}

interface CupLedger {
  total: number;
  entries: CupLedgerEntry[];
}

const PERIODS: { id: CupPeriod; label: string }[] = [
  { id: 'daily', label: 'يومية' },
  { id: 'weekly', label: 'أسبوعية' },
  { id: 'monthly', label: 'شهرية' },
];

const PERIOD_LABEL: Record<CupPeriod, string> = {
  daily: 'يومية',
  weekly: 'أسبوعية',
  monthly: 'شهرية',
};

const EMPTY_SETTINGS = {
  enabled: true,
  ownerPercent: 50,
  period: 'weekly' as CupPeriod,
  prize1: 5000,
  prize2: 2000,
  prize3: 1000,
};

/** إدارة كأس الغرف والأرباح: النسب، مدة المسابقة، الجوائز، أرباح المالكين والسجل المالي. */
export default function RoomCupTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<CupOverview>('/admin/room-cup/overview');
  const [ledger, setLedger] = useState<CupLedger | null>(null);
  const [form, setForm] = useState(EMPTY_SETTINGS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: data.settings.enabled,
      ownerPercent: data.settings.ownerPercent,
      period: data.settings.period,
      prize1: data.settings.prizes[0] ?? 0,
      prize2: data.settings.prizes[1] ?? 0,
      prize3: data.settings.prizes[2] ?? 0,
    });
  }, [data]);

  const loadLedger = () => {
    api<CupLedger>('/admin/room-cup/ledger?limit=100', { admin: true })
      .then(setLedger)
      .catch((error: Error) => toast.push(error.message, 'error'));
  };

  useEffect(() => {
    loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAll = () => {
    void reload();
    loadLedger();
  };

  const save = async () => {
    setBusy(true);
    try {
      await api('/admin/room-cup/settings', {
        method: 'PATCH',
        admin: true,
        body: {
          enabled: form.enabled,
          ownerPercent: form.ownerPercent,
          period: form.period,
          prize1: form.prize1,
          prize2: form.prize2,
          prize3: form.prize3,
        },
      });
      toast.push('تم حفظ إعدادات الكأس', 'success');
      refreshAll();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const closeCompetition = async (roomId: string, roomName: string) => {
    if (!window.confirm(`إنهاء مسابقة «${roomName}» الآن وإعلان الفائزين؟`)) return;
    try {
      const result = await api<{ winners: { displayName: string }[] }>(
        `/admin/room-cup/rooms/${roomId}/close`,
        { method: 'POST', admin: true }
      );
      toast.push(
        result.winners.length
          ? `تم إعلان الفائزين: ${result.winners.map((winner) => winner.displayName).join(' • ')}`
          : 'تم إنهاء المسابقة بدون فائزين (لا إنفاق)',
        'success'
      );
      refreshAll();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const reverseEntry = async (entry: CupLedgerEntry) => {
    if (!window.confirm(`إلغاء احتساب هذه العملية واسترجاع حصة المالك (${formatCoins(entry.ownerCoins)} ذهب)؟`)) {
      return;
    }
    try {
      await api(`/admin/room-cup/ledger/${entry.id}/reverse`, { method: 'POST', admin: true });
      toast.push('تم إلغاء احتساب العملية', 'success');
      refreshAll();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <AdminCard
        title="إعدادات كأس الغرف"
        subtitle="نسبة تقسيم الذهب، مدة المسابقة وجوائز المراكز الثلاثة"
        actions={
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>
            {busy ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
          </button>
        }
      >
        <Toggle
          checked={form.enabled}
          onChange={(value) => setForm((current) => ({ ...current, enabled: value }))}
          label="تفعيل نظام الكأس والأرباح"
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <Field label="حصة مالك الغرفة %" hint={`الإدارة العامة تحصل على ${100 - form.ownerPercent}%`}>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={form.ownerPercent}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  ownerPercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)),
                }))
              }
              dir="ltr"
            />
          </Field>
          <Field label="مدة المسابقة">
            <select
              className="input"
              value={form.period}
              onChange={(event) =>
                setForm((current) => ({ ...current, period: event.target.value as CupPeriod }))
              }
            >
              {PERIODS.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="جائزة المركز الأول">
            <input
              className="input"
              type="number"
              min={0}
              value={form.prize1}
              onChange={(event) =>
                setForm((current) => ({ ...current, prize1: Math.max(0, Number(event.target.value) || 0) }))
              }
              dir="ltr"
            />
          </Field>
          <Field label="جائزة المركز الثاني">
            <input
              className="input"
              type="number"
              min={0}
              value={form.prize2}
              onChange={(event) =>
                setForm((current) => ({ ...current, prize2: Math.max(0, Number(event.target.value) || 0) }))
              }
              dir="ltr"
            />
          </Field>
          <Field label="جائزة المركز الثالث">
            <input
              className="input"
              type="number"
              min={0}
              value={form.prize3}
              onChange={(event) =>
                setForm((current) => ({ ...current, prize3: Math.max(0, Number(event.target.value) || 0) }))
              }
              dir="ltr"
            />
          </Field>
        </div>
      </AdminCard>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <Stat label="إجمالي الذهب المصروف في الغرف" value={formatCoins(data?.totals.coins ?? 0)} />
        <Stat label="أرباح مالكي الغرف" value={formatCoins(data?.totals.ownerCoins ?? 0)} accent="#ffd24a" />
        <Stat label="حصة الإدارة العامة" value={formatCoins(data?.totals.adminCoins ?? 0)} accent="#35e08a" />
        <Stat label="عدد عمليات الهدايا" value={formatCoins(data?.totals.gifts ?? 0)} />
      </div>

      <AdminCard title="أرباح الغرف" subtitle="إجمالي الإنفاق وحصة كل مالك وحصة الإدارة لكل غرفة">
        {loading ? (
          <p className="tiny muted">جارٍ التحميل...</p>
        ) : data?.rooms.length ? (
          <Table head={['الغرفة', 'المالك', 'الإنفاق', 'حصة المالك', 'حصة الإدارة', 'الهدايا', 'المسابقة', 'إجراء']}>
            {data.rooms.map((room) => (
              <tr key={room.id}>
                <td>{room.name}</td>
                <td>{room.ownerName}</td>
                <td>{formatCoins(room.coins)}</td>
                <td style={{ color: '#ffd24a' }}>{formatCoins(room.ownerCoins)}</td>
                <td style={{ color: '#35e08a' }}>{formatCoins(room.adminCoins)}</td>
                <td>{formatCoins(room.giftCount)}</td>
                <td className="tiny">
                  {room.competitionEndsAt
                    ? `${PERIOD_LABEL[room.competitionPeriod ?? 'weekly']} — تنتهي ${new Date(
                        room.competitionEndsAt
                      ).toLocaleDateString('ar-IQ')}`
                    : 'لا مسابقة جارية'}
                </td>
                <td>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => void closeCompetition(room.id, room.name)}
                    disabled={!room.competitionEndsAt}
                  >
                    إنهاء وإعلان الفائزين
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty text="لا توجد غرف بعد" />
        )}
      </AdminCard>

      <AdminCard
        title="السجل المالي للكأس"
        subtitle="كل عملية هدية داخل غرفة: الذهب المصروف، حصة المالك وحصة الإدارة"
        actions={
          <button className="btn btn-ghost btn-sm" onClick={loadLedger}>
            تحديث السجل
          </button>
        }
      >
        {ledger?.entries.length ? (
          <Table
            head={['الوقت', 'الغرفة', 'المرسل', 'المستلم', 'الذهب', 'حصة المالك', 'حصة الإدارة', 'الحالة', 'إجراء']}
          >
            {ledger.entries.map((entry) => (
              <tr key={entry.id}>
                <td className="tiny">{new Date(entry.createdAt).toLocaleString('ar-IQ')}</td>
                <td>{entry.roomName}</td>
                <td>{entry.senderName ?? '—'}</td>
                <td>{entry.recipientName ?? '—'}</td>
                <td>{formatCoins(entry.coins)}</td>
                <td style={{ color: '#ffd24a' }}>
                  {formatCoins(entry.ownerCoins)}
                  <span className="tiny muted"> ({entry.ownerPercent}%)</span>
                </td>
                <td style={{ color: '#35e08a' }}>
                  {formatCoins(entry.adminCoins)}
                  <span className="tiny muted"> ({entry.adminPercent}%)</span>
                </td>
                <td>
                  <span className={`pill ${entry.status === 'settled' ? 'pill-green' : 'pill-gold'}`}>
                    {entry.status === 'settled' ? 'محتسبة' : 'ملغاة'}
                  </span>
                </td>
                <td>
                  {entry.status === 'settled' ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => void reverseEntry(entry)}>
                      إلغاء الاحتساب
                    </button>
                  ) : (
                    <span className="tiny muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty text="لا توجد عمليات مسجلة بعد" />
        )}
        {ledger ? (
          <span className="tiny muted">إجمالي السجلات: {formatCoins(ledger.total)} — تُعرض أحدث 100 عملية</span>
        ) : null}
      </AdminCard>
    </div>
  );
}
