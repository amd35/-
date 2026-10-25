import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import PasswordPanel from '../components/PasswordPanel.jsx'

const NUMERIC = [
  'exchange_rate_usd_iqd',
  'gift_receiver_share_percent',
  'room_gift_receiver_share_percent',
  'withdrawal_min_coins',
  'withdrawal_fee_percent',
  'vip_price_coins',
  'vip_days',
  'welcome_bonus_coins',
  'vip_price_usd_cents',
]

const BOOLEAN = ['withdrawal_enabled', 'maintenance']
const JSON_KEYS = ['ads', 'offers', 'games_enabled', 'vip_benefits', 'supported_currencies']
const TEXT = ['currency_default', 'app_name']

export default function SettingsAdmin() {
  const [settings, setSettings] = useState({})
  const [draft, setDraft] = useState({})
  const [broadcast, setBroadcast] = useState({ title: '', body: '', segment: 'all' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/admin/settings')
      setSettings(data.settings)
      setDraft(data.settings)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async (event) => {
    event.preventDefault()
    setError('')
    const payload = {}
    for (const key of NUMERIC) payload[key] = Number(draft[key])
    for (const key of BOOLEAN) payload[key] = Boolean(draft[key])
    for (const key of TEXT) payload[key] = draft[key]
    for (const key of JSON_KEYS) {
      try {
        payload[key] = typeof draft[key] === 'string' ? JSON.parse(draft[key]) : draft[key]
      } catch {
        setError(`القيمة في ${key} ليست JSON صحيحاً`)
        return
      }
    }
    try {
      const data = await api.patch('/api/admin/settings', { settings: payload })
      setSettings(data.settings)
      setDraft(data.settings)
      setMessage('تم حفظ الإعدادات')
    } catch (err) {
      setError(err.message)
    }
  }

  const sendBroadcast = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const result = await api.post('/api/admin/broadcast', broadcast)
      setMessage(`تم إرسال الإشعار إلى ${result.sent} مستخدم`)
      setBroadcast({ title: '', body: '', segment: 'all' })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1>الإعدادات</h1>
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error" data-testid="admin-settings-error">{error}</p> : null}

      <PasswordPanel />

      <form className="panel" onSubmit={save} data-testid="admin-settings-form">
        <h2>العملات والأسعار</h2>
        <div className="grid">
          {NUMERIC.map((key) => (
            <div className="field" key={key}>
              <label>{key}</label>
              <input
                type="number"
                value={draft[key] ?? 0}
                onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
              />
            </div>
          ))}
          {TEXT.map((key) => (
            <div className="field" key={key}>
              <label>{key}</label>
              <input value={draft[key] ?? ''} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} />
            </div>
          ))}
        </div>

        <h2>مفاتيح التشغيل</h2>
        <div className="row">
          {BOOLEAN.map((key) => (
            <label className="row" key={key} style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={Boolean(draft[key])}
                onChange={(event) => setDraft({ ...draft, [key]: event.target.checked })}
                style={{ width: 18 }}
                data-testid={`setting-${key}`}
              />
              <span>{key}</span>
            </label>
          ))}
        </div>

        <h2>قوائم JSON (الإعلانات، العروض، الألعاب)</h2>
        {JSON_KEYS.map((key) => (
          <div className="field" key={key}>
            <label>{key}</label>
            <textarea
              rows="4"
              value={typeof draft[key] === 'string' ? draft[key] : JSON.stringify(draft[key] ?? [], null, 2)}
              onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
            />
          </div>
        ))}

        <button type="submit" className="btn btn-primary" data-testid="admin-settings-save">
          حفظ الإعدادات
        </button>
      </form>

      <form className="panel" onSubmit={sendBroadcast}>
        <h2>إعلان داخلي / إشعار جماعي</h2>
        <div className="grid">
          <div className="field">
            <label>العنوان</label>
            <input value={broadcast.title} onChange={(event) => setBroadcast({ ...broadcast, title: event.target.value })} required />
          </div>
          <div className="field">
            <label>النص</label>
            <input value={broadcast.body} onChange={(event) => setBroadcast({ ...broadcast, body: event.target.value })} />
          </div>
          <div className="field">
            <label>الفئة</label>
            <select value={broadcast.segment} onChange={(event) => setBroadcast({ ...broadcast, segment: event.target.value })}>
              <option value="all">الجميع</option>
              <option value="online">المتصلون الآن</option>
              <option value="vip">أعضاء VIP</option>
              <option value="admins">الإدارة</option>
            </select>
          </div>
        </div>
        <button type="submit" className="btn btn-gold" data-testid="admin-broadcast-send">
          إرسال
        </button>
      </form>

      <div className="panel">
        <h2>الإعدادات الحالية</h2>
        <pre className="muted" style={{ maxHeight: 260, overflow: 'auto', direction: 'ltr' }}>
          {JSON.stringify(settings, null, 2)}
        </pre>
      </div>
    </div>
  )
}
