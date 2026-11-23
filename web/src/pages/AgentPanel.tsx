import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Avatar, formatCoins, formatTimeAgo, Icon, Spinner, useToast } from '../lib/ui';
import { AppShell } from '../components/AppShell';

/**
 * The agent panel (لوحة الوكيل). Rendered only for accounts the general admin
 * approved: every figure and every action is server-side, so hiding the entry
 * point is a convenience, never the security boundary.
 */

interface AgentPanelData {
  agent: {
    id: string;
    status: 'active' | 'suspended';
    commissionPercent: number;
    coinsBalance: number;
    goldBalance: number;
    totalCommission: number;
    paidCommission: number;
    dueCommission: number;
    note: string | null;
    createdAt: string;
  };
  user: { id: string; username: string; displayName: string; avatarUrl: string | null } | null;
  packages: { id: string; name: string; currency: 'coins' | 'gold'; amount: number; costCoins: number }[];
  stats: {
    todaySales: number;
    weekSales: number;
    monthSales: number;
    totalSales: number;
    recharges: number;
    customers: number;
    requests: { pending: number; completed: number; rejected: number; cancelled: number };
  };
  recharges: {
    id: string;
    currency: 'coins' | 'gold';
    amount: number;
    costCoins: number;
    commissionCoins: number;
    createdAt: string;
    user: { id: string; username: string; displayName: string; avatarUrl: string | null };
  }[];
  requests: {
    id: string;
    currency: 'coins' | 'gold';
    amount: number;
    costCoins: number;
    status: 'pending' | 'completed' | 'rejected' | 'cancelled';
    note: string | null;
    agentNote: string | null;
    createdAt: string;
    user: { id: string; username: string; displayName: string; avatarUrl: string | null };
  }[];
  ledger: {
    id: string;
    kind: string;
    currency: 'coins' | 'gold';
    amount: number;
    balanceAfter: number;
    note: string | null;
    createdAt: string;
  }[];
}

interface FoundUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  banned: boolean;
  isSelf: boolean;
}

const TEXT = {
  ar: {
    title: 'لوحة الوكيل',
    badge: 'وكيل شحن رسمي',
    coinsBalance: 'رصيد العملات',
    goldBalance: 'رصيد الذهب',
    due: 'أرباح مستحقة',
    paid: 'أرباح مدفوعة',
    today: 'مبيعات اليوم',
    week: 'مبيعات الأسبوع',
    month: 'مبيعات الشهر',
    total: 'إجمالي الشحن',
    customers: 'عدد العملاء',
    operations: 'عدد العمليات',
    commission: 'نسبة العمولة',
    newRecharge: 'شحن مستخدم',
    searchLabel: 'ابحث عن المستخدم برقم ID',
    search: 'بحث',
    found: 'المستخدم المطلوب',
    banned: 'هذا الحساب محظور',
    self: 'لا يمكنك شحن حسابك',
    package: 'باقة الشحن',
    amount: 'الكمية',
    cost: 'المبلغ المطلوب من رصيدك',
    commissionPreview: 'عمولتك من العملية',
    confirm: 'تأكيد الشحن',
    confirming: 'جارٍ التنفيذ…',
    done: 'تم الشحن بنجاح',
    requests: 'طلبات العملاء',
    all: 'الكل',
    pending: 'جديدة',
    completed: 'مكتملة',
    rejected: 'مرفوضة',
    cancelled: 'ملغاة',
    accept: 'تنفيذ الشحن',
    reject: 'رفض',
    rechargesLog: 'سجل عمليات الشحن',
    statement: 'كشف الحساب',
    empty: 'لا توجد بيانات بعد',
    noPanel: 'لوحة الوكيل غير متاحة',
    noPanelHint: 'هذه الصفحة تظهر فقط للحسابات التي منحتها الإدارة صفة وكيل شحن رسمي.',
    back: 'رجوع',
    insufficient: 'رصيدك غير كافٍ لتنفيذ هذه العملية',
    balanceAfter: 'الرصيد بعد العملية',
    suspended: 'الوكالة موقوفة مؤقتاً — راجع الإدارة',
    id: 'المعرف',
  },
  en: {
    title: 'Agent panel',
    badge: 'Official recharge agent',
    coinsBalance: 'Coin balance',
    goldBalance: 'Gold balance',
    due: 'Due commission',
    paid: 'Paid commission',
    today: 'Sales today',
    week: 'Sales this week',
    month: 'Sales this month',
    total: 'Total recharged',
    customers: 'Customers',
    operations: 'Operations',
    commission: 'Commission rate',
    newRecharge: 'Recharge a user',
    searchLabel: 'Search a user by ID',
    search: 'Search',
    found: 'Receiver',
    banned: 'This account is banned',
    self: 'You cannot recharge your own account',
    package: 'Package',
    amount: 'Amount',
    cost: 'Required from your balance',
    commissionPreview: 'Your commission',
    confirm: 'Confirm recharge',
    confirming: 'Processing…',
    done: 'Recharge completed',
    requests: 'Customer requests',
    all: 'All',
    pending: 'New',
    completed: 'Completed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    accept: 'Recharge',
    reject: 'Reject',
    rechargesLog: 'Recharge log',
    statement: 'Account statement',
    empty: 'Nothing here yet',
    noPanel: 'Agent panel unavailable',
    noPanelHint: 'This page is only for accounts the administration approved as official recharge agents.',
    back: 'Back',
    insufficient: 'Your balance is not enough for this operation',
    balanceAfter: 'Balance after',
    suspended: 'This agency is suspended — contact the administration',
    id: 'ID',
  },
} as const;

export default function AgentPanel() {
  const { me } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const L = TEXT[lang === 'ar' ? 'ar' : 'en'];

  const [data, setData] = useState<AgentPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<FoundUser | null>(null);
  const [searching, setSearching] = useState(false);
  const [packageId, setPackageId] = useState('');
  const [amount, setAmount] = useState('1');
  const [busy, setBusy] = useState(false);
  const [requestTab, setRequestTab] = useState<'all' | 'pending' | 'completed' | 'rejected' | 'cancelled'>('pending');

  const load = useCallback(async () => {
    try {
      const response = await api<AgentPanelData>('/agent');
      setData(response);
      setError(null);
      setPackageId((current) => current || response.packages[0]?.id || '');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (me?.agent?.status !== 'active') {
      setLoading(false);
      return;
    }
    void load();
  }, [me?.agent?.status, load]);

  const selectedPackage = useMemo(
    () => data?.packages.find((pack) => pack.id === packageId) ?? null,
    [data, packageId]
  );
  const quantity = Math.max(0, Math.trunc(Number(amount) || 0));
  const cost = selectedPackage
    ? Math.max(1, Math.ceil((selectedPackage.costCoins * quantity) / selectedPackage.amount))
    : 0;
  const commission = data ? Math.floor((cost * data.agent.commissionPercent) / 100) : 0;

  if (!me) return null;

  if (me.agent?.status !== 'active') {
    return (
      <AppShell title={L.title} active="profile">
        <div className="page">
          <div className="card center stack">
            <Icon name="lock" size={28} />
            <h2 style={{ fontSize: 18 }}>{L.noPanel}</h2>
            <p className="tiny muted">{L.noPanelHint}</p>
            <button className="btn btn-ghost btn-block" onClick={() => navigate('/profile')}>
              {L.back}
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  const search = async () => {
    const value = query.trim();
    if (!value) return;
    setSearching(true);
    setTarget(null);
    try {
      const response = await api<{ user: FoundUser }>(`/agent/lookup?q=${encodeURIComponent(value)}`);
      setTarget(response.user);
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setSearching(false);
    }
  };

  const confirmRecharge = async () => {
    if (!target || !selectedPackage || quantity <= 0) return;
    setBusy(true);
    try {
      await api('/agent/recharge', {
        method: 'POST',
        body: {
          userId: target.id,
          packageId: selectedPackage.id,
          amount: quantity,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      toast.push(L.done, 'success');
      setTarget(null);
      setQuery('');
      setAmount('1');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (id: string, action: 'complete' | 'reject') => {
    setBusy(true);
    try {
      await api(`/agent/requests/${id}/${action}`, { method: 'POST', body: {} });
      toast.push(action === 'complete' ? L.done : L.rejected, 'success');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const requests = (data?.requests ?? []).filter((row) =>
    requestTab === 'all' ? true : row.status === requestTab
  );

  return (
    <AppShell title={L.title} active="profile" bare>
      <div className="page page-tight agent-page">
        <header className="agent-hero">
          <div className="agent-hero-glow" aria-hidden="true" />
          <Avatar user={{ displayName: data?.user?.displayName ?? me.user.displayName, avatarUrl: data?.user?.avatarUrl ?? me.user.avatarUrl }} size={64} />
          <div className="agent-hero-id">
            <div className="agent-hero-name">{data?.user?.displayName ?? me.user.displayName}</div>
            <span className="agent-badge">
              <Icon name="shield" size={12} /> {L.badge}
            </span>
            <div className="agent-hero-sub">
              #{data?.user?.username ?? me.user.username} • {L.commission} {data?.agent.commissionPercent ?? 0}%
            </div>
          </div>
          <button className="icon-btn plain" onClick={() => navigate('/profile')} aria-label={L.back}>
            <Icon name="arrowLeft" size={18} />
          </button>
        </header>

        {data?.agent.status === 'suspended' ? (
          <div className="agent-warn">{L.suspended}</div>
        ) : null}

        {loading ? (
          <Spinner label={L.title} />
        ) : error ? (
          <div className="card center stack">
            <span className="tiny">{error}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => void load()}>
              {L.search}
            </button>
          </div>
        ) : data ? (
          <>
            <section className="agent-stats">
              <div className="agent-stat">
                <span className="agent-stat-icon coins">
                  <Icon name="coins" size={16} />
                </span>
                <span className="agent-stat-value">{formatCoins(data.agent.coinsBalance)}</span>
                <span className="agent-stat-label">{L.coinsBalance}</span>
              </div>
              <div className="agent-stat">
                <span className="agent-stat-icon gold">
                  <Icon name="star" size={16} />
                </span>
                <span className="agent-stat-value">{formatCoins(data.agent.goldBalance)}</span>
                <span className="agent-stat-label">{L.goldBalance}</span>
              </div>
              <div className="agent-stat">
                <span className="agent-stat-icon due">
                  <Icon name="percent" size={16} />
                </span>
                <span className="agent-stat-value">{formatCoins(data.agent.dueCommission)}</span>
                <span className="agent-stat-label">{L.due}</span>
              </div>
              <div className="agent-stat">
                <span className="agent-stat-icon paid">
                  <Icon name="check" size={16} />
                </span>
                <span className="agent-stat-value">{formatCoins(data.agent.paidCommission)}</span>
                <span className="agent-stat-label">{L.paid}</span>
              </div>
            </section>

            <section className="agent-card">
              <div className="agent-row-between">
                <span className="tiny muted">{L.today}</span>
                <strong>{formatCoins(data.stats.todaySales)}</strong>
              </div>
              <div className="agent-row-between">
                <span className="tiny muted">{L.week}</span>
                <strong>{formatCoins(data.stats.weekSales)}</strong>
              </div>
              <div className="agent-row-between">
                <span className="tiny muted">{L.month}</span>
                <strong>{formatCoins(data.stats.monthSales)}</strong>
              </div>
              <div className="agent-row-between">
                <span className="tiny muted">{L.total}</span>
                <strong>{formatCoins(data.stats.totalSales)}</strong>
              </div>
              <div className="agent-row-between">
                <span className="tiny muted">{L.customers}</span>
                <strong>{formatCoins(data.stats.customers)}</strong>
              </div>
              <div className="agent-row-between">
                <span className="tiny muted">{L.operations}</span>
                <strong>{formatCoins(data.stats.recharges)}</strong>
              </div>
            </section>

            <section className="agent-card">
              <h3 className="agent-card-title">
                <Icon name="send" size={16} /> {L.newRecharge}
              </h3>
              <div className="agent-search">
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder={L.searchLabel}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void search();
                  }}
                />
                <button className="btn btn-primary btn-sm" disabled={searching} onClick={() => void search()}>
                  {searching ? <span className="spinner" /> : L.search}
                </button>
              </div>

              {target ? (
                <div className={`agent-target ${target.banned || target.isSelf ? 'bad' : ''}`}>
                  <Avatar user={target} size={44} />
                  <div className="agent-target-main">
                    <strong>{target.displayName}</strong>
                    <span className="tiny muted">#{target.username}</span>
                  </div>
                  {target.banned ? <span className="tiny agent-bad">{L.banned}</span> : null}
                  {target.isSelf ? <span className="tiny agent-bad">{L.self}</span> : null}
                </div>
              ) : null}

              <label className="field">
                <span className="tiny muted">{L.package}</span>
                <select
                  className="input"
                  value={packageId}
                  onChange={(event) => setPackageId(event.target.value)}
                >
                  {data.packages.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name} — {formatCoins(pack.amount)}{' '}
                      {pack.currency === 'gold' ? (lang === 'ar' ? 'ذهب' : 'gold') : lang === 'ar' ? 'كونز' : 'coins'}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="tiny muted">{L.amount}</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ''))}
                />
              </label>

              <div className="agent-quote">
                <div>
                  <span className="tiny muted">{L.cost}</span>
                  <strong className={cost > data.agent.coinsBalance ? 'agent-bad' : ''}>
                    {formatCoins(cost)}
                  </strong>
                </div>
                <div>
                  <span className="tiny muted">{L.commissionPreview}</span>
                  <strong className="agent-gold">{formatCoins(commission)}</strong>
                </div>
              </div>

              <button
                className="btn btn-primary btn-block"
                disabled={
                  busy || !target || target.banned || target.isSelf || quantity <= 0 || cost > data.agent.coinsBalance
                }
                onClick={() => void confirmRecharge()}
              >
                {busy ? L.confirming : L.confirm}
              </button>
              {cost > data.agent.coinsBalance ? <span className="tiny agent-bad">{L.insufficient}</span> : null}
            </section>

            <section className="agent-card">
              <h3 className="agent-card-title">
                <Icon name="bell" size={16} /> {L.requests}
                {data.stats.requests.pending > 0 ? (
                  <span className="agent-count">{data.stats.requests.pending}</span>
                ) : null}
              </h3>
              <div className="agent-tabs">
                {(['pending', 'completed', 'rejected', 'cancelled', 'all'] as const).map((key) => (
                  <button
                    key={key}
                    className={`agent-tab ${requestTab === key ? 'on' : ''}`}
                    onClick={() => setRequestTab(key)}
                  >
                    {L[key]}
                  </button>
                ))}
              </div>
              {requests.length === 0 ? (
                <span className="tiny muted">{L.empty}</span>
              ) : (
                <div className="agent-list">
                  {requests.map((request) => (
                    <div key={request.id} className="agent-request">
                      <Avatar user={request.user} size={38} />
                      <div className="agent-target-main">
                        <strong>{request.user.displayName}</strong>
                        <span className="tiny muted">
                          #{request.user.username} • {formatCoins(request.amount)}{' '}
                          {request.currency === 'gold' ? (lang === 'ar' ? 'ذهب' : 'gold') : lang === 'ar' ? 'كونز' : 'coins'} •{' '}
                          {formatCoins(request.costCoins)} {lang === 'ar' ? 'كونز' : 'coins'}
                        </span>
                        <span className="tiny muted">{formatTimeAgo(request.createdAt, lang)}</span>
                      </div>
                      {request.status === 'pending' ? (
                        <div className="agent-actions">
                          <button
                            className="btn btn-primary btn-xs"
                            disabled={busy}
                            onClick={() => void resolve(request.id, 'complete')}
                          >
                            {L.accept}
                          </button>
                          <button
                            className="btn btn-ghost btn-xs"
                            disabled={busy}
                            onClick={() => void resolve(request.id, 'reject')}
                          >
                            {L.reject}
                          </button>
                        </div>
                      ) : (
                        <span className={`agent-status ${request.status}`}>{L[request.status]}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="agent-card">
              <h3 className="agent-card-title">
                <Icon name="chart" size={16} /> {L.rechargesLog}
              </h3>
              {data.recharges.length === 0 ? (
                <span className="tiny muted">{L.empty}</span>
              ) : (
                <div className="agent-list">
                  {data.recharges.map((row) => (
                    <div key={row.id} className="agent-request">
                      <Avatar user={row.user} size={34} />
                      <div className="agent-target-main">
                        <strong>{row.user.displayName}</strong>
                        <span className="tiny muted">
                          {formatCoins(row.amount)}{' '}
                          {row.currency === 'gold' ? (lang === 'ar' ? 'ذهب' : 'gold') : lang === 'ar' ? 'كونز' : 'coins'} •{' '}
                          {formatTimeAgo(row.createdAt, lang)}
                        </span>
                      </div>
                      <div className="agent-amount">-{formatCoins(row.costCoins)}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="agent-card">
              <h3 className="agent-card-title">
                <Icon name="wallet" size={16} /> {L.statement}
              </h3>
              {data.ledger.length === 0 ? (
                <span className="tiny muted">{L.empty}</span>
              ) : (
                <div className="agent-list">
                  {data.ledger.map((row) => (
                    <div key={row.id} className="agent-row-between">
                      <div className="agent-target-main">
                        <strong>{row.kind}</strong>
                        <span className="tiny muted">{formatTimeAgo(row.createdAt, lang)}</span>
                      </div>
                      <div className="agent-ledger-value">
                        <span className={row.amount < 0 ? 'agent-bad' : 'agent-good'}>
                          {row.amount > 0 ? '+' : ''}
                          {formatCoins(row.amount)}
                        </span>
                        <span className="tiny muted">
                          {L.balanceAfter} {formatCoins(row.balanceAfter)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
