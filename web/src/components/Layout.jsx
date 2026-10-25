import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import Avatar from './Avatar.jsx'
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
  const { user, wallet, unread, logout } = useAuth()
  const { t, lang, setLang } = useI18n()
  const navigate = useNavigate()
  const [showNotifications, setShowNotifications] = useState(false)

  const tabs = [
    { to: '/', icon: '🏠', label: t('home') },
    { to: '/games', icon: '🎲', label: t('games') },
    { to: '/rooms', icon: '🎙️', label: t('rooms') },
    { to: '/friends', icon: '👥', label: t('friends') },
  ]

  return (
    <>
      <div className="app-shell">
        <header className="glass topbar">
          <Link className="brand" to="/">
            <span className="brand-mark">T</span>
            <span>{t('appName')}</span>
          </Link>
          <div className="topbar-spacer" />
          <span className="chip chip-coins" data-testid="balance-coins">
            🪙 {wallet.coins}
          </span>
          <span className="chip chip-gold" data-testid="balance-gold">
            🏆 {wallet.gold}
          </span>
          <button
            type="button"
            className="icon-button"
            data-testid="notifications-button"
            onClick={() => setShowNotifications(true)}
            aria-label={t('notifications')}
          >
            🔔
            {unread ? <span className="dot">{unread}</span> : null}
          </button>
          <button
            type="button"
            className="icon-button"
            data-testid="language-button"
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            aria-label={t('language')}
          >
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
          <Link to="/profile" aria-label={t('profile')}>
            <Avatar user={user} size={36} />
          </Link>
        </header>

        <Outlet />

        <button
          type="button"
          className="btn"
          style={{ marginTop: 18 }}
          onClick={async () => {
            await logout()
            navigate('/login')
          }}
        >
          {t('logout')}
        </button>
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
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      {showNotifications ? <NotificationsDrawer onClose={() => setShowNotifications(false)} /> : null}
    </>
  )
}
