import { useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, formatDuration, useToast } from '../../lib/ui';
import { AdminCard, Empty, Stat, Table, useAdminData } from './shared';

interface EarningsResponse {
  total: number;
  today: number;
  entries: {
    id: string;
    coins: number;
    percent: number;
    created_at: string;
    kind: string;
    duration_seconds: number;
    coins_charged: number;
    caller_name: string;
    callee_name: string;
  }[];
  topHosts: { id: string; display_name: string; username: string; coins: number }[];
}

interface WithdrawalsResponse {
  withdrawals: {
    id: string;
    user_name: string;
    user_username: string;
    coins: number;
    amount_iqd: number;
    status: string;
    note: string | null;
    created_at: string;
  }[];
}

interface FinancialResponse {
  period: string;
  series: {
    bucket: string;
    calls: number;
    coins_charged: number;
    host_earnings: number;
    admin_earnings: number;
    recharge_iqd: number;
  }[];
  totals: {
    coins_charged: number;
    admin_earnings: number;
    host_earnings: number;
    recharge_iqd: number;
    withdrawals_coins: number;
  };
}

export default function FinancialTab() {
  const toast = useToast();
  const earnings = useAdminData<EarningsResponse>('/admin/earnings');
  const withdrawals = useAdminData<WithdrawalsResponse>('/admin/withdrawals');
  const [period, setPeriod] = useState<'day' | 'month'>('day');
  const financial = useAdminData<FinancialResponse>(`/admin/financial?period=${period}`);

  const decide = async (id: string, action: 'approve' | 'reject') => {
    try {
      await api(`/admin/withdrawals/${id}/${action}`, { method: 'POST', admin: true, body: {} });
      toast.push(action === 'approve' ? 'تمت الموافقة على السحب' : 'تم رفض السحب وإرجاع الكونز', 'success');
      await withdrawals.reload();
      await earnings.reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const totals = financial.data?.totals;
  const withdrawalLabel: Record<string, string> = {
    pending: 'معلّق',
    approved: 'تمت الموافقة',
    rejected: 'مرفوض',
  };

  return (
    <div className="stack">
      <div className="stat-grid">
        <Stat label="إجمالي أرباح الإدارة" value={formatCoins(earnings.data?.total ?? 0)} accent="#86efac" />
        <Stat label="أرباح الإدارة اليوم" value={formatCoins(earnings.data?.today ?? 0)} />
        <Stat label="إجمالي أرباح المستضيفين" value={formatCoins(totals?.host_earnings ?? 0)} />
        <Stat label="إجمالي الكونز المخصومة" value={formatCoins(totals?.coins_charged ?? 0)} accent="#ffd75e" />
        <Stat label="إيرادات الشحن (دينار)" value={formatCoins(totals?.recharge_iqd ?? 0)} />
        <Stat label="الكونز المسحوبة" value={formatCoins(totals?.withdrawals_coins ?? 0)} />
      </div>

      <AdminCard
        title="التقرير المالي"
        subtitle="إجماليات يومية وشهرية بتوقيت بغداد"
        actions={
          <div className="seg" style={{ width: 190 }}>
            <button className={period === 'day' ? 'active' : ''} onClick={() => setPeriod('day')}>
              30 يوم
            </button>
            <button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>
              12 شهر
            </button>
          </div>
        }
      >
        {financial.loading ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : (
          <Table head={['الفترة', 'المكالمات', 'الكونز المخصومة', 'أرباح المستضيف', 'أرباح الإدارة', 'شحن الدينار']}>
            {financial.data?.series.map((row) => (
              <tr key={row.bucket}>
                <td>{row.bucket}</td>
                <td>{row.calls}</td>
                <td className="amount">{formatCoins(row.coins_charged)}</td>
                <td className="amount plus">{formatCoins(row.host_earnings)}</td>
                <td className="amount plus">{formatCoins(row.admin_earnings)}</td>
                <td className="amount">{formatCoins(row.recharge_iqd)}</td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>

      <AdminCard title="طلبات السحب" subtitle="الموافقة تدفع المبلغ؛ الرفض يعيد الكونز">
        {(withdrawals.data?.withdrawals.length ?? 0) === 0 ? (
          <Empty text="لا توجد طلبات سحب" />
        ) : (
          <Table head={['الوقت', 'المستخدم', 'الكونز', 'الدينار', 'الحالة', 'إجراءات']}>
            {withdrawals.data?.withdrawals.map((row) => (
              <tr key={row.id}>
                <td className="tiny">{new Date(row.created_at).toLocaleString('ar-IQ')}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{row.user_name}</div>
                  <div className="tiny muted">@{row.user_username}</div>
                </td>
                <td className="amount">{formatCoins(row.coins)}</td>
                <td>{formatCoins(row.amount_iqd)}</td>
                <td>
                  <span
                    className={`pill ${row.status === 'approved' ? 'pill-green' : row.status === 'pending' ? 'pill-gold' : 'pill-red'}`}
                    style={{ fontSize: 10 }}
                  >
                    {withdrawalLabel[row.status] ?? row.status}
                  </span>
                </td>
                <td>
                  {row.status === 'pending' ? (
                    <div className="inline">
                      <button className="btn btn-primary btn-xs" onClick={() => void decide(row.id, 'approve')}>
                        موافقة
                      </button>
                      <button className="btn btn-danger btn-xs" onClick={() => void decide(row.id, 'reject')}>
                        رفض
                      </button>
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
        <AdminCard title="أعلى المستضيفين ربحاً">
          {(earnings.data?.topHosts.length ?? 0) === 0 ? (
            <Empty text="لا توجد أرباح بعد" />
          ) : (
            <Table head={['المستضيف', 'الكونز']}>
              {earnings.data?.topHosts.map((host) => (
                <tr key={host.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{host.display_name}</div>
                    <div className="tiny muted">@{host.username}</div>
                  </td>
                  <td className="amount plus">{formatCoins(host.coins)}</td>
                </tr>
              ))}
            </Table>
          )}
        </AdminCard>

        <AdminCard title="سجل أرباح الإدارة">
          {(earnings.data?.entries.length ?? 0) === 0 ? (
            <Empty text="لا توجد مكالمات مدفوعة بعد" />
          ) : (
            <Table head={['الوقت', 'المكالمة', 'المخصوم', 'الإدارة']}>
              {earnings.data?.entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="tiny">{new Date(entry.created_at).toLocaleDateString('ar-IQ')}</td>
                  <td className="tiny">
                    {entry.caller_name} ← {entry.callee_name} • {formatDuration(entry.duration_seconds)}
                  </td>
                  <td className="amount">{formatCoins(entry.coins_charged)}</td>
                  <td className="amount plus">{formatCoins(entry.coins)}</td>
                </tr>
              ))}
            </Table>
          )}
        </AdminCard>
      </div>
    </div>
  );
}
