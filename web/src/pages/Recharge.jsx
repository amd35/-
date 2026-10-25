import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import PhotoIcon from '../components/PhotoIcon.jsx'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

const STATUS_LABEL = { pending: 'pending', paid: 'paid', failed: 'failed', cancelled: 'cancelled' }

/** Dedicated recharge page: every real pack the server offers, plus order history. */
export default function Recharge() {
  const { wallet } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
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
      const result = await api.post(`/api/store/packs/${pack.id}/purchase`, {
        price_currency: store.currency_default || 'IQD',
      })
      setOrders((previous) => [result.order, ...previous])
      setMessage(result.payment.message)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const packs = store?.packs || []
  const groups = [
    { key: 'coins', icon: 'coin', label: t('coins') },
    { key: 'gold', icon: 'gem', label: t('gold') },
    // حزم الجواهر هي حزم رويال: تمنح جواهر + نقاط رويال (تظهر في صفحة رويال أيضاً).
    { key: 'gems', icon: 'star', label: t('gems') },
  ]
    .map((group) => ({ ...group, packs: packs.filter((pack) => pack.kind === group.key) }))
    .filter((group) => group.packs.length)

  return (
    <div data-testid="recharge-page">
      <div className="store-bar">
        <button
          type="button"
          className="icon-button"
          onClick={() => navigate('/')}
          aria-label={t('close')}
          data-testid="recharge-back"
        >
          ✕
        </button>
        <span className="store-title">{t('recharge')}</span>
        <div className="topbar-spacer" />
        <span className="chip chip-coins" data-testid="recharge-balance-coins">
          <PhotoIcon name="coin" size={15} /> {wallet.coins}
        </span>
        <span className="chip chip-gold" data-testid="recharge-balance-gold">
          <PhotoIcon name="gem" size={15} /> {wallet.gold}
        </span>
      </div>

      {store === null && !error ? <p className="muted">…</p> : null}

      {groups.map((group) => (
        <section key={group.key} data-testid={`recharge-group-${group.key}`}>
          <div className="ribbon">
            <PhotoIcon name={group.icon} size={17} /> {group.label}
          </div>
          <div className="grid-packs">
            {group.packs.map((pack) => (
              <div className="card glass" key={pack.id} data-testid={`pack-${pack.id}`}>
                <div className="row-between">
                  <strong>{pack.name}</strong>
                  {pack.badge ? <span className="badge-pill">{pack.badge}</span> : null}
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  <PhotoIcon name={pack.kind === 'coins' ? 'coin' : 'gem'} size={15} /> {pack.amount}
                  {pack.bonus ? ` + ${pack.bonus}` : ''}
                </div>
                {pack.royal_points ? (
                  <div className="royal-pack-points" data-testid={`pack-royal-points-${pack.id}`}>
                    +{pack.royal_points} {t('royalPoints')}
                  </div>
                ) : null}
                <div className="row-between" style={{ marginTop: 10 }}>
                  <span className="chip chip-gold">
                    {store?.currency_default === 'USD'
                      ? `$${(pack.price_usd_cents / 100).toFixed(2)}`
                      : `${pack.price_iqd.toLocaleString('en')} IQD`}
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
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
        </section>
      ))}

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

      {message ? (
        <p className="success-text" data-testid="recharge-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="error-text" data-testid="recharge-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
