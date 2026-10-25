import { useState } from 'react'
import { Link } from 'react-router-dom'
import PageBar from '../components/PageBar.jsx'
import PhotoIcon from '../components/PhotoIcon.jsx'
import { api } from '../lib/api.js'
import { useRemote } from '../lib/hooks.js'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'
import { usePageText } from '../lib/pageText.js'

/** Full notification list with per-item and bulk read actions. */
export default function Notifications() {
  const { setNotifications, setUnread } = useAuth()
  const { t } = useI18n()
  const s = usePageText()
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [error, setError] = useState('')

  const { data, error: loadError, loading, reload } = useRemote(
    () => api.get(`/api/notifications?limit=100${onlyUnread ? '&unread_only=true' : ''}`),
    [onlyUnread],
  )

  const markRead = async (item) => {
    setError('')
    try {
      await api.post(`/api/notifications/${item.id}/read`)
      setNotifications((previous) => previous.map((row) => (row.id === item.id ? { ...row, read: true } : row)))
      setUnread((count) => Math.max(0, count - 1))
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const markAll = async () => {
    setError('')
    try {
      await api.post('/api/notifications/read-all')
      setNotifications((previous) => previous.map((row) => ({ ...row, read: true })))
      setUnread(0)
      await reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const items = data?.notifications || []

  return (
    <div data-testid="notifications-page">
      <PageBar title={s.notificationsTitle} back="/dashboard" testId="notifications">
        <span className="chip chip-coins" data-testid="notifications-unread">
          <PhotoIcon name="bell" size={15} /> {data ? data.unread : '—'}
        </span>
      </PageBar>

      <p className="muted" style={{ margin: '0 2px 12px' }}>
        {s.notificationsSub}
      </p>

      <div className="row-between" style={{ marginBottom: 10 }}>
        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            style={{ width: 18 }}
            checked={onlyUnread}
            data-testid="notifications-unread-only"
            onChange={(event) => setOnlyUnread(event.target.checked)}
          />
          <span>{s.unreadOnly}</span>
        </label>
        <button type="button" className="btn btn-small" onClick={markAll} data-testid="notifications-mark-all">
          {s.markAll}
        </button>
      </div>

      {error || loadError ? <p className="error-text">{error || loadError}</p> : null}
      {loading && !data ? <p className="muted">{s.loading}</p> : null}

      <div className="card glass">
        {data && items.length === 0 ? <p className="muted">{s.noNotif}</p> : null}
        {items.map((item) => (
          <div className="list-item" key={item.id} data-testid="notification-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{item.title}</strong>
              <div className="muted">{item.body}</div>
              <div className="muted">
                {item.type} · {new Date(item.created_at).toLocaleString('en')}
              </div>
            </div>
            {item.read ? (
              <span className="status-pill status-paid">✓</span>
            ) : (
              <button
                type="button"
                className="btn btn-small"
                data-testid={`notification-read-${item.id}`}
                onClick={() => markRead(item)}
              >
                {s.markRead}
              </button>
            )}
          </div>
        ))}
      </div>

      <Link className="btn" style={{ marginTop: 14 }} to="/settings">
        {t('notificationsPrefs') || s.prefsLink}
      </Link>
    </div>
  )
}
