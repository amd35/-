import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import PhotoIcon from '../components/PhotoIcon.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

export default function Profile() {
  const { user, wallet, refresh, setWallet, setUnread } = useAuth()
  const { t, lang, setLang } = useI18n()
  const [profile, setProfile] = useState({ display_name: '', bio: '' })
  const [ledger, setLedger] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [walletInfo, setWalletInfo] = useState(null)
  const [prefs, setPrefs] = useState({})
  const [privacy, setPrivacy] = useState({})
  const [transfer, setTransfer] = useState({ to_username: '', currency: 'coins', amount: 100 })
  const [withdraw, setWithdraw] = useState({ currency: 'coins', amount: 50000, method: 'zaincash', phone: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [walletData, ledgerData, prefsData, withdrawalData] = await Promise.all([
        api.get('/api/wallet'),
        api.get('/api/wallet/ledger?limit=25'),
        api.get('/api/notifications/preferences'),
        api.get('/api/wallet/withdrawals'),
      ])
      setWalletInfo(walletData)
      setWallet(walletData.wallet)
      setLedger(ledgerData.entries)
      setPrefs(prefsData.preferences)
      setWithdrawals(withdrawalData.requests)
    } catch (err) {
      setError(err.message)
    }
  }, [setWallet])

  useEffect(() => {
    setProfile({ display_name: user.display_name || '', bio: user.bio || '' })
    setPrivacy(user.privacy || {})
    load()
  }, [user, load])

  const saveProfile = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await api.patch('/api/users/me', { display_name: profile.display_name, bio: profile.bio, locale: lang })
      await refresh()
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
      await refresh()
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

  const doTransfer = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const result = await api.post('/api/wallet/transfer', {
        to_username: transfer.to_username.trim(),
        currency: transfer.currency,
        amount: Number(transfer.amount),
        idempotency_key: window.crypto.randomUUID(),
      })
      setWallet(result.wallet)
      setMessage(`تم التحويل إلى ${transfer.to_username}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const doWithdraw = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const result = await api.post('/api/wallet/withdrawals', {
        currency: withdraw.currency,
        amount: Number(withdraw.amount),
        method: withdraw.method,
        payout_currency: 'IQD',
        beneficiary: { phone: withdraw.phone },
        idempotency_key: window.crypto.randomUUID(),
      })
      setWallet(result.wallet)
      setMessage(result.note || 'تم إنشاء طلب السحب')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <h1 className="page-title">{t('profile')}</h1>

      <div className="card glass">
        <div className="row">
          <Avatar user={user} size={64} />
          <div>
            <strong data-testid="profile-name">{user.display_name || user.username}</strong>
            <div className="muted">@{user.username} · ID {user.id}</div>
            <div className="badges" style={{ marginTop: 6 }}>
              {user.badges.map((badge) => (
                <span className="badge-pill" key={badge}>
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          {t('level')} {user.level} · {user.xp_into_level}/{user.next_level_xp} {t('xp')}
        </div>
        <input type="file" accept="image/png,image/jpeg,image/webp" data-testid="avatar-input" onChange={uploadAvatar} style={{ marginTop: 10 }} />
      </div>

      <form className="card glass stack" onSubmit={saveProfile}>
        <h3 className="section-title" style={{ margin: 0 }}>
          {t('editProfile')}
        </h3>
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
        <button type="submit" className="btn btn-primary" data-testid="profile-save">
          {t('save')}
        </button>
      </form>

      <div className="card glass">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          {t('wallet')}
        </h3>
        <div className="row wrap">
          <span className="chip chip-coins">
            <PhotoIcon name="coin" size={15} /> {wallet.coins}
          </span>
          <span className="chip chip-gold">
            <PhotoIcon name="gem" size={15} /> {wallet.gold}
          </span>
          {walletInfo?.vip?.active ? <span className="badge-pill">VIP {new Date(walletInfo.vip.until).toLocaleDateString('ar')}</span> : null}
        </div>

        <form className="grid-two" style={{ marginTop: 12 }} onSubmit={doTransfer}>
          <div className="field">
            <label htmlFor="transfer-user">{t('transfer')} — {t('username')}</label>
            <input
              id="transfer-user"
              data-testid="transfer-username"
              value={transfer.to_username}
              onChange={(event) => setTransfer({ ...transfer, to_username: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="transfer-amount">المبلغ</label>
            <input
              id="transfer-amount"
              data-testid="transfer-amount"
              type="number"
              min="1"
              value={transfer.amount}
              onChange={(event) => setTransfer({ ...transfer, amount: event.target.value })}
            />
          </div>
          <button type="submit" className="btn btn-accent" data-testid="transfer-submit">
            {t('transfer')}
          </button>
        </form>

        <form className="grid-two" style={{ marginTop: 16 }} onSubmit={doWithdraw}>
          <div className="field">
            <label htmlFor="withdraw-amount">{t('withdraw')} — {t('withdrawal')} ({walletInfo?.withdrawal?.minimum ?? '—'} حد أدنى)</label>
            <input
              id="withdraw-amount"
              data-testid="withdraw-amount"
              type="number"
              value={withdraw.amount}
              onChange={(event) => setWithdraw({ ...withdraw, amount: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="withdraw-phone">رقم المستفيد</label>
            <input
              id="withdraw-phone"
              data-testid="withdraw-phone"
              value={withdraw.phone}
              onChange={(event) => setWithdraw({ ...withdraw, phone: event.target.value })}
            />
          </div>
          <button type="submit" className="btn" data-testid="withdraw-submit">
            {t('withdraw')}
          </button>
        </form>

        {walletInfo ? (
          <p className="notice" style={{ marginTop: 12 }} data-testid="withdrawal-state">
            {walletInfo.withdrawal.enabled
              ? `السحب مفعّل · رسم ${walletInfo.withdrawal.fee_percent}% · سعر الصرف ${walletInfo.withdrawal.exchange_rate_usd_iqd} IQD/دولار`
              : 'السحب غير مفعّل حالياً؛ يتم تفعيله من لوحة الإدارة بعد ربط مزود الدفع.'}
          </p>
        ) : null}

        {withdrawals.length ? (
          <div style={{ marginTop: 12 }}>
            {withdrawals.map((item) => (
              <div className="ledger-row" key={item.id}>
                <span>طلب #{item.id} · {item.amount} · {item.method}</span>
                <span className={`status-pill status-${item.status}`}>{item.status}</span>
              </div>
            ))}
          </div>
        ) : null}

        <h4 className="section-title">{t('ledger')}</h4>
        {ledger.map((entry) => (
          <div className="ledger-row" key={entry.id} data-testid="ledger-row">
            <span>
              {entry.kind} · {entry.note || '—'}
            </span>
            <span className={entry.amount >= 0 ? 'amount-in' : 'amount-out'}>
              {entry.amount >= 0 ? '+' : ''}
              {entry.amount} <PhotoIcon name={entry.currency === 'coins' ? 'coin' : 'gem'} size={13} />
            </span>
          </div>
        ))}
      </div>

      <div className="card glass">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          {t('privacy')}
        </h3>
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

      <div className="card glass">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          {t('notificationsPrefs')}
        </h3>
        {Object.entries(prefs).map(([key, value]) => (
          <label className="row" key={key} style={{ gap: 8, padding: '6px 0' }}>
            <input type="checkbox" checked={Boolean(value)} onChange={(event) => savePrefs(key, event.target.checked)} style={{ width: 18 }} />
            <span>{key}</span>
          </label>
        ))}
        <button type="button" className="btn" style={{ marginTop: 8 }} onClick={() => api.post('/api/notifications/read-all').then(() => setUnread(0))}>
          تعليم كل الإشعارات كمقروءة
        </button>
      </div>

      <div className="card glass">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          الصفحات
        </h3>
        <div className="row wrap">
          <Link className="btn" to="/settings" data-testid="profile-open-settings">
            الإعدادات
          </Link>
          <Link className="btn" to="/dashboard">
            لوحة القيادة
          </Link>
          <Link className="btn" to="/data-management">
            إدارة البيانات
          </Link>
          <Link className="btn" to="/search">
            البحث
          </Link>
          <Link className="btn" to="/help">
            مركز المساعدة
          </Link>
        </div>
      </div>

      {message ? <p className="success-text" data-testid="profile-message">{message}</p> : null}
      {error ? <p className="error-text" data-testid="profile-error">{error}</p> : null}
    </div>
  )
}
