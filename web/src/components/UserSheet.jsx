import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import PhotoIcon from './PhotoIcon.jsx'
import ProfileSheet from './ProfileSheet.jsx'
import { api } from '../lib/api.js'
import { useI18n } from '../lib/i18n.jsx'
import { countryName, flagUrl } from '../lib/flags.js'

/**
 * بطاقة عضو حقيقي، تُفتح من صور الأعضاء في الصفحة الرئيسية.
 * البيانات من `GET /api/users/{id}` (المستوى، رويال، المتابعون، الأصدقاء)،
 * والمتابعة/إلغاء المتابعة من `/api/follows/{id}` — لا شيء منها وهمي.
 */
export default function UserSheet({ userId, onClose }) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setProfile(await api.get(`/api/users/${userId}`))
    } catch (err) {
      setError(err.message)
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  const toggleFollow = async () => {
    if (!profile || busy) return
    setBusy(true)
    setError('')
    try {
      if (profile.following) await api.del(`/api/follows/${profile.id}`)
      else await api.post(`/api/follows/${profile.id}`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const stats = profile?.stats || {}
  const flag = profile ? flagUrl(profile.country) : ''

  return (
    <ProfileSheet title={t('memberCard')} icon="user" onClose={onClose} testId="user-sheet">
      {!profile && !error ? <p className="muted">{t('loading')}</p> : null}
      {profile ? (
        <>
          <div className="user-card">
            <Avatar user={profile} size={72} />
            <div className="user-card-text">
              <strong className="user-card-name">{profile.display_name || profile.username}</strong>
              <span className="user-card-id">@{profile.username}</span>
              <span className="user-card-meta">
                {flag ? <img className="user-card-flag" src={flag} alt={countryName(profile.country, lang)} /> : null}
                {countryName(profile.country, lang) ? `${countryName(profile.country, lang)} · ` : ''}
                {`${t('level')} ${profile.level}`}
                {profile.royal_name ? ` · ${profile.royal_name}` : ''}
              </span>
            </div>
          </div>
          <div className="user-card-stats">
            <div className="user-card-stat">
              <strong>{stats.followers ?? 0}</strong>
              <span>{t('followers')}</span>
            </div>
            <div className="user-card-stat">
              <strong>{stats.following ?? 0}</strong>
              <span>{t('following')}</span>
            </div>
            <div className="user-card-stat">
              <strong>{stats.friends ?? 0}</strong>
              <span>{t('friends')}</span>
            </div>
          </div>
          <div className="user-card-actions">
            <button
              type="button"
              className={profile.following ? 'btn' : 'btn btn-accent'}
              onClick={toggleFollow}
              disabled={busy}
              data-testid="user-sheet-follow"
            >
              {profile.following ? t('unfollow') : t('follow')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/friends')}
              data-testid="user-sheet-message"
            >
              {t('sendMessage')}
            </button>
            <span className="user-card-level">
              <PhotoIcon name="trophy" size={16} />
              {`${t('xp')} ${profile.xp}`}
            </span>
          </div>
        </>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}
    </ProfileSheet>
  )
}
