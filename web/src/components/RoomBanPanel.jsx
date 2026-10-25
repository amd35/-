import { useCallback, useEffect, useState } from 'react'
import Avatar from './Avatar.jsx'
import PhotoIcon from './PhotoIcon.jsx'
import { api } from '../lib/api.js'
import { useI18n } from '../lib/i18n.jsx'

function formatMoment(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' })
}

function formatRemaining(expiresAt) {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (Number.isNaN(diff) || diff <= 0) return 'انتهى'
  const minutes = Math.round(diff / 60000)
  if (minutes < 60) return `باقٍ ${minutes} دقيقة`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `باقٍ ${hours} ساعة`
  const days = Math.round(hours / 24)
  return `باقٍ ${days} يوم`
}

/** قائمة المحظورين: الاسم، السبب، بداية الحظر ونهايته، مع إلغاء الحظر للمالك. */
export default function RoomBanPanel({ room, onUnban, canUnban }) {
  const { t } = useI18n()
  const [bans, setBans] = useState([])
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const roomId = room?.id

  const load = useCallback(async () => {
    if (!roomId) return
    try {
      const data = await api.get(`/api/rooms/${roomId}/bans`)
      setBans(data.bans)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoaded(true)
    }
  }, [roomId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="card glass" data-testid="room-ban-panel">
      <h3 className="section-title room-section-title" style={{ marginTop: 0 }}>
        <PhotoIcon name="lock" size={16} /> {t('banList')} ({bans.length})
      </h3>
      {error ? <p className="error-text">{error}</p> : null}
      {loaded && bans.length === 0 ? <p className="muted">{t('noBans')}</p> : null}
      <div className="ban-list">
        {bans.map((ban) => (
          <div className="ban-row" key={`${ban.user_id}-${ban.created_at}`} data-testid={`ban-row-${ban.user_id}`}>
            <Avatar user={ban.user || { username: `#${ban.user_id}`, display_name: `#${ban.user_id}` }} size={38} />
            <div className="ban-info">
              <strong>{ban.user?.display_name || ban.user?.username || `#${ban.user_id}`}</strong>
              <span className="muted">
                {ban.duration_label}
                {ban.reason ? ` · ${t('banReason')}: ${ban.reason}` : ''}
              </span>
              <span className="muted">
                {t('bannedFrom')}: {formatMoment(ban.created_at)} · {t('bannedUntil')}: {formatMoment(ban.expires_at)} (
                {formatRemaining(ban.expires_at)})
              </span>
              {ban.banned_by ? (
                <span className="muted">
                  بواسطة: {ban.banned_by.display_name || ban.banned_by.username}
                </span>
              ) : null}
            </div>
            {canUnban ? (
              <button
                type="button"
                className="btn btn-small"
                data-testid={`unban-${ban.user_id}`}
                onClick={async () => {
                  await onUnban(ban.user_id)
                  load()
                }}
              >
                {t('unban')}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
