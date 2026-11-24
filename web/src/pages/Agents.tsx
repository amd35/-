import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Avatar, formatCoins, formatTimeAgo, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { AppShell } from '../components/AppShell';

/**
 * «وكلاء الشحن الرسميون» — only the agencies the general admin approved are listed.
 * A customer can message an agent, or send a recharge request the agent confirms.
 */

interface AgentItem {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  available: boolean;
  since: string;
}

interface PackageItem {
  id: string;
  name: string;
  currency: 'coins' | 'gold';
  amount: number;
  costCoins: number;
}

interface MyRequest {
  id: string;
  currency: 'coins' | 'gold';
  amount: number;
  costCoins: number;
  status: 'pending' | 'completed' | 'rejected' | 'cancelled';
  agentNote: string | null;
  createdAt: string;
  agent: { id: string; username: string; displayName: string; avatarUrl: string | null };
}

const TEXT = {
  ar: {
    title: 'وكلاء الشحن الرسميون',
    intro: 'حسابات معتمدة رسمياً من الإدارة لشحن الكونز والذهب. تواصل مع الوكيل أو أرسل طلب شحن ليتم تنفيذه بعد التأكد.',
    available: 'متاح الآن',
    away: 'غير متاح',
    badge: 'وكيل رسمي',
    contact: 'تواصل',
    request: 'طلب شحن',
    empty: 'لا يوجد وكلاء رسميون حالياً',
    myRequests: 'طلباتي',
    package: 'الباقة',
    amount: 'الكمية',
    note: 'ملاحظة (اختياري)',
    send: 'إرسال الطلب',
    sent: 'تم إرسال الطلب للوكيل',
    cost: 'القيمة',
    pending: 'قيد المراجعة',
    completed: 'مكتمل',
    rejected: 'مرفوض',
    cancelled: 'ملغى',
    noRequests: 'لا توجد طلبات',
    cancel: 'إلغاء الطلب',
    id: 'ID',
  },
  en: {
    title: 'Official recharge agents',
    intro: 'Accounts approved by the administration to recharge coins and gold. Message an agent or send a request to be fulfilled.',
    available: 'Available',
    away: 'Unavailable',
    badge: 'Official agent',
    contact: 'Message',
    request: 'Recharge request',
    empty: 'No official agents yet',
    myRequests: 'My requests',
    package: 'Package',
    amount: 'Amount',
    note: 'Note (optional)',
    send: 'Send request',
    sent: 'Request sent to the agent',
    cost: 'Cost',
    pending: 'Pending',
    completed: 'Completed',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
    noRequests: 'No requests yet',
    cancel: 'Cancel request',
    id: 'ID',
  },
} as const;

export default function Agents() {
  const { lang } = useI18n();
  const { me } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const L = TEXT[lang === 'ar' ? 'ar' : 'en'];

  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<AgentItem | null>(null);
  const [packageId, setPackageId] = useState('');
  const [amount, setAmount] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, mine] = await Promise.all([
        api<{ agents: AgentItem[]; packages: PackageItem[] }>('/agents'),
        api<{ requests: MyRequest[] }>('/agents/me/requests').catch(() => ({ requests: [] })),
      ]);
      setAgents(list.agents);
      setPackages(list.packages);
      setRequests(mine.requests);
      setPackageId((current) => current || list.packages[0]?.id || '');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedPackage = useMemo(
    () => packages.find((pack) => pack.id === packageId) ?? null,
    [packages, packageId]
  );
  const quantity = Math.max(0, Math.trunc(Number(amount) || 0));
  const cost = selectedPackage
    ? Math.max(1, Math.ceil((selectedPackage.costCoins * quantity) / selectedPackage.amount))
    : 0;

  const openChat = async (agentId: string) => {
    try {
      const response = await api<{ conversationId: string }>('/chat/conversations', {
        method: 'POST',
        body: { userId: agentId },
      });
      navigate(`/chats/${response.conversationId}`);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const sendRequest = async () => {
    if (!active || !selectedPackage || quantity <= 0) return;
    setBusy(true);
    try {
      await api(`/agents/${active.id}/requests`, {
        method: 'POST',
        body: { packageId: selectedPackage.id, amount: quantity, note: note || undefined },
      });
      toast.push(L.sent, 'success');
      setActive(null);
      setNote('');
      setAmount('1');
      await load();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancelRequest = async (id: string) => {
    try {
      await api(`/agents/requests/${id}/cancel`, { method: 'POST', body: {} });
      await load();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <AppShell title={L.title} active="profile">
      <div className="page page-tight agent-page">
        <section className="agent-card">
          <p className="tiny muted" style={{ lineHeight: 1.7 }}>
            {L.intro}
          </p>
        </section>

        {loading ? (
          <Spinner label={L.title} />
        ) : agents.length === 0 ? (
          <div className="card center stack">
            <Icon name="shield" size={26} />
            <span className="tiny muted">{L.empty}</span>
          </div>
        ) : (
          <div className="agent-list">
            {agents.map((agent) => (
              <div key={agent.id} className="agent-card agent-agency">
                <Avatar user={agent} size={52} />
                <div className="agent-target-main">
                  <div className="agent-hero-name">{agent.displayName}</div>
                  <span className="agent-badge">
                    <Icon name="shield" size={11} /> {L.badge}
                  </span>
                  <span className="tiny muted">
                    #{agent.username} • {agent.available ? L.available : L.away}
                  </span>
                </div>
                <div className="agent-agency-actions">
                  <button className="btn btn-ghost btn-xs" onClick={() => void openChat(agent.id)}>
                    <Icon name="chat" size={14} /> {L.contact}
                  </button>
                  <button
                    className="btn btn-primary btn-xs"
                    disabled={agent.id === me?.user.id}
                    onClick={() => setActive(agent)}
                  >
                    {L.request}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <section className="agent-card">
          <h3 className="agent-card-title">
            <Icon name="clock" size={16} /> {L.myRequests}
          </h3>
          {requests.length === 0 ? (
            <span className="tiny muted">{L.noRequests}</span>
          ) : (
            <div className="agent-list">
              {requests.map((request) => (
                <div key={request.id} className="agent-request">
                  <Avatar user={request.agent} size={36} />
                  <div className="agent-target-main">
                    <strong>{request.agent.displayName}</strong>
                    <span className="tiny muted">
                      {formatCoins(request.amount)}{' '}
                      {request.currency === 'gold' ? (lang === 'ar' ? 'ذهب' : 'gold') : lang === 'ar' ? 'كونز' : 'coins'} •{' '}
                      {L.cost} {formatCoins(request.costCoins)} • {formatTimeAgo(request.createdAt, lang)}
                    </span>
                    {request.agentNote ? <span className="tiny muted">{request.agentNote}</span> : null}
                  </div>
                  {request.status === 'pending' ? (
                    <button className="btn btn-ghost btn-xs" onClick={() => void cancelRequest(request.id)}>
                      {L.cancel}
                    </button>
                  ) : (
                    <span className={`agent-status ${request.status}`}>{L[request.status]}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Sheet open={Boolean(active)} onClose={() => setActive(null)} title={L.request}>
        <div className="stack">
          {active ? (
            <div className="agent-target">
              <Avatar user={active} size={44} />
              <div className="agent-target-main">
                <strong>{active.displayName}</strong>
                <span className="tiny muted">#{active.username}</span>
              </div>
            </div>
          ) : null}
          <label className="field">
            <span className="tiny muted">{L.package}</span>
            <select className="input" value={packageId} onChange={(event) => setPackageId(event.target.value)}>
              {packages.map((pack) => (
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
          <label className="field">
            <span className="tiny muted">{L.note}</span>
            <input className="input" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="agent-quote">
            <span className="tiny muted">{L.cost}</span>
            <strong>{formatCoins(cost)}</strong>
          </div>
          <button
            className="btn btn-primary btn-block"
            disabled={busy || quantity <= 0 || !selectedPackage}
            onClick={() => void sendRequest()}
          >
            {busy ? <span className="spinner" /> : L.send}
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}
