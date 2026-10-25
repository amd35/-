import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

const STATUS_LABEL = { pending: 'pending', paid: 'paid', failed: 'failed', cancelled: 'cancelled' }

export default function Home() {
  const { wallet, setWallet, user, refresh } = useAuth()
  const { t } = useI18n()
  const [store, setStore] = useState(null)
  const [orders, setOrders] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const [storeData, orderData] = await Promise.all([api.get('/api/store'), api.get('/api/store/purchases')])
      setStore(storeData)
      setOrders(orderData.orders)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const buyPack = async (pack) => {
    setBusy(`pack-${pack.id}`)
    setError('')
    setMessage('')
    try {
      const result = await api.post(`/api/store/packs/${pack.id}/purchase`, { price_currency: store.currency_default || 'IQD' })
      setOrders((previous) => [result.order, ...previous])
      setMessage(result.payment.message)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const buyVip = async () => {
    setBusy('vip')
    setError('')
    setMessage('')
    try {
      const result = await api.post('/api/wallet/vip', { idempotency_key: window.crypto.randomUUID() })
      setWallet(result.wallet)
      setMessage(`تم تفعيل VIP حتى ${new Date(result.vip_until).toLocaleDateString('ar')}`)
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <h1 className="page-title">{t('home')}</h1>

      <div className="grid-two">
        <div className="card glass">
          <div className="muted">{t('balance')}</div>
          <div className="row" style={{ gap: 14, marginTop: 6 }}>
            <span className="chip chip-coins">🪙 {wallet.coins} {t('coins')}</span>
            <span className="chip chip-gold">🏆 {wallet.gold} {t('gold')}</span>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            {user.vip ? `VIP — ${t('level')} ${user.level}` : `${t('level')} ${user.level} · ${user.xp} ${t('xp')}`}
          </div>
        </div>

        <div className="card glass" data-testid="vip-card">
          <div className="row-between">
            <strong>👑 {t('vip')}</strong>
            <span className="chip chip-gold">{store?.vip?.price_coins ?? '—'} 🪙</span>
          </div>
          <ul className="muted" style={{ margin: '8px 0', paddingInlineStart: 18 }}>
            {(store?.vip?.benefits || []).slice(0, 3).map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary btn-block" data-testid="buy-vip" disabled={busy === 'vip'} onClick={buyVip}>
            {t('buyVip')}
          </button>
        </div>
      </div>

      {store?.ads?.length ? (
        <section>
          <h2 className="section-title">الإعلانات والعروض</h2>
          {store.ads.map((ad) => (
            <div className="card glass" key={ad.id} data-testid="ad-card">
              <strong>{ad.title}</strong>
              <p className="muted" style={{ margin: '6px 0 0' }}>{ad.body}</p>
            </div>
          ))}
          {store.offers.map((offer) => (
            <div className="card glass" key={offer.id}>
              <strong>{offer.title}</strong>
              <p className="muted" style={{ margin: '6px 0 0' }}>{offer.body}</p>
            </div>
          ))}
        </section>
      ) : null}

      <h2 className="section-title">{t('packs')}</h2>
      <div className="grid-packs">
        {(store?.packs || []).map((pack) => (
          <div className="card glass" key={pack.id} data-testid={`pack-${pack.id}`}>
            <div className="row-between">
              <strong>{pack.name}</strong>
              {pack.badge ? <span className="badge-pill">{pack.badge}</span> : null}
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              {pack.kind === 'coins' ? '🪙' : '🏆'} {pack.amount}
              {pack.bonus ? ` + ${pack.bonus}` : ''}
            </div>
            <div className="row-between" style={{ marginTop: 10 }}>
              <span className="chip chip-gold">
                {store?.currency_default === 'USD'
                  ? `$${(pack.price_usd_cents / 100).toFixed(2)}`
                  : `${pack.price_iqd.toLocaleString('en')} IQD`}
              </span>
              <button
                type="button"
                className="btn btn-accent"
                data-testid={`buy-pack-${pack.id}`}
                disabled={busy === `pack-${pack.id}`}
                onClick={() => buyPack(pack)}
              >
                {t('recharge')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {store ? (
        <p className={store.payment.configured ? 'muted' : 'notice'} data-testid="payment-status" style={{ marginTop: 12 }}>
          {store.payment.message}
        </p>
      ) : null}

      <h2 className="section-title">{t('history')}</h2>
      <div className="card glass">
        {orders.length === 0 ? <p className="muted">—</p> : null}
        {orders.map((order) => (
          <div className="ledger-row" key={order.id} data-testid="order-row">
            <span>
              #{order.id} · {order.amount} {order.currency === 'coins' ? 'كوين' : 'ذهب'}
            </span>
            <span className={`status-pill status-${STATUS_LABEL[order.status] || 'pending'}`}>
              {t(STATUS_LABEL[order.status] || 'pending')}
            </span>
          </div>
        ))}
      </div>

      {message ? <p className="success-text" data-testid="home-message">{message}</p> : null}
      {error ? <p className="error-text" data-testid="home-error">{error}</p> : null}
    </div>
  )
}
