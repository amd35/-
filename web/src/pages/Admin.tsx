import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getAdminToken, setAdminToken } from '../lib/api';
import { Icon, useToast } from '../lib/ui';
import { adminError } from '../components/admin/shared';
import Overview from '../components/admin/Overview';
import UsersTab from '../components/admin/UsersTab';
import RanksTab from '../components/admin/RanksTab';
import LevelsVipTab from '../components/admin/LevelsVipTab';
import LevelGrantsTab from '../components/admin/LevelGrantsTab';
import CallsTab from '../components/admin/CallsTab';
import FreeCallsTab from '../components/admin/FreeCallsTab';
import PricingTab from '../components/admin/PricingTab';
import PackagesTab from '../components/admin/PackagesTab';
import GiftCodesTab from '../components/admin/GiftCodesTab';
import FramesTab from '../components/admin/FramesTab';
import AdminLookTab from '../components/admin/AdminLookTab';
import BackgroundsTab from '../components/admin/BackgroundsTab';
import AdsTab from '../components/admin/AdsTab';
import PremiumIdsTab from '../components/admin/PremiumIdsTab';
import GiftsTab from '../components/admin/GiftsTab';
import GiftAnnouncementsTab from '../components/admin/GiftAnnouncementsTab';
import OrdersTab from '../components/admin/OrdersTab';
import FinancialTab from '../components/admin/FinancialTab';
import FinanceTab from '../components/admin/FinanceTab';
import ReportsTab from '../components/admin/ReportsTab';
import BroadcastTab from '../components/admin/BroadcastTab';
import SecurityTab from '../components/admin/SecurityTab';
import RoomsTab from '../components/admin/RoomsTab';
import RoomCupTab from '../components/admin/RoomCupTab';
import RoomFramesTab from '../components/admin/RoomFramesTab';
import SupportTab from '../components/admin/SupportTab';
import AgentsTab from '../components/admin/AgentsTab';
import AiSecurityTab from '../components/admin/AiSecurityTab';

const TABS = [
  { id: 'overview', label: 'نظرة عامة', icon: 'chart' },
  { id: 'support', label: 'الدعم الفني', icon: 'shield' },
  { id: 'agents', label: 'إدارة الوكلاء', icon: 'users' },
  { id: 'users', label: 'المستخدمون', icon: 'users' },
  { id: 'ranks', label: 'إدارة الرتب والبوكسات', icon: 'star' },
  { id: 'appearance', label: 'مظهر الإدارة', icon: 'sparkle' },
  { id: 'backgrounds', label: 'إدارة خلفيات التطبيق', icon: 'image' },
  { id: 'ads', label: 'إدارة الإعلانات والأحداث', icon: 'play' },
  { id: 'levels-vip', label: 'المستويات و VIP', icon: 'sparkle' },
  { id: 'level-grants', label: 'إدارة مستويات المستخدمين', icon: 'star' },
  { id: 'calls', label: 'المكالمات', icon: 'phone' },
  { id: 'free', label: 'المحاولات المجانية', icon: 'gift' },
  { id: 'pricing', label: 'الأسعار والأرباح', icon: 'percent' },
  { id: 'packages', label: 'باقات الشحن', icon: 'package' },
  { id: 'gifts', label: 'أكواد الهدايا', icon: 'gift' },
  { id: 'frames', label: 'إطارات الصور الشخصية', icon: 'sparkle' },
  { id: 'premium-ids', label: 'أرقام ID المميزة', icon: 'card' },
  { id: 'gift-store', label: 'متجر الهدايا المتحركة', icon: 'gift' },
  { id: 'gift-announcements', label: 'إعلانات الهدايا', icon: 'sparkle' },
  { id: 'rooms', label: 'غرف الدردشة والمايكات', icon: 'mic' },
  { id: 'room-cup', label: 'إدارة كأس الغرف والأرباح', icon: 'star' },
  { id: 'room-frames', label: 'إدارة الإطارات', icon: 'frame' },
  { id: 'orders', label: 'طلبات الشحن', icon: 'card' },
  { id: 'finance', label: 'العملات والسحب', icon: 'coins' },
  { id: 'financial', label: 'الأرباح والسحوبات', icon: 'coins' },
  { id: 'reports', label: 'البلاغات', icon: 'alert' },
  { id: 'broadcast', label: 'إشعار عام', icon: 'bell' },
  { id: 'ai-security', label: 'الحماية الذكية AI', icon: 'shield' },
  { id: 'security', label: 'الأمان', icon: 'lock' },
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
      setError(adminError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-login" dir="rtl">
      <form className="auth-card" style={{ width: '100%', maxWidth: 400 }} onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 6 }}>
          <div className="brand-mark">
            <Icon name="shield" size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: 20 }}>لوحة تحكم يلا فون</h2>
            <span className="tiny muted">لوحة الإدارة</span>
          </div>
        </div>
        <div className="field">
          <label>اسم المستخدم</label>
          <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} dir="ltr" />
        </div>
        <div className="field">
          <label>كلمة المرور</label>
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
          {busy ? <span className="spinner" /> : 'تسجيل الدخول'}
        </button>
        <button type="button" className="btn btn-ghost btn-block btn-sm" onClick={() => navigate('/')}>
          العودة للتطبيق
        </button>
      </form>
    </div>
  );
}

export default function Admin() {
  const [token, setTokenState] = useState<string | null>(getAdminToken());
  const [tab, setTab] = useState<TabId>('overview');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const endSession = () => setTokenState(null);
    window.addEventListener('connect:admin-session-ended', endSession);
    return () => window.removeEventListener('connect:admin-session-ended', endSession);
  }, []);

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
    <div className="admin-shell" dir="rtl">
      <aside className="admin-sidebar">
        <div className="brand" style={{ padding: '4px 8px 14px' }}>
          <div className="brand-mark">
            <Icon name="shield" size={19} />
          </div>
          <div>
            <div style={{ fontWeight: 700 }}>يلا فون</div>
            <div className="tiny muted">لوحة التحكم</div>
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
            تحديث البيانات
          </button>
          <button
            className="admin-nav-item"
            onClick={() => {
              setAdminToken(null);
              setTokenState(null);
            }}
          >
            <Icon name="logout" size={17} />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      <main className="admin-main" key={`${tab}-${nonce}`}>
        <div className="admin-head">
          <h1>{TABS.find((item) => item.id === tab)?.label}</h1>
          <div className="spacer" />
          <span className="pill">
            <Icon name="clock" size={13} /> بتوقيت بغداد
          </span>
          <a className="btn btn-ghost btn-sm" href="/">
            <Icon name="home" size={15} /> التطبيق
          </a>
        </div>

        {tab === 'overview' ? <Overview /> : null}
        {tab === 'support' ? <SupportTab /> : null}
        {tab === 'agents' ? <AgentsTab /> : null}
        {tab === 'users' ? <UsersTab /> : null}
        {tab === 'ranks' ? <RanksTab /> : null}
        {tab === 'appearance' ? <AdminLookTab /> : null}
        {tab === 'backgrounds' ? <BackgroundsTab /> : null}
        {tab === 'ads' ? <AdsTab /> : null}
        {tab === 'levels-vip' ? <LevelsVipTab /> : null}
        {tab === 'level-grants' ? <LevelGrantsTab /> : null}
        {tab === 'calls' ? <CallsTab /> : null}
        {tab === 'free' ? <FreeCallsTab /> : null}
        {tab === 'pricing' ? <PricingTab /> : null}
        {tab === 'packages' ? <PackagesTab /> : null}
        {tab === 'gifts' ? <GiftCodesTab /> : null}
        {tab === 'frames' ? <FramesTab /> : null}
        {tab === 'premium-ids' ? <PremiumIdsTab /> : null}
        {tab === 'gift-store' ? <GiftsTab /> : null}
        {tab === 'gift-announcements' ? <GiftAnnouncementsTab /> : null}
        {tab === 'rooms' ? <RoomsTab /> : null}
        {tab === 'room-cup' ? <RoomCupTab /> : null}
        {tab === 'room-frames' ? <RoomFramesTab /> : null}
        {tab === 'orders' ? <OrdersTab /> : null}
        {tab === 'finance' ? <FinanceTab /> : null}
        {tab === 'financial' ? <FinancialTab /> : null}
        {tab === 'reports' ? <ReportsTab /> : null}
        {tab === 'broadcast' ? <BroadcastTab /> : null}
        {tab === 'ai-security' ? <AiSecurityTab /> : null}
        {tab === 'security' ? <SecurityTab /> : null}
      </main>
    </div>
  );
}
