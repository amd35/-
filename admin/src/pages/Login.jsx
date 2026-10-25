import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setToken } from '../api.js'

export default function Login({ onSignedIn }) {
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const data = await api.post('/api/auth/login', { identifier: identifier.trim(), password })
      setToken(data.token)
      // Rights are checked again by the server on every admin call.
      await api.get('/api/admin/me')
      await onSignedIn()
      navigate('/')
    } catch (err) {
      setToken('')
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="login-screen" onSubmit={submit}>
      <h1 style={{ fontSize: 20 }}>لوحة الإدارة</h1>
      <p className="muted">الدخول متاح لحسابات الإدارة فقط، والصلاحيات تُتحقق على الخادم.</p>
      <div className="field">
        <label htmlFor="identifier">البريد أو اسم المستخدم</label>
        <input id="identifier" data-testid="admin-identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="password">كلمة المرور</label>
        <input id="password" data-testid="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </div>
      {error ? <p className="error" data-testid="admin-login-error">{error}</p> : null}
      <button type="submit" className="btn btn-primary" data-testid="admin-login-submit" disabled={busy} style={{ width: '100%' }}>
        دخول
      </button>
    </form>
  )
}
