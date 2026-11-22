import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getAdminToken, setAdminToken } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { Icon, useToast } from '../lib/ui';
import Overview from '../components/admin/Overview';
import UsersTab from '../components/admin/UsersTab';
import CallsTab from '../components/admin/CallsTab';
import FreeCallsTab from '../components/admin/FreeCallsTab';
import PricingTab from '../components/admin/PricingTab';
import PackagesTab from '../components/admin/PackagesTab';
import OrdersTab from '../components/admin/OrdersTab';
import FinancialTab from '../components/admin/FinancialTab';
import ReportsTab from '../components/admin/ReportsTab';
import BroadcastTab from '../components/admin/BroadcastTab';

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'chart' },
  { id: 'users', label: 'Users', icon: 'users' },
  { id: 'calls', label: 'Calls', icon: 'phone' },
  { id: 'free', label: 'Free attempts', icon: 'gift' },
  { id: 'pricing', label: 'Pricing & split', icon: 'percent' },
  { id: 'packages', label: 'Packages', icon: 'package' },
  { id: 'orders', label: 'Recharge orders', icon: 'card' },
  { id: 'financial', label: 'Earnings & withdrawals', icon: 'coins' },
  { id: 'reports', label: 'Reports', icon: 'alert' },
  { id: 'broadcast', label: 'Broadcast', icon: 'bell' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function AdminLogin({ onDone }: { onDone: (token: string) => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ token: string }>('/admin/login', {
        method: 'POST',
        body: { username, password },
      });
      onDone(response.token);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-login">
      <form className="auth-card" style={{ width: '100%', maxWidth: 400 }} onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 6 }}>
          <div className="brand-mark">
            <Icon name="shield" size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: 20 }}>Connect+ Admin</h2>
            <span className="tiny muted">Control panel</span>
          </div>
        </div>
        <div className="field">
          <label>Username</label>
          <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} dir="ltr" />
        </div>
        <div className="field">
          <label>Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            dir="ltr"
            autoFocus
          />
        </div>
        {error ? <div className="error-text">{error}</div> : null}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <span className="spinner" /> : 'Sign in'}
        </button>
        <button type="button" className="btn btn-ghost btn-block btn-sm" onClick={() => navigate('/')}>
          Back to app
        </button>
      </form>
    </div>
  );
}

export default function Admin() {
  const [token, setTokenState] = useState<string | null>(getAdminToken());
  const [tab, setTab] = useState<TabId>('overview');
  const [nonce, setNonce] = useState(0);
  const { t } = useI18n();

  if (!token) {
    return (
      <AdminLogin
        onDone={(next) => {
          setAdminToken(next);
          setTokenState(next);
        }}
      />
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand" style={{ padding: '4px 8px 14px' }}>
          <div className="brand-mark">
            <Icon name="shield" size={19} />
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>Connect+</div>
            <div className="tiny muted">Admin panel</div>
          </div>
        </div>
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`admin-nav-item ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            <Icon name={item.icon} size={17} />
            {item.label}
          </button>
        ))}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button className="admin-nav-item" onClick={() => setNonce((value) => value + 1)}>
            <Icon name="refresh" size={17} />
            Refresh data
          </button>
          <button
            className="admin-nav-item"
            onClick={() => {
              setAdminToken(null);
              setTokenState(null);
            }}
          >
            <Icon name="logout" size={17} />
            {t('logout')}
          </button>
        </div>
      </aside>

      <main className="admin-main" key={`${tab}-${nonce}`}>
        <div className="admin-head">
          <h1>{TABS.find((item) => item.id === tab)?.label}</h1>
          <div className="spacer" />
          <span className="pill">
            <Icon name="clock" size={13} /> Baghdad time
          </span>
          <a className="btn btn-ghost btn-sm" href="/">
            <Icon name="home" size={15} /> App
          </a>
        </div>

        {tab === 'overview' ? <Overview /> : null}
        {tab === 'users' ? <UsersTab /> : null}
        {tab === 'calls' ? <CallsTab /> : null}
        {tab === 'free' ? <FreeCallsTab /> : null}
        {tab === 'pricing' ? <PricingTab /> : null}
        {tab === 'packages' ? <PackagesTab /> : null}
        {tab === 'orders' ? <OrdersTab /> : null}
        {tab === 'financial' ? <FinancialTab /> : null}
        {tab === 'reports' ? <ReportsTab /> : null}
        {tab === 'broadcast' ? <BroadcastTab /> : null}
      </main>
    </div>
  );
}
