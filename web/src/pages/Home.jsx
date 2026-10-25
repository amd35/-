import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

export default function Home() {
  const { wallet, setWallet, user, refresh } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [store, setStore] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [promoIndex, setPromoIndex] = useState(0)
  const trackRef = useRef(null)

  const load = useCallback(async () => {
    try {
      setStore(await api.get('/api/store'))
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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

  const ads = store?.ads || []
  const offers = store?.offers || []
  const xpInto = user.xp_into_level ?? 0
  const xpNext = user.next_level_xp ?? 0
  const xpPercent = xpNext ? Math.min(100, Math.round((xpInto / xpNext) * 100)) : 0

  // Keeps the pagination dots in sync with the carousel (works in RTL and LTR).
  const onTrackScroll = () => {
    const track = trackRef.current
    if (!track || !track.children.length) return
    const bounds = track.getBoundingClientRect()
    const center = bounds.left + bounds.width / 2
    let nearest = 0
    let best = Number.POSITIVE_INFINITY
    Array.from(track.children).forEach((child, index) => {
      const childBounds = child.getBoundingClientRect()
      const distance = Math.abs(childBounds.left + childBounds.width / 2 - center)
      if (distance < best) {
        best = distance
        nearest = index
      }
    })
    setPromoIndex(nearest)
  }

  const goToPromo = (index) => {
    trackRef.current?.children[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  return (
    <div>
      {ads.length ? (
        <section className="carousel" aria-label="promotions">
          <div className="carousel-track" ref={trackRef} onScroll={onTrackScroll}>
            {ads.map((ad) => (
              <article className="panel carousel-slide" key={ad.id} data-testid="ad-card">
                <div className="panel-icon">🎉</div>
                <div className="panel-body">
                  <div className="panel-title">{ad.title}</div>
                  <div className="panel-sub">{ad.body}</div>
                </div>
              </article>
            ))}
          </div>
          {ads.length > 1 ? (
            <div className="carousel-dots">
              {ads.map((ad, index) => (
                <button
                  key={ad.id}
                  type="button"
                  className={`carousel-dot${index === promoIndex ? ' carousel-dot-active' : ''}`}
                  aria-label={`slide-${index + 1}`}
                  onClick={() => goToPromo(index)}
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {offers.map((offer) => (
        <article className="panel" key={offer.id}>
          <div className="panel-icon">📣</div>
          <div className="panel-body">
            <div className="panel-title">{offer.title}</div>
            <div className="panel-sub">{offer.body}</div>
          </div>
        </article>
      ))}

      <article className="panel" data-testid="reward-tower">
        <div className="panel-icon">🏆</div>
        <div className="panel-body">
          <div className="panel-title">{t('rewardTower')}</div>
          <div className="progress-label">
            <span>
              {t('level')} {user.level}
            </span>
            <span data-testid="xp-progress-label">
              {xpInto}/{xpNext}
            </span>
          </div>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${xpPercent}%` }} data-testid="xp-progress" />
          </div>
        </div>
      </article>

      <article className="panel" data-testid="vip-card">
        <div className="panel-icon">👑</div>
        <div className="panel-body">
          <div className="panel-title">{t('vip')}</div>
          <ul className="panel-list">
            {(store?.vip?.benefits || []).slice(0, 3).map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
        </div>
        <div className="panel-side">
          <span className="chip chip-coins">{store?.vip?.price_coins ?? '—'} 🪙</span>
          <button type="button" className="btn btn-primary" data-testid="buy-vip" disabled={busy === 'vip'} onClick={buyVip}>
            {t('buyVip')}
          </button>
        </div>
      </article>

      <article className="panel">
        <div className="panel-icon">👛</div>
        <div className="panel-body">
          <div className="panel-title">{t('balance')}</div>
          <div className="row wrap" style={{ marginTop: 6 }}>
            <span className="chip chip-coins">
              🪙 {wallet.coins} {t('coins')}
            </span>
            <span className="chip chip-gold">
              💎 {wallet.gold} {t('gold')}
            </span>
          </div>
          <div className="panel-sub">
            {user.vip ? `VIP — ${t('level')} ${user.level}` : `${t('level')} ${user.level} · ${user.xp} ${t('xp')}`}
          </div>
        </div>
        <div className="panel-side">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="open-recharge"
            onClick={() => navigate('/recharge')}
          >
            {t('recharge')}
          </button>
        </div>
      </article>

      {message ? (
        <p className="success-text" data-testid="home-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="error-text" data-testid="home-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
