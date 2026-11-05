import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import BrandEmblem from './BrandEmblem.jsx'
import PhotoIcon from './PhotoIcon.jsx'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'
import { api } from '../lib/api.js'

function NotificationsDrawer({ onClose }) {
  const { notifications, setNotifications, unread, setUnread } = useAuth()
  const { t } = useI18n()

  const markAll = async () => {
    await api.post('/api/notifications/read-all')
    setNotifications((previous) => previous.map((item) => ({ ...item, read: true })))
    setUnread(0)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="glass sheet" onClick={(event) => event.stopPropagation()}>
        <div className="row-between">
          <h3 className="section-title" style={{ margin: 0 }}>
            {t('notifications')} {unread ? `(${unread})` : ''}
          </h3>
          <div className="row">
            <button type="button" className="btn" onClick={markAll}>
              {t('save')}
            </button>
            <button type="button" className="btn" onClick={onClose}>
              {t('cancel')}
            </button>
          </div>
        </div>
        <div className="stack" style={{ marginTop: 12 }}>
          {notifications.length === 0 ? <p className="muted">—</p> : null}
          {notifications.map((item) => (
            <div className="list-item" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <div className="muted">{item.body}</div>
              </div>
              {!item.read ? <span className="status-pill status-pending">●</span> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Layout() {
  const { user, wallet, unread } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [showNotifications, setShowNotifications] = useState(false)

  // The "+" on each balance opens the recharge page with every real pack (no fake flow).
  const openRecharge = () => navigate('/recharge')

  const tabs = [
    { to: '/', icon: 'house', label: t('home') },
    { to: '/store', icon: 'bag', label: t('store') },
    { to: '/games', icon: 'dice', label: t('games') },
    { to: '/rooms', icon: 'mic', label: t('navRooms') },
    { to: '/friends', icon: 'friends', label: t('navFriends'), badge: unread },
  ]

  return (
    <>
      <div className="app-shell">
        <header className="topbar glass">
          <Link className="brand" to="/">
            <span className="brand-mark">
              <BrandEmblem size="100%" />
            </span>
            <span>{t('appName')}</span>
          </Link>
          {/* الأرصدة الحقيقية في كتلة واحدة؛ المتجر في شريط التنقل واللغة في الإعدادات. */}
          <div className="wallet-cluster">
            <button type="button" className="currency-pill currency-diamonds" data-testid="balance-diamonds" onClick={openRecharge} title={t('recharge')}>
              <span className="currency-icon">
                <PhotoIcon name="gem" size={15} />
              </span>
              <span className="currency-value">{wallet.diamonds}</span>
              <span className="currency-plus">+</span>
            </button>
            <button type="button" className="currency-pill currency-gold" data-testid="balance-gold" onClick={openRecharge} title={t('recharge')}>
              <span className="currency-icon">
                <PhotoIcon name="gold" size={15} />
              </span>
              <span className="currency-value">{wallet.gold}</span>
              <span className="currency-plus">+</span>
            </button>
          </div>
          <button
            type="button"
            className="icon-button"
            data-testid="notifications-button"
            onClick={() => setShowNotifications(true)}
            aria-label={t('notifications')}
          >
            <PhotoIcon name="bell" size={20} />
            {unread ? <span className="dot">{unread}</span> : null}
          </button>
          <Link className="profile-chip" to="/profile" data-testid="profile-button" aria-label={t('profile')}>
            <Avatar user={user} size={32} />
          </Link>
        </header>

        <Outlet />
      </div>

      <nav className="tabs" aria-label="main">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}
            data-testid={`tab-${tab.to === '/' ? 'home' : tab.to.slice(1)}`}
          >
            <span>
              <PhotoIcon name={tab.icon} size={22} />
            </span>
            <span>{tab.label}</span>
            {tab.badge ? <span className="tab-badge">{tab.badge}</span> : null}
          </NavLink>
        ))}
      </nav>

      {showNotifications ? <NotificationsDrawer onClose={() => setShowNotifications(false)} /> : null}
    </>
  )
}
