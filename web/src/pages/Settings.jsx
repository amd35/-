import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import PageBar from '../components/PageBar.jsx'
import PhotoIcon from '../components/PhotoIcon.jsx'
import { api } from '../lib/api.js'
import { useRemote } from '../lib/hooks.js'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'
import { NOTIF_LABELS, usePageText } from '../lib/pageText.js'

/** Personal preferences, account information and a hub for every app page. */
export default function Settings() {
  const { user, logout } = useAuth()
  const { t, lang, setLang } = useI18n()
  const s = usePageText()
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState({})
  const [alwaysOn, setAlwaysOn] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const { data, error: loadError, loading, reload } = useRemote(() => api.get('/api/notifications/preferences'))

  useEffect(() => {
    if (!data) return
    setPrefs(data.preferences || {})
    setAlwaysOn(data.always_on || [])
  }, [data])

  const savePref = async (key, value) => {
    setError('')
    setPrefs((previous) => ({ ...previous, [key]: value }))
    try {
      const result = await api.patch('/api/notifications/preferences', { prefs: { [key]: value } })
      setPrefs(result.preferences)
      setMessage(s.savedPrefs)
    } catch (err) {
      setError(err.message)
      reload()
    }
  }

  const labels = NOTIF_LABELS[lang] || NOTIF_LABELS.ar
  const groups = [
    {
      key: 'app',
      title: s.pagesSection,
      items: [
        ['/', t('home'), 'house'],
        ['/store', t('store'), 'bag'],
        ['/games', t('games'), 'dice'],
        ['/rooms', t('navRooms'), 'mic'],
        ['/friends', t('navFriends'), 'friends'],
        ['/profile', t('profile'), 'crown'],
        ['/recharge', t('recharge'), 'coin'],
      ],
    },
    {
      key: 'manage',
      title: s.dashboard,
      items: [
        ['/dashboard', s.dashboard, 'trophy'],
        ['/data-management', s.dataManagement, 'wallet'],
        ['/search', t('search'), 'star'],
        ['/categories', s.categories, 'palette'],
        ['/notifications', t('notifications'), 'bell'],
        ['/system-status', s.systemStatus, 'dotOn'],
      ],
    },
    {
      key: 'support',
      title: s.help,
      items: [
        ['/help', s.help, 'megaphone'],
        ['/contact', s.contact, 'hand'],
      ],
    },
  ]
  if (user.is_admin) {
    groups[1].items.push(['/activity-log', s.activityLog, 'lock'])
  }

  return (
    <div data-testid="settings-page">
      <PageBar title={s.settings} back="/" testId="settings" />

      <p className="muted" style={{ margin: '0 2px 12px' }}>
        {s.settingsSub}
      </p>

      {error || loadError ? <p className="error-text">{error || loadError}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}

      <div className="card glass">
        <div className="row">
          <Avatar user={user} size={56} />
          <div style={{ minWidth: 0 }}>
            <strong>{user.display_name || user.username}</strong>
            <div className="muted">@{user.username}</div>
          </div>
        </div>
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="row-between">
            <span className="muted">{s.email}</span>
            <span>{user.email || '—'}</span>
          </div>
          <div className="row-between">
            <span className="muted">{s.accountStatus}</span>
            <span className="status-pill">{user.status}</span>
          </div>
          <div className="row-between">
            <span className="muted">{s.memberSince}</span>
            <span>{user.created_at ? new Date(user.created_at).toLocaleDateString('en') : '—'}</span>
          </div>
          <div className="row-between">
            <span className="muted">{s.level}</span>
            <span>
              {user.level} · {user.xp_into_level}/{user.next_level_xp}
            </span>
          </div>
          <div className="row-between">
            <span className="muted">{s.royalLevel}</span>
            <span className="badge-pill">{user.royal_name || `${t('royal')} ${user.royal_level}`}</span>
          </div>
          <div className="row-between">
            <span className="muted">{s.royalPointsLabel}</span>
            <span>{user.royal_points}</span>
          </div>
        </div>
        <Link className="btn" style={{ marginTop: 12 }} to="/profile">
          {s.editProfileLink}
        </Link>
      </div>

      <div className="card glass">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          {s.languageSection}
        </h3>
        <div className="field">
          <select value={lang} aria-label={s.languageSection} data-testid="settings-language" onChange={(event) => setLang(event.target.value)}>
            <option value="ar">{t('arabic')}</option>
            <option value="en">{t('english')}</option>
          </select>
        </div>
      </div>

      <div className="card glass">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          {s.notifSection}
        </h3>
        {loading && !data ? <p className="muted">{s.loading}</p> : null}
        {Object.entries(prefs).map(([key, value]) => (
          <label className="row" key={key} style={{ gap: 8, padding: '6px 0' }}>
            <input
              type="checkbox"
              checked={Boolean(value)}
              style={{ width: 18 }}
              data-testid={`pref-${key}`}
              onChange={(event) => savePref(key, event.target.checked)}
            />
            <span>{labels[key] || key}</span>
          </label>
        ))}
        {alwaysOn.map((key) => (
          <div className="row-between" key={key} style={{ padding: '6px 0' }}>
            <span className="muted">{s.notifAlwaysOn}</span>
            <span className="status-pill status-paid">{labels[key] || key}</span>
          </div>
        ))}
      </div>

      {groups.map((group) => (
        <div className="card glass" key={group.key}>
          <h3 className="section-title" style={{ marginTop: 0 }}>
            {group.title}
          </h3>
          {group.items.map(([to, label, icon]) => (
            <Link className="list-item" key={to} to={to} data-testid={`settings-link-${to}`}>
              <PhotoIcon name={icon} size={26} />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      ))}

      <div className="card glass">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          {s.sessionSection}
        </h3>
        <button
          type="button"
          className="btn btn-danger"
          data-testid="settings-logout"
          onClick={async () => {
            await logout()
            navigate('/login')
          }}
        >
          {s.logout}
        </button>
      </div>
    </div>
  )
}
