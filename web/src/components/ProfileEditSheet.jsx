import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ProfileSheet from './ProfileSheet.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

// تسميات عربية لمفاتيح تفضيلات الإشعارات القادمة من الخادم (لا تغيّر المفاتيح نفسها).
const PREF_LABELS = {
  follow: 'متابع جديد',
  friend_request: 'طلبات الصداقة',
  friend_accepted: 'قبول الصداقة',
  message: 'الرسائل الخاصة',
  room_invite: 'دعوات الغرف',
  gift: 'الهدايا',
  store_offer: 'عروض المتجر',
  account: 'الحساب',
  game: 'الألعاب',
}

const ADMIN_LINKS = [
  ['/dashboard', 'لوحة القيادة'],
  ['/data-management', 'إدارة البيانات'],
  ['/search', 'البحث'],
  ['/activity-log', 'سجل النشاط'],
  ['/system-status', 'حالة النظام'],
  ['/categories', 'التصنيفات'],
]

/** تعديل الملف + الخصوصية + تفضيلات الإشعارات (نفس مسارات الخادم السابقة). */
export default function ProfileEditSheet({ user, onSaved, onClose }) {
  const { lang, setLang, t } = useI18n()
  const { setUnread } = useAuth()
  const [tab, setTab] = useState('profile')
  const [profile, setProfile] = useState({ display_name: user.display_name || '', bio: user.bio || '' })
  const [privacy, setPrivacy] = useState(user.privacy || {})
  const [prefs, setPrefs] = useState({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/api/notifications/preferences')
      .then((data) => setPrefs(data.preferences))
      .catch((err) => setError(err.message))
  }, [])

  const saveProfile = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await api.patch('/api/users/me', { display_name: profile.display_name, bio: profile.bio, locale: lang })
      await onSaved()
      setMessage('تم حفظ الملف الشخصي')
    } catch (err) {
      setError(err.message)
    }
  }

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      await api.upload('/api/users/me/avatar', formData)
      await onSaved()
      setMessage('تم تحديث الصورة الشخصية')
    } catch (err) {
      setError(err.message)
    }
  }

  const savePrivacy = async (next) => {
    setPrivacy(next)
    try {
      await api.patch('/api/users/me/privacy', next)
    } catch (err) {
      setError(err.message)
    }
  }

  const savePrefs = async (key, value) => {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    try {
      await api.patch('/api/notifications/preferences', { prefs: { [key]: value } })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <ProfileSheet title={t('editProfile')} icon="user" onClose={onClose} testId="profile-edit-sheet">
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={`auth-tab${tab === 'profile' ? ' auth-tab-active' : ''}`}
          data-testid="profile-tab-profile"
          onClick={() => setTab('profile')}
        >
          {t('editProfile')}
        </button>
        <button
          type="button"
          className={`auth-tab${tab === 'privacy' ? ' auth-tab-active' : ''}`}
          data-testid="profile-tab-privacy"
          onClick={() => setTab('privacy')}
        >
          {t('privacy')}
        </button>
        <button
          type="button"
          className={`auth-tab${tab === 'notifications' ? ' auth-tab-active' : ''}`}
          data-testid="profile-tab-notifications"
          onClick={() => setTab('notifications')}
        >
          {t('notificationsPrefs')}
        </button>
      </div>

      {tab === 'profile' ? (
        <form className="stack" onSubmit={saveProfile}>
          <div className="field">
            <label htmlFor="displayName">{t('displayName')}</label>
            <input
              id="displayName"
              data-testid="profile-display-name"
              value={profile.display_name}
              onChange={(event) => setProfile({ ...profile, display_name: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="bio">{t('bio')}</label>
            <textarea
              id="bio"
              data-testid="profile-bio"
              rows="3"
              value={profile.bio}
              onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="language">{t('language')}</label>
            <select id="language" value={lang} onChange={(event) => setLang(event.target.value)}>
              <option value="ar">{t('arabic')}</option>
              <option value="en">{t('english')}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="avatar-upload">{t('avatar')}</label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              data-testid="avatar-input"
              onChange={uploadAvatar}
            />
          </div>
          <button type="submit" className="btn btn-primary" data-testid="profile-save">
            {t('save')}
          </button>
        </form>
      ) : null}

      {tab === 'privacy' ? (
        <div>
          {[
            ['show_online', 'إظهار حالة الاتصال'],
            ['allow_room_invites', 'السماح بالدعوات إلى الغرف'],
            ['allow_gifts', 'السماح باستقبال الهدايا'],
          ].map(([key, label]) => (
            <label className="row" key={key} style={{ gap: 8, padding: '6px 0' }}>
              <input
                type="checkbox"
                checked={privacy[key] !== false}
                onChange={(event) => savePrivacy({ ...privacy, [key]: event.target.checked })}
                style={{ width: 18 }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      ) : null}

      {tab === 'notifications' ? (
        <div>
          {Object.entries(prefs).map(([key, value]) => (
            <label className="row" key={key} style={{ gap: 8, padding: '6px 0' }}>
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(event) => savePrefs(key, event.target.checked)}
                style={{ width: 18 }}
              />
              <span>{PREF_LABELS[key] || key}</span>
            </label>
          ))}
          <button
            type="button"
            className="btn"
            style={{ marginTop: 8 }}
            onClick={() => api.post('/api/notifications/read-all').then(() => setUnread(0))}
          >
            تعليم كل الإشعارات كمقروءة
          </button>
        </div>
      ) : null}

      {user.is_admin ? (
        <div style={{ marginTop: 16 }}>
          <h4 className="section-title">صفحات الإدارة</h4>
          <div className="row wrap">
            {ADMIN_LINKS.map(([to, label]) => (
              <Link className="btn" key={to} to={to}>
                {label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {message ? <p className="success-text" data-testid="profile-message">{message}</p> : null}
      {error ? <p className="error-text" data-testid="profile-error">{error}</p> : null}
    </ProfileSheet>
  )
}
