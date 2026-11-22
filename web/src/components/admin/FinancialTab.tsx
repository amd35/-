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

interface WithdrawalRow {
  id: string;
  user_name: string;
  user_username: string;
  coins: number;
  amount_iqd: number;
  amount: number | string;
  currency: string;
  payment_method: string;
  payout_details: string;
  source: string;
  status: string;
  note: string | null;
  created_at: string;
}

interface WithdrawalsResponse {
  withdrawals: WithdrawalRow[];
}

interface GiftTransactionsResponse {
  totals: { revenue: number; recipientPayout: number; adminShare: number; today: number; count: number };
  transactions: {
    id: string;
    gift_name: string;
    coins: number;
    recipient_coins: number;
    admin_coins: number;
    recipient_percent: number;
    admin_percent: number;
    created_at: string;
    sender_name: string;
    sender_username: string;
    recipient_name: string;
    recipient_username: string;
    design: string | null;
    rarity: string;
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

const WITHDRAWAL_STATUS: Record<string, string> = {
  pending: 'معلّق',
  approved: 'تمت الموافقة',
  paid: 'تم الدفع',
  rejected: 'مرفوض',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'pill-gold',
  approved: 'pill-blue',
  paid: 'pill-green',
  rejected: 'pill-red',
};

const METHOD_LABEL: Record<string, string> = {
  manual: 'تحويل يدوي',
  zaincash: 'ZainCash',
  fastpay: 'FastPay',
  bank: 'حساب مصرفي',
};

export default function FinancialTab() {
  const toast = useToast();
  const earnings = useAdminData<EarningsResponse>('/admin/earnings');
  const withdrawals = useAdminData<WithdrawalsResponse>('/admin/withdrawals');
  const giftTx = useAdminData<GiftTransactionsResponse>('/admin/gift-transactions');
  const [period, setPeriod] = useState<'day' | 'month'>('day');
  const financial = useAdminData<FinancialResponse>(`/admin/financial?period=${period}`);

  const decide = async (id: string, action: 'approve' | 'reject' | 'paid') => {
    try {
      await api(`/admin/withdrawals/${id}/${action}`, { method: 'POST', admin: true, body: {} });
      toast.push(
        action === 'approve'
          ? 'تمت الموافقة — بانتظار تأكيد الدفع الفعلي'
          : action === 'paid'
            ? 'تم تسجيل دفع المبلغ للمستخدم'
            : 'تم رفض السحب وإرجاع المبلغ',
        'success'
      );
      await withdrawals.reload();
      await giftTx.reload();
      await earnings.reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const totals = financial.data?.totals;

  return (
    <div className="stack">
      <div className="stat-grid">
        <Stat label="إجمالي أرباح الإدارة (مكالمات)" value={formatCoins(earnings.data?.total ?? 0)} accent="#86efac" />
        <Stat label="أرباح الإدارة اليوم (مكالمات)" value={formatCoins(earnings.data?.today ?? 0)} />
        <Stat label="إجمالي أرباح المستضيفين" value={formatCoins(totals?.host_earnings ?? 0)} />
        <Stat label="إجمالي الكونز المخصومة" value={formatCoins(totals?.coins_charged ?? 0)} accent="#ffd75e" />
        <Stat label="إيرادات الشحن (دينار)" value={formatCoins(totals?.recharge_iqd ?? 0)} />
        <Stat label="الكونز المسحوبة" value={formatCoins(totals?.withdrawals_coins ?? 0)} />
      </div>

      <div className="stat-grid">
        <Stat label="إيراد الهدايا الكلي" value={formatCoins(giftTx.data?.totals.revenue ?? 0)} accent="#ffd75e" />
        <Stat label="أرباح مستلمي الهدايا" value={formatCoins(giftTx.data?.totals.recipientPayout ?? 0)} />
        <Stat label="عمولة التطبيق من الهدايا" value={formatCoins(giftTx.data?.totals.adminShare ?? 0)} accent="#86efac" />
        <Stat label="عمولة الهدايا اليوم" value={formatCoins(giftTx.data?.totals.today ?? 0)} />
        <Stat label="عدد الهدايا المرسلة" value={giftTx.data?.totals.count ?? 0} />
      </div>

      <AdminCard
        title="التقرير المالي للمكالمات"
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

      <AdminCard title="سجل معاملات الهدايا" subtitle="كل هدية أُرسلت داخل الدردشة مع توزيع الأرباح">
        {(giftTx.data?.transactions.length ?? 0) === 0 ? (
          <Empty text="لم تُرسل هدايا بعد" />
        ) : (
          <Table head={['الوقت', 'الهدية', 'المرسل', 'المستلم', 'السعر', 'حصة المستلم', 'عمولة التطبيق']}>
            {giftTx.data?.transactions.map((row) => (
              <tr key={row.id}>
                <td className="tiny">{new Date(row.created_at).toLocaleString('ar-IQ')}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{row.gift_name}</div>
                  <span className={`pill rarity-${row.rarity}`} style={{ fontSize: 9 }}>
                    {row.rarity}
                  </span>
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{row.sender_name}</div>
                  <div className="tiny muted">#{row.sender_username}</div>
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{row.recipient_name}</div>
                  <div className="tiny muted">#{row.recipient_username}</div>
                </td>
                <td className="amount">{formatCoins(row.coins)}</td>
                <td className="amount plus">
                  {formatCoins(row.recipient_coins)} <span className="tiny muted">({row.recipient_percent}%)</span>
                </td>
                <td className="amount plus">{formatCoins(row.admin_coins)}</td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>

      <AdminCard title="طلبات السحب" subtitle="الموافقة تعني المراجعة فقط — لا يُعتبر المبلغ مدفوعاً إلا بعد تسجيل الدفع الفعلي">
        {(withdrawals.data?.withdrawals.length ?? 0) === 0 ? (
          <Empty text="لا توجد طلبات سحب" />
        ) : (
          <Table head={['الوقت', 'المستخدم', 'المصدر', 'الكونز', 'المبلغ', 'الوسيلة', 'الحالة', 'إجراءات']}>
            {withdrawals.data?.withdrawals.map((row) => (
              <tr key={row.id}>
                <td className="tiny">{new Date(row.created_at).toLocaleString('ar-IQ')}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{row.user_name}</div>
                  <div className="tiny muted">#{row.user_username}</div>
                </td>
                <td>
                  <span className={`pill ${row.source === 'profit' ? 'pill-green' : 'pill-gold'}`} style={{ fontSize: 10 }}>
                    {row.source === 'profit' ? 'أرباح هدايا' : 'رصيد كونز'}
                  </span>
                </td>
                <td className="amount">{formatCoins(row.coins)}</td>
                <td>
                  {formatCoins(Number(row.amount || row.amount_iqd))} {row.currency || 'IQD'}
                </td>
                <td className="tiny">
                  {METHOD_LABEL[row.payment_method] ?? row.payment_method}
                  {row.payout_details ? (
                    <div className="tiny muted" dir="ltr" style={{ maxWidth: 160, whiteSpace: 'normal' }}>
                      {row.payout_details}
                    </div>
                  ) : null}
                </td>
                <td>
                  <span className={`pill ${STATUS_CLASS[row.status] ?? 'pill-gold'}`} style={{ fontSize: 10 }}>
                    {WITHDRAWAL_STATUS[row.status] ?? row.status}
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
                  ) : row.status === 'approved' ? (
                    <button className="btn btn-primary btn-xs" onClick={() => void decide(row.id, 'paid')}>
                      تم الدفع
                    </button>
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
                    <div className="tiny muted">#{host.username}</div>
                  </td>
                  <td className="amount plus">{formatCoins(host.coins)}</td>
                </tr>
              ))}
            </Table>
          )}
        </AdminCard>

        <AdminCard title="سجل أرباح الإدارة (مكالمات)">
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
