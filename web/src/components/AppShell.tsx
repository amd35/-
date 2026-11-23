import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { formatCoinsCompact, Icon } from '../lib/ui';

const NAV = [
  { key: 'home', path: '/', icon: 'home' },
  { key: 'chats', path: '/chats', icon: 'chat' },
  { key: 'calls', path: '/calls', icon: 'phone' },
  { key: 'profile', path: '/profile', icon: 'user' },
] as const;

export function BottomNav({ active }: { active: string }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { me } = useAuth();
  const unread = me?.unreadMessages ?? 0;

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {NAV.map((item) => (
          <button
            key={item.key}
            className={`nav-item ${active === item.key ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <Icon name={item.icon} size={21} />
            <span>{t(item.key)}</span>
            {item.key === 'chats' && unread > 0 ? (
              <span
                className="badge-dot"
                style={{ insetBlockStart: 2, insetInlineEnd: '50%', marginInlineEnd: -22 }}
              >
                {unread > 9 ? '9+' : unread}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function AppShell({
  title,
  subtitle,
  right,
  children,
  active,
  bare,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  active: string;
  /** Skip the app top bar: the page draws its own header (royal profile). */
  bare?: boolean;
}) {
  return (
    <div className="app-shell">
      {bare ? null : (
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="heart" size={19} fill="currentColor" />
          </div>
          <div>
            <h1>{title}</h1>
            {subtitle ? <div className="sub">{subtitle}</div> : null}
          </div>
        </div>
        <div className="spacer" />
        {right}
      </header>
      )}
      {children}
      <BottomNav active={active} />
    </div>
  );
}

export function CoinPill({ balance }: { balance: number }) {
  const navigate = useNavigate();
  return (
    <button className="pill pill-gold coin-chip" onClick={() => navigate('/wallet')} style={{ border: 'none' }}>
      <Icon name="coins" size={15} />
      <span>{formatCoinsCompact(balance)}</span>
      <span className="coin-plus" aria-hidden="true">
        <Icon name="plus" size={11} />
      </span>
    </button>
  );
}

export function BellButton() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const unread = me?.unreadNotifications ?? 0;
  return (
    <button className="icon-btn" onClick={() => navigate('/notifications')} aria-label="notifications">
      <Icon name="bell" size={19} />
      {unread > 0 ? <span className="badge-dot">{unread > 9 ? '9+' : unread}</span> : null}
    </button>
  );
}
