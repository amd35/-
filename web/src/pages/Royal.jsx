import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import PhotoIcon from '../components/PhotoIcon.jsx'
import RoyalCrown from '../components/RoyalCrown.jsx'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

// قوس التقدم فوق التاج: نصف دائرة (pathLength=100 يجعل الطول المئوي مباشراً).
const ARC = 'M 8 96 A 52 52 0 0 1 112 96'

/**
 * صفحة رويال: التاج ومؤشر المستوى، شروط الترقية الحقيقية من الخادم،
 * امتيازات المستوى، وحزم الجواهر التي تمنح نقاط رويال.
 * لا رقم ثابت في الواجهة: كل قيمة من `/api/royal`.
 */
export default function Royal() {
  const { wallet, refresh } = useAuth()
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState(null)
  const [showLevels, setShowLevels] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const payload = await api.get('/api/royal')
      setData(payload)
      setSelected((previous) => previous ?? payload.status.level ?? payload.tiers[0]?.level ?? 1)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const tiers = data?.tiers || []
  const status = data?.status
  const tier = tiers.find((item) => item.level === selected) || tiers[0] || null

  const buy = async (pack) => {
    setBusy(`pack-${pack.id}`)
    setError('')
    setMessage('')
    try {
      const result = await api.post(`/api/store/packs/${pack.id}/purchase`, { price_currency: 'IQD' })
      if (data?.payment?.configured) {
        // بوابة دفع حقيقية: الجواهر والنقاط لا تُضاف إلا بعد تأكيد المزود على الخادم.
        const checkout = await api.post(`/api/payments/orders/${result.order.id}/checkout`)
        if (checkout?.checkout_url) {
          window.location.href = checkout.checkout_url
          return
        }
      }
      setMessage(result.payment?.message || '')
      await load()
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const step = (delta) => {
    if (!tiers.length || !tier) return
    const index = tiers.findIndex((item) => item.level === tier.level)
    const next = tiers[(index + delta + tiers.length) % tiers.length]
    setSelected(next.level)
  }

  if (!data && !error) return <p className="muted" data-testid="royal-loading">…</p>

  const points = status?.points ?? 0
  const reached = tier ? points >= tier.required_points : false
  const isCurrent = Boolean(tier) && tier.level === (status?.level ?? 0)
  const percent = !tier
    ? 0
    : isCurrent
      ? status.progress
      : reached
        ? 100
        : tier.required_points
          ? Math.min(100, Math.round((points * 100) / tier.required_points))
          : 100

  const featured = (tier?.privileges || []).filter((item) => item.featured)
  const grid = (tier?.privileges || []).filter((item) => !item.featured)

  return (
    <div data-testid="royal-page">
      <div className="store-bar">
        <button
          type="button"
          className="icon-button"
          onClick={() => navigate(-1)}
          aria-label={t('close')}
          data-testid="royal-back"
        >
          ✕
        </button>
        <span className="store-title">{t('royalLevelTitle')}</span>
        <div className="topbar-spacer" />
        <button
          type="button"
          className="icon-button"
          onClick={() => setShowLevels((open) => !open)}
          aria-label={t('royalLevels')}
          aria-expanded={showLevels}
          data-testid="royal-levels-toggle"
        >
          <PhotoIcon name="crown" size={20} />
        </button>
      </div>

      {showLevels ? (
        <div className="royal-level-chips" data-testid="royal-levels">
          {tiers.map((item) => (
            <button
              type="button"
              key={item.level}
              className={`royal-chip${item.level === tier?.level ? ' is-active' : ''}${
                points >= item.required_points ? ' is-reached' : ''
              }`}
              style={{ '--accent': item.accent }}
              onClick={() => {
                setSelected(item.level)
                setShowLevels(false)
              }}
              data-testid={`royal-chip-${item.level}`}
            >
              {item.name_ar}
            </button>
          ))}
        </div>
      ) : null}

      {/* 1) التاج ومؤشر المستوى الدائري + أسهم التنقل بين المستويات الخمسة */}
      <section
        className="royal-hero"
        style={{ '--accent': tier?.accent || '#f4cc44', '--jewel': tier?.jewel || '#45d2ba' }}
        data-testid={`royal-hero-${tier?.level ?? 0}`}
      >
        <button type="button" className="royal-arrow" onClick={() => step(-1)} aria-label="‹" data-testid="royal-prev">
          ‹
        </button>
        <div className="royal-stage">
          <svg className="royal-ring" viewBox="0 0 120 140" role="img" aria-label={`${percent}%`}>
            <path className="royal-ring-track" d={ARC} />
            <path className="royal-ring-fill" d={ARC} pathLength="100" strokeDasharray={`${percent} 100`} />
          </svg>
          <span className="royal-stage-glow" />
          <div className="royal-crown" data-testid="royal-crown">
            <RoyalCrown
              level={tier?.level ?? 1}
              accent={tier?.accent || '#f4cc44'}
              jewel={tier?.jewel || '#45d2ba'}
              size={132}
            />
          </div>
          {/* منصّة مخملية تحت التاج (تصميم فقط) */}
          <span className="royal-pedestal" aria-hidden="true" />
          <div className="royal-ring-value">{percent}%</div>
        </div>
        <button type="button" className="royal-arrow" onClick={() => step(1)} aria-label="›" data-testid="royal-next">
          ›
        </button>
      </section>

      <h1 className="royal-level-name" data-testid="royal-level-name">
        {lang === 'en' && tier?.name_en ? tier.name_en : tier?.name_ar}
      </h1>
      <p className={isCurrent ? 'royal-status is-current' : 'royal-status'} data-testid="royal-status">
        {isCurrent ? t('yourLevel') : reached ? t('royalPassed') : t('reachLevel')}
      </p>

      {/* نقاط رويال الحالية والمتبقية للترقية — من الخادم فقط */}
      <div className="royal-hero-stats">
        <span className="royal-stat" data-testid="royal-current">
          <PhotoIcon name="star" size={14} /> {t('currentPoints')}:{' '}
          <strong data-testid="royal-points">{points}</strong>
        </span>
        <span className="royal-stat" data-testid="royal-remaining">
          <PhotoIcon name="trophy" size={14} /> {t('pointsToNext')}:{' '}
          <strong data-testid="royal-points-to-next">{status?.points_to_next ?? 0}</strong>
        </span>
      </div>

      <div className="royal-meters card glass" data-testid="royal-meters">
        <div className="row-between">
          <span className="muted">{t('royalNeedToOpen')}</span>
          <strong data-testid="royal-tier-requirement">{tier?.required_points ?? 0}</strong>
        </div>
        <div className="progress" style={{ marginTop: 10 }}>
          <div className="progress-fill" style={{ width: `${percent}%` }} data-testid="royal-progress" />
        </div>
      </div>

      {/* 2) الامتيازات: أربعة أزرار في صفّين ثم شبكة بثلاثة أعمدة */}
      <section className="royal-privileges" data-testid="royal-privileges">
        <h2 className="royal-title">{t('royalPrivileges')}</h2>
        <div className="royal-privileges-count">
          {t('privilegesOf')} {tier?.name_ar} ({tier?.privileges?.length ?? 0})
        </div>
        <div className="perk-grid">
          {featured.map((perk) => (
            <article className="perk-card" key={perk.key} data-testid={`perk-${perk.key}`}>
              <span className="perk-card-title">{lang === 'en' && perk.title_en ? perk.title_en : perk.title_ar}</span>
              <span className="perk-card-icon">
                <PhotoIcon name={perk.icon} size={30} />
              </span>
            </article>
          ))}
        </div>
        <div className="perk-icons">
          {grid.map((perk) => (
            <div className="perk-icon" key={perk.key} data-testid={`perk-icon-${perk.key}`}>
              <span className="perk-icon-box">
                <PhotoIcon name={perk.icon} size={22} />
              </span>
              <span className="perk-icon-label">{lang === 'en' && perk.title_en ? perk.title_en : perk.title_ar}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3) حزم الجواهر: كل باقة تمنح جواهر + نقاط رويال (أسعار حقيقية من الخادم) */}
      <section data-testid="royal-packages">
        <h2 className="section-title">{t('royalPacks')}</h2>
        <div className="grid-packs">
          {(data?.packages || []).map((pack) => (
            <div className="card glass" key={pack.id} data-testid={`royal-pack-${pack.id}`}>
              <div className="row-between">
                <strong>
                  <PhotoIcon name="gem" size={15} /> {pack.amount.toLocaleString('en')} {t('gems')}
                </strong>
                {pack.badge ? <span className="badge-pill">{pack.badge}</span> : null}
              </div>
              <div className="royal-pack-points">
                +{pack.royal_points} {t('royalPoints')}
              </div>
              <div className="row-between" style={{ marginTop: 10 }}>
                <span className="chip chip-gold">
                  {pack.price_iqd.toLocaleString('en')} IQD
                </span>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy === `pack-${pack.id}`}
                  onClick={() => buy(pack)}
                  data-testid={`royal-buy-${pack.id}`}
                >
                  {t('recharge')}
                </button>
              </div>
            </div>
          ))}
        </div>
        <p className="chip chip-coins" style={{ marginTop: 10 }} data-testid="royal-gems">
          <PhotoIcon name="gem" size={15} /> {wallet.gems ?? 0} {t('gems')}
        </p>
        {data?.payment ? (
          <p className={data.payment.configured ? 'muted' : 'notice'} data-testid="royal-payment-status">
            {data.payment.message || ''}
          </p>
        ) : null}
      </section>

      {(data?.history || []).length ? (
        <section data-testid="royal-history">
          <h2 className="section-title">{t('royalHistory')}</h2>
          <div className="card glass">
            {data.history.map((entry) => (
              <div className="ledger-row" key={entry.id}>
                <span>{entry.note || entry.kind}</span>
                <span className={entry.points > 0 ? 'success-text' : 'muted'}>
                  {entry.points > 0 ? '+' : ''}
                  {entry.points}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {message ? (
        <p className="success-text" data-testid="royal-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="error-text" data-testid="royal-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
