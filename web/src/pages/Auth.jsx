import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BrandEmblem from '../components/BrandEmblem.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

export default function Auth() {
  const { login, register } = useAuth()
  const { t, lang, setLang } = useI18n()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ identifier: '', username: '', displayName: '', email: '', phone: '', password: '' })
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const update = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    try {
      if (mode === 'login') {
        await login(form.identifier.trim(), form.password)
      } else {
        await register({
          username: form.username.trim(),
          display_name: (form.displayName || form.username).trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          password: form.password,
        })
      }
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const requestReset = async () => {
    if (!form.identifier.trim()) {
      setError('أدخل البريد أو اسم المستخدم أولاً')
      return
    }
    try {
      await api.post('/api/auth/password/reset-request', { identifier: form.identifier.trim() })
      setInfo('تم إنشاء رمز الاستعادة. يوصل الرمز بالبريد عند إعداد مزود البريد، وإلا يسجّله الخادم لدى الإدارة.')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="glass auth-screen">
      <div className="row-between">
        <div className="brand">
          <span className="brand-mark">
            <BrandEmblem size="100%" />
          </span>
          <strong>{t('appName')}</strong>
        </div>
        <button type="button" className="icon-button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>
      </div>

      <div className="auth-tabs" style={{ marginTop: 16 }}>
        <button
          type="button"
          className={`auth-tab${mode === 'login' ? ' auth-tab-active' : ''}`}
          data-testid="auth-tab-login"
          onClick={() => setMode('login')}
        >
          {t('login')}
        </button>
        <button
          type="button"
          className={`auth-tab${mode === 'register' ? ' auth-tab-active' : ''}`}
          data-testid="auth-tab-register"
          onClick={() => setMode('register')}
        >
          {t('register')}
        </button>
      </div>

      <form className="stack" onSubmit={submit}>
        {mode === 'login' ? (
          <>
            <div className="field">
              <label htmlFor="identifier">{t('username')} / {t('email')}</label>
              <input id="identifier" data-testid="login-identifier" value={form.identifier} onChange={update('identifier')} autoComplete="username" />
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="username">{t('username')}</label>
              <input id="username" data-testid="register-username" value={form.username} onChange={update('username')} />
            </div>
            <div className="field">
              <label htmlFor="displayName">{t('displayName')}</label>
              <input id="displayName" data-testid="register-display-name" value={form.displayName} onChange={update('displayName')} />
            </div>
            <div className="field">
              <label htmlFor="email">{t('email')}</label>
              <input id="email" data-testid="register-email" type="email" value={form.email} onChange={update('email')} />
            </div>
            <div className="field">
              <label htmlFor="phone">{t('phone')}</label>
              <input id="phone" data-testid="register-phone" value={form.phone} onChange={update('phone')} />
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="password">{t('password')}</label>
          <input
            id="password"
            data-testid="auth-password"
            type="password"
            value={form.password}
            onChange={update('password')}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>

        {error ? <p className="error-text" data-testid="auth-error">{error}</p> : null}
        {info ? <p className="success-text">{info}</p> : null}

        <button type="submit" className="btn btn-primary btn-block" data-testid="auth-submit" disabled={busy}>
          {mode === 'login' ? t('login') : t('register')}
        </button>

        {mode === 'login' ? (
          <button type="button" className="btn btn-block" onClick={requestReset}>
            {t('resetPassword')}
          </button>
        ) : null}
      </form>
    </div>
  )
}
