import { useState } from 'react'
import { api } from '../api.js'

const EMPTY = { current: '', next: '', confirm: '' }

export default function PasswordPanel() {
  const [form, setForm] = useState(EMPTY)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value })

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (form.next !== form.confirm) {
      setError('كلمتا المرور الجديدتان غير متطابقتين')
      return
    }
    setBusy(true)
    try {
      await api.post('/api/auth/password/change', {
        current_password: form.current,
        new_password: form.next,
      })
      setForm(EMPTY)
      setMessage('تم تغيير كلمة المرور، استخدمها في الدخول القادم')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel" onSubmit={submit} data-testid="admin-password-form">
      <h2>كلمة مرور حسابي</h2>
      <p className="muted">
        التغيير هنا يسري فوراً ويبقى بعد إعادة تشغيل الخادم. إن نسيت كلمة المرور، غيّر إعداد
        ADMIN_PASSWORD في لوحة المنصة وسيُعتمد عند إعادة التشغيل.
      </p>
      {message ? <p className="success" data-testid="admin-password-message">{message}</p> : null}
      {error ? <p className="error" data-testid="admin-password-error">{error}</p> : null}
      <div className="grid">
        <div className="field">
          <label htmlFor="admin-current-password">كلمة المرور الحالية</label>
          <input
            id="admin-current-password"
            type="password"
            value={form.current}
            onChange={update('current')}
            required
            data-testid="admin-current-password"
          />
        </div>
        <div className="field">
          <label htmlFor="admin-new-password">كلمة المرور الجديدة</label>
          <input
            id="admin-new-password"
            type="password"
            value={form.next}
            onChange={update('next')}
            required
            minLength={6}
            data-testid="admin-new-password"
          />
        </div>
        <div className="field">
          <label htmlFor="admin-confirm-password">تأكيد كلمة المرور الجديدة</label>
          <input
            id="admin-confirm-password"
            type="password"
            value={form.confirm}
            onChange={update('confirm')}
            required
            minLength={6}
            data-testid="admin-confirm-password"
          />
        </div>
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy} data-testid="admin-password-submit">
        تغيير كلمة المرور
      </button>
    </form>
  )
}
