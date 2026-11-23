import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, formatTimeAgo, Icon, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Stat, Table, useAdminData } from './shared';

/**
 * إدارة الوكلاء — the general admin panel is the only place that can create,
 * suspend, revoke or fund an agency. Nothing here is available to agents.
 */

interface AgentRow {
  id: string;
  status: 'active' | 'suspended' | 'revoked';
  commissionPercent: number;
  coinsBalance: number;
  goldBalance: number;
  totalSales: number;
  recharges: number;
  customers: number;
  pendingRequests: number;
  totalCommission: number;
  paidCommission: number;
  dueCommission: number;
  note: string | null;
  createdAt: string;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null; banned: boolean };
}

interface PackageRow {
  id: string;
  name: string;
  currency: 'coins' | 'gold';
  amount: number;
  costCoins: number;
  isActive: boolean;
  sortOrder: number;
}

interface Overview {
  totals: { agents: number; active: number; suspended: number; coins: number; gold: number; due: number; paid: number };
  agents: AgentRow[];
  packages: PackageRow[];
}

interface Detail {
  agent: AgentRow;
  user: { id: string; username: string; display_name: string; avatar_url: string | null; is_banned: boolean } | null;
  recharges: {
    id: string;
    amount: number;
    currency: string;
    costCoins: number;
    commissionCoins: number;
    createdAt: string;
    user: { displayName: string; username: string };
  }[];
  requests: {
    id: string;
    amount: number;
    currency: string;
    costCoins: number;
    status: string;
    createdAt: string;
    user: { displayName: string; username: string };
  }[];
  ledger: {
    id: string;
    kind: string;
    currency: string;
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
  agentStatus: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'نشط',
  suspended: 'موقوف',
  revoked: 'مسحوب',
};

const KIND_LABEL: Record<string, string> = {
  credit: 'إضافة رصيد',
  debit: 'خصم رصيد',
  recharge: 'شحن',
  commission: 'عمولة',
  payout: 'تسوية أرباح',
};

export default function AgentsTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<Overview>('/admin/agents/overview');
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<FoundUser[]>([]);
  const [commission, setCommission] = useState('10');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailTab, setDetailTab] = useState<'recharges' | 'requests' | 'ledger'>('recharges');

  const [balance, setBalance] = useState({ direction: 'credit', currency: 'coins', amount: '', note: '' });
  const [payout, setPayout] = useState({ amount: '', note: '' });
  const [message, setMessage] = useState({ title: '', body: '' });
  const [percentDraft, setPercentDraft] = useState('');
  const [packDraft, setPackDraft] = useState({
    name: '',
    currency: 'coins',
    amount: '1000',
    costCoins: '1000',
  });

  const loadDetail = useCallback(async (id: string) => {
    try {
      const response = await api<Detail>(`/admin/agents/${id}`, { admin: true });
      setDetail(response);
      setPercentDraft(String(response.agent.commissionPercent));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  }, [toast]);

  useEffect(() => {
    if (selected) void loadDetail(selected);
  }, [selected, loadDetail]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.push(success, 'success');
      await reload();
      if (selected) await loadDetail(selected);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const searchUsers = async () => {
    const value = search.trim();
    if (!value) return;
    try {
      const response = await api<{ users: FoundUser[] }>(
        `/admin/agents/search?q=${encodeURIComponent(value)}`,
        { admin: true }
      );
      setFound(response.users);
      if (response.users.length === 0) toast.push('لا يوجد مستخدم بهذا المعرف', 'error');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const assign = (user: FoundUser) =>
    run(
      () =>
        api('/admin/agents', {
          method: 'POST',
          admin: true,
          body: { userId: user.id, commissionPercent: Number(commission) || 0 },
        }),
      `تم تعيين ${user.displayName} وكيل شحن`
    );

  const agents = data?.agents ?? [];
  const totals = data?.totals;

  return (
    <div className="stack">
      <div className="grid stats">
        <Stat label="الوكلاء" value={formatCoins(totals?.agents ?? 0)} hint={`${totals?.active ?? 0} نشط`} />
        <Stat label="رصيد الكونز لدى الوكلاء" value={formatCoins(totals?.coins ?? 0)} accent="#ffd75e" />
        <Stat label="رصيد الذهب" value={formatCoins(totals?.gold ?? 0)} accent="#ffb347" />
        <Stat label="أرباح مستحقة" value={formatCoins(totals?.due ?? 0)} accent="#ff6178" />
        <Stat label="أرباح مدفوعة" value={formatCoins(totals?.paid ?? 0)} />
      </div>

      <AdminCard title="إضافة وكيل جديد" subtitle="البحث برقم ID أو بالاسم — التعيين من صلاحية الأدمن العام فقط">
        <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ maxWidth: 220 }}
            placeholder="ID المستخدم أو الاسم"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void searchUsers();
            }}
          />
          <Field label="نسبة العمولة %">
            <input
              className="input"
              style={{ width: 100 }}
              inputMode="numeric"
              value={commission}
              onChange={(event) => setCommission(event.target.value.replace(/[^\d.]/g, ''))}
              dir="ltr"
            />
          </Field>
          <button className="btn btn-primary btn-sm" onClick={() => void searchUsers()}>
            <Icon name="search" size={15} /> بحث
          </button>
        </div>
        {found.length > 0 ? (
          <div className="list" style={{ marginTop: 10 }}>
            {found.map((user) => (
              <div key={user.id} className="row static">
                <div className="row-main">
                  <div className="row-title">{user.displayName}</div>
                  <div className="row-sub">
                    #{user.username}
                    {user.agentStatus ? ` • وكيل ${STATUS_LABEL[user.agentStatus] ?? user.agentStatus}` : ''}
                    {user.banned ? ' • محظور' : ''}
                  </div>
                </div>
                <button className="btn btn-primary btn-xs" onClick={() => void assign(user)}>
                  {user.agentStatus ? 'إعادة تفعيل' : 'تعيين وكيل'}
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </AdminCard>

      <AdminCard
        title="الوكلاء"
        subtitle="الرصيد والأرباح تُحسب على الخادم — كل حركة مالية مسجلة في سجل تدقيق"
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => void reload()}>
            <Icon name="refresh" size={15} /> تحديث
          </button>
        }
      >
        {loading ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : agents.length === 0 ? (
          <Empty text="لا يوجد وكلاء بعد" />
        ) : (
          <Table
            head={['الوكيل', 'الحالة', 'العمولة', 'الكونز', 'الذهب', 'المبيعات', 'عمليات', 'طلبات', 'أرباح مستحقة', 'إجراءات']}
          >
            {agents.map((agent) => (
              <tr key={agent.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{agent.user.displayName}</div>
                  <div className="tiny muted">#{agent.user.username}</div>
                </td>
                <td>
                  <span className={`pill ${agent.status === 'active' ? '' : 'muted'}`}>
                    {STATUS_LABEL[agent.status] ?? agent.status}
                  </span>
                </td>
                <td dir="ltr">{agent.commissionPercent}%</td>
                <td dir="ltr">{formatCoins(agent.coinsBalance)}</td>
                <td dir="ltr">{formatCoins(agent.goldBalance)}</td>
                <td dir="ltr">{formatCoins(agent.totalSales)}</td>
                <td dir="ltr">{formatCoins(agent.recharges)}</td>
                <td dir="ltr">{agent.pendingRequests > 0 ? `⚠ ${agent.pendingRequests}` : '0'}</td>
                <td dir="ltr" style={{ color: '#ffd75e' }}>
                  {formatCoins(agent.dueCommission)}
                </td>
                <td>
                  <div className="inline" style={{ gap: 4, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => setSelected(selected === agent.id ? null : agent.id)}
                    >
                      {selected === agent.id ? 'إغلاق' : 'إدارة'}
                    </button>
                    {agent.status === 'active' ? (
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() =>
                          void run(
                            () =>
                              api(`/admin/agents/${agent.id}/status`, {
                                method: 'POST',
                                admin: true,
                                body: { status: 'suspended' },
                              }),
                            'تم إيقاف الوكيل مؤقتاً'
                          )
                        }
                      >
                        إيقاف
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() =>
                          void run(
                            () =>
                              api(`/admin/agents/${agent.id}/status`, {
                                method: 'POST',
                                admin: true,
                                body: { status: 'active' },
                              }),
                            'تم تفعيل الوكيل'
                          )
                        }
                      >
                        تفعيل
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() =>
                        void run(
                          () => api(`/admin/agents/${agent.id}`, { method: 'DELETE', admin: true }),
                          'تم سحب الوكالة'
                        )
                      }
                    >
                      سحب
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>

      {selected && detail ? (
        <AdminCard
          title={`إدارة ${detail.user?.display_name ?? detail.agent.user.displayName}`}
          subtitle={`#${detail.user?.username ?? detail.agent.user.username} • رصيد ${formatCoins(detail.agent.coinsBalance)} كونز و ${formatCoins(detail.agent.goldBalance)} ذهب`}
        >
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            <div className="card" style={{ gap: 8, display: 'grid' }}>
              <Field label="نسبة العمولة %">
                <div className="inline" style={{ gap: 6 }}>
                  <input
                    className="input"
                    value={percentDraft}
                    onChange={(event) => setPercentDraft(event.target.value.replace(/[^\d.]/g, ''))}
                    dir="ltr"
                  />
                  <button
                    className="btn btn-primary btn-xs"
                    onClick={() =>
                      void run(
                        () =>
                          api(`/admin/agents/${detail.agent.id}`, {
                            method: 'PATCH',
                            admin: true,
                            body: { commissionPercent: Number(percentDraft) || 0 },
                          }),
                        'تم تحديث العمولة'
                      )
                    }
                  >
                    حفظ
                  </button>
                </div>
              </Field>
            </div>

            <div className="card" style={{ gap: 8, display: 'grid' }}>
              <Field label="إضافة / سحب رصيد">
                <div className="inline" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <select
                    className="input"
                    style={{ width: 100 }}
                    value={balance.direction}
                    onChange={(event) => setBalance({ ...balance, direction: event.target.value })}
                  >
                    <option value="credit">إضافة</option>
                    <option value="debit">خصم</option>
                  </select>
                  <select
                    className="input"
                    style={{ width: 90 }}
                    value={balance.currency}
                    onChange={(event) => setBalance({ ...balance, currency: event.target.value })}
                  >
                    <option value="coins">كونز</option>
                    <option value="gold">ذهب</option>
                  </select>
                  <input
                    className="input"
                    style={{ width: 100 }}
                    inputMode="numeric"
                    placeholder="المبلغ"
                    value={balance.amount}
                    onChange={(event) => setBalance({ ...balance, amount: event.target.value.replace(/[^\d]/g, '') })}
                    dir="ltr"
                  />
                </div>
              </Field>
              <button
                className="btn btn-primary btn-sm"
                disabled={!balance.amount}
                onClick={() =>
                  void run(async () => {
                    await api(`/admin/agents/${detail.agent.id}/balance`, {
                      method: 'POST',
                      admin: true,
                      body: {
                        direction: balance.direction,
                        currency: balance.currency,
                        amount: Number(balance.amount),
                        note: balance.note || undefined,
                      },
                    });
                    setBalance({ ...balance, amount: '' });
                  }, 'تم تحديث رصيد الوكيل')
                }
              >
                تنفيذ حركة الرصيد
              </button>
            </div>

            <div className="card" style={{ gap: 8, display: 'grid' }}>
              <Field label={`تسوية أرباح (مستحق ${formatCoins(detail.agent.dueCommission)})`}>
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="المبلغ"
                  value={payout.amount}
                  onChange={(event) => setPayout({ ...payout, amount: event.target.value.replace(/[^\d]/g, '') })}
                  dir="ltr"
                />
              </Field>
              <button
                className="btn btn-primary btn-sm"
                disabled={!payout.amount}
                onClick={() =>
                  void run(async () => {
                    await api(`/admin/agents/${detail.agent.id}/payout`, {
                      method: 'POST',
                      admin: true,
                      body: { amount: Number(payout.amount), note: payout.note || undefined },
                    });
                    setPayout({ amount: '', note: '' });
                  }, 'تم تسجيل صرف الأرباح')
                }
              >
                صرف الأرباح
              </button>
            </div>

            <div className="card" style={{ gap: 8, display: 'grid' }}>
              <Field label="إشعار خاص للوكيل">
                <input
                  className="input"
                  placeholder="العنوان"
                  value={message.title}
                  onChange={(event) => setMessage({ ...message, title: event.target.value })}
                />
              </Field>
              <input
                className="input"
                placeholder="النص"
                value={message.body}
                onChange={(event) => setMessage({ ...message, body: event.target.value })}
              />
              <button
                className="btn btn-ghost btn-sm"
                disabled={!message.title}
                onClick={() =>
                  void run(async () => {
                    await api(`/admin/agents/${detail.agent.id}/notify`, {
                      method: 'POST',
                      admin: true,
                      body: message,
                    });
                    setMessage({ title: '', body: '' });
                  }, 'تم إرسال الإشعار')
                }
              >
                إرسال
              </button>
            </div>
          </div>

          <div className="inline" style={{ gap: 6, marginTop: 8 }}>
            {(['recharges', 'requests', 'ledger'] as const).map((key) => (
              <button
                key={key}
                className={`btn btn-xs ${detailTab === key ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setDetailTab(key)}
              >
                {key === 'recharges' ? 'سجل الشحنات' : key === 'requests' ? 'طلبات العملاء' : 'كشف الحساب'}
              </button>
            ))}
          </div>

          {detailTab === 'recharges' ? (
            detail.recharges.length === 0 ? (
              <Empty text="لا توجد عمليات" />
            ) : (
              <Table head={['العميل', 'الكمية', 'القيمة', 'العمولة', 'التاريخ']}>
                {detail.recharges.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.user.displayName} <span className="tiny muted">#{row.user.username}</span>
                    </td>
                    <td dir="ltr">
                      {formatCoins(row.amount)} {row.currency === 'gold' ? 'ذهب' : 'كونز'}
                    </td>
                    <td dir="ltr">{formatCoins(row.costCoins)}</td>
                    <td dir="ltr">{formatCoins(row.commissionCoins)}</td>
                    <td className="tiny">{formatTimeAgo(row.createdAt, 'ar')}</td>
                  </tr>
                ))}
              </Table>
            )
          ) : null}

          {detailTab === 'requests' ? (
            detail.requests.length === 0 ? (
              <Empty text="لا توجد طلبات" />
            ) : (
              <Table head={['العميل', 'الكمية', 'القيمة', 'الحالة', 'التاريخ']}>
                {detail.requests.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.user.displayName} <span className="tiny muted">#{row.user.username}</span>
                    </td>
                    <td dir="ltr">
                      {formatCoins(row.amount)} {row.currency === 'gold' ? 'ذهب' : 'كونز'}
                    </td>
                    <td dir="ltr">{formatCoins(row.costCoins)}</td>
                    <td>
                      {row.status === 'pending'
                        ? 'قيد المراجعة'
                        : row.status === 'completed'
                          ? 'مكتمل'
                          : row.status === 'rejected'
                            ? 'مرفوض'
                            : 'ملغى'}
                    </td>
                    <td className="tiny">{formatTimeAgo(row.createdAt, 'ar')}</td>
                  </tr>
                ))}
              </Table>
            )
          ) : null}

          {detailTab === 'ledger' ? (
            detail.ledger.length === 0 ? (
              <Empty text="لا توجد حركات" />
            ) : (
              <Table head={['النوع', 'العملة', 'المبلغ', 'الرصيد بعدها', 'ملاحظة', 'التاريخ']}>
                {detail.ledger.map((row) => (
                  <tr key={row.id}>
                    <td>{KIND_LABEL[row.kind] ?? row.kind}</td>
                    <td>{row.currency === 'gold' ? 'ذهب' : 'كونز'}</td>
                    <td dir="ltr" style={{ color: row.amount < 0 ? '#ff8a9a' : '#7ee0a1' }}>
                      {row.amount > 0 ? '+' : ''}
                      {formatCoins(row.amount)}
                    </td>
                    <td dir="ltr">{formatCoins(row.balanceAfter)}</td>
                    <td className="tiny">{row.note ?? '—'}</td>
                    <td className="tiny">{formatTimeAgo(row.createdAt, 'ar')}</td>
                  </tr>
                ))}
              </Table>
            )
          ) : null}
        </AdminCard>
      ) : null}

      <AdminCard title="باقات الشحن للوكلاء" subtitle="سعر الباقة بالكونز يُخصم من رصيد الوكيل عند التنفيذ">
        <div className="inline" style={{ gap: 6, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ maxWidth: 150 }}
            placeholder="اسم الباقة"
            value={packDraft.name}
            onChange={(event) => setPackDraft({ ...packDraft, name: event.target.value })}
          />
          <select
            className="input"
            style={{ width: 100 }}
            value={packDraft.currency}
            onChange={(event) => setPackDraft({ ...packDraft, currency: event.target.value })}
          >
            <option value="coins">كونز</option>
            <option value="gold">ذهب</option>
          </select>
          <input
            className="input"
            style={{ width: 110 }}
            inputMode="numeric"
            placeholder="الكمية"
            value={packDraft.amount}
            onChange={(event) => setPackDraft({ ...packDraft, amount: event.target.value.replace(/[^\d]/g, '') })}
            dir="ltr"
          />
          <input
            className="input"
            style={{ width: 130 }}
            inputMode="numeric"
            placeholder="التكلفة بالكونز"
            value={packDraft.costCoins}
            onChange={(event) => setPackDraft({ ...packDraft, costCoins: event.target.value.replace(/[^\d]/g, '') })}
            dir="ltr"
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={!packDraft.name || !packDraft.amount}
            onClick={() =>
              void run(async () => {
                await api('/admin/agent-packages', {
                  method: 'POST',
                  admin: true,
                  body: {
                    name: packDraft.name,
                    currency: packDraft.currency,
                    amount: Number(packDraft.amount),
                    costCoins: Number(packDraft.costCoins),
                  },
                });
                setPackDraft({ ...packDraft, name: '' });
              }, 'تمت إضافة الباقة')
            }
          >
            إضافة باقة
          </button>
        </div>
        {(data?.packages.length ?? 0) === 0 ? (
          <Empty text="لا توجد باقات — أضف باقة ليتمكن الوكلاء من الشحن" />
        ) : (
          <Table head={['الباقة', 'العملة', 'الكمية', 'التكلفة', 'الحالة', 'إجراء']}>
            {data?.packages.map((pack) => (
              <tr key={pack.id}>
                <td>{pack.name}</td>
                <td>{pack.currency === 'gold' ? 'ذهب' : 'كونز'}</td>
                <td dir="ltr">{formatCoins(pack.amount)}</td>
                <td dir="ltr">{formatCoins(pack.costCoins)}</td>
                <td>{pack.isActive ? 'مفعّلة' : 'موقوفة'}</td>
                <td>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() =>
                      void run(
                        () =>
                          api(`/admin/agent-packages/${pack.id}`, {
                            method: 'PUT',
                            admin: true,
                            body: {
                              name: pack.name,
                              currency: pack.currency,
                              amount: pack.amount,
                              costCoins: pack.costCoins,
                              isActive: !pack.isActive,
                              sortOrder: pack.sortOrder,
                            },
                          }),
                        pack.isActive ? 'تم إيقاف الباقة' : 'تم تفعيل الباقة'
                      )
                    }
                  >
                    {pack.isActive ? 'إيقاف' : 'تفعيل'}
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>
    </div>
  );
}
