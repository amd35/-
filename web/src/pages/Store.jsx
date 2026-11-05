import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import PhotoIcon from '../components/PhotoIcon.jsx'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

const KIND_ICON = { dice: 'dice', theme: 'palette' }

/** A die face drawn from the item's own colours: no image asset required. */
function DieFace({ accent, pips }) {
  const spots = [0, 2, 4, 6, 8]
  return (
    <div className="die-face" style={{ background: `linear-gradient(150deg, ${accent}, rgba(0, 0, 0, 0.38))` }}>
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className="die-pip" style={{ background: spots.includes(index) ? pips : 'transparent' }} />
      ))}
    </div>
  )
}

export default function Store() {
  const { setWallet } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [kind, setKind] = useState('dice')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const payload = await api.get('/api/store/cosmetics')
      setData(payload)
      setWallet(payload.balances)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [setWallet])

  useEffect(() => {
    load()
  }, [load])

  const items = useMemo(() => data?.items || [], [data])

  const kinds = useMemo(() => {
    const present = ['dice', 'theme'].filter((key) => items.some((item) => item.kind === key))
    return present.length ? present : ['dice']
  }, [items])

  useEffect(() => {
    if (!kinds.includes(kind)) setKind(kinds[0])
  }, [kinds, kind])

  const filters = [
    { key: 'all', label: t('all') },
    { key: 'owned', label: t('owned') },
    { key: 'notOwned', label: t('notOwned') },
    { key: 'diamonds', label: t('byDiamonds') },
    { key: 'gold', label: t('byGold') },
  ]

  const visible = items
    .filter((item) => item.kind === kind)
    .filter((item) => {
      if (filter === 'owned') return item.owned
      if (filter === 'notOwned') return !item.owned
      if (filter === 'diamonds') return item.price_diamonds > 0
      if (filter === 'gold') return item.price_gold > 0
      return true
    })

  const shelves = []
  for (let index = 0; index < visible.length; index += 4) shelves.push(visible.slice(index, index + 4))

  const buy = async (item, currency) => {
    setBusy(`${item.id}-${currency}`)
    setMessage('')
    setError('')
    try {
      await api.post(`/api/store/cosmetics/${item.id}/purchase`, { currency })
      setMessage(`${item.name} — ${t('owned')}`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const equip = async (item) => {
    setBusy(`equip-${item.id}`)
    setMessage('')
    setError('')
    try {
      await api.post(`/api/store/cosmetics/${item.id}/equip`)
      setMessage(`${item.name} — ${t('equipped')}`)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const balances = data?.balances || { diamonds: 0, gold: 0 }

  return (
    <div>
      <div className="store-bar">
        <button type="button" className="icon-button" onClick={() => navigate('/')} aria-label={t('close')} data-testid="store-close">
          ✕
        </button>
        <span className="store-title">{t('store')}</span>
        <div className="topbar-spacer" />
        <span className="chip chip-diamonds" data-testid="store-balance-diamonds">
          <PhotoIcon name="gem" size={15} /> {balances.diamonds}
        </span>
        <span className="chip chip-gold" data-testid="store-balance-gold">
          <PhotoIcon name="gold" size={15} /> {balances.gold}
        </span>
      </div>

      <div className="subnav">
        {kinds.map((key) => (
          <button
            key={key}
            type="button"
            className={`subnav-item${key === kind ? ' subnav-item-active' : ''}`}
            data-testid={`store-kind-${key}`}
            onClick={() => setKind(key)}
          >
            <PhotoIcon name={KIND_ICON[key]} size={16} /> {key === 'dice' ? t('diceKind') : t('themeKind')}
          </button>
        ))}
      </div>

      <div className="filter-bar">
        {filters.map((row) => (
          <button
            key={row.key}
            type="button"
            className={`filter-pill${filter === row.key ? ' filter-pill-active' : ''}`}
            data-testid={`store-filter-${row.key}`}
            onClick={() => setFilter(row.key)}
          >
            {row.label}
          </button>
        ))}
      </div>

      <div className="ribbon">{kind === 'dice' ? t('diceKind') : t('themeKind')}</div>

      {data === null && !error ? <p className="muted">…</p> : null}
      {data !== null && visible.length === 0 ? (
        <p className="muted" data-testid="store-empty">
          {t('noItems')}
        </p>
      ) : null}

      {shelves.map((row, index) => (
        <div className="shelf" key={`shelf-${index}`}>
          <div className="shelf-items">
            {row.map((item) => (
              <article
                className={`shop-item${item.equipped ? ' shop-item-equipped' : item.owned ? ' shop-item-owned' : ''}`}
                key={item.id}
                data-testid={`shop-item-${item.id}`}
              >
                <div className="shop-item-label">{item.name}</div>
                <div className="shop-item-body">
                  {item.image_url ? (
                    <img className="shop-item-image" src={item.image_url} alt={item.name} />
                  ) : (
                    <DieFace accent={item.accent} pips={item.pips} />
                  )}
                </div>
                {item.owned ? (
                  <span className="shop-item-price" data-testid={`shop-own-${item.id}`}>
                    {item.equipped ? t('equipped') : t('owned')}
                  </span>
                ) : (
                  <div className="shop-item-actions">
                    {item.price_diamonds > 0 ? (
                      <button
                        type="button"
                        className="btn btn-small btn-primary"
                        data-testid={`shop-buy-${item.id}-diamonds`}
                        disabled={busy === `${item.id}-diamonds`}
                        onClick={() => buy(item, 'diamonds')}
                      >
                        <PhotoIcon name="gem" size={14} /> {item.price_diamonds}
                      </button>
                    ) : null}
                    {item.price_gold > 0 ? (
                      <button
                        type="button"
                        className="btn btn-small btn-accent"
                        data-testid={`shop-buy-${item.id}-gold`}
                        disabled={busy === `${item.id}-gold`}
                        onClick={() => buy(item, 'gold')}
                      >
                        <PhotoIcon name="gold" size={14} /> {item.price_gold}
                      </button>
                    ) : null}
                  </div>
                )}
                {item.owned && !item.equipped ? (
                  <button
                    type="button"
                    className="btn btn-small"
                    data-testid={`shop-equip-${item.id}`}
                    disabled={busy === `equip-${item.id}`}
                    onClick={() => equip(item)}
                  >
                    {t('equipItem')}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ))}

      {message ? (
        <p className="success-text" data-testid="store-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="error-text" data-testid="store-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
