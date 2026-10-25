import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import PhotoIcon, { giftIconName } from './PhotoIcon.jsx'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

export default function GiftSheet({ room, members = [], initialReceiverId = null, onClose, onSent }) {
  const { wallet, setWallet, meta } = useAuth()
  const { t } = useI18n()
  const [gifts, setGifts] = useState([])
  const [currency, setCurrency] = useState('coins')
  const [selected, setSelected] = useState(null)
  const [target, setTarget] = useState(initialReceiverId ? String(initialReceiverId) : 'room')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .get('/api/gifts')
      .then((data) => setGifts(data.gifts))
      .catch((err) => setError(err.message))
  }, [])

  const available = useMemo(
    () => gifts.filter((gift) => (currency === 'coins' ? gift.price_coins > 0 : gift.price_gold > 0)),
    [gifts, currency],
  )
  const balance = currency === 'coins' ? wallet.coins : wallet.gold

  const submit = async () => {
    if (!selected) return
    setBusy(true)
    setError('')
    try {
      const body = {
        gift_id: selected.id,
        currency,
        idempotency_key: (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).slice(0, 60),
      }
      if (target === 'room') body.room_id = room.id
      else body.receiver_id = Number(target)
      const result = await api.post('/api/gifts/send', body)
      setWallet(result.wallet)
      setMessage(`تم إرسال ${selected.name}`)
      onSent?.(result, selected)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="glass sheet" onClick={(event) => event.stopPropagation()}>
        <div className="row-between">
          <h3 className="section-title" style={{ margin: 0 }}>
            <PhotoIcon name="gift" size={20} /> {t('gifts')}
          </h3>
          <button type="button" className="btn" onClick={onClose}>
            {t('cancel')}
          </button>
        </div>

        <div className="row wrap" style={{ margin: '10px 0' }}>
          <button
            type="button"
            className={`auth-tab${currency === 'coins' ? ' auth-tab-active' : ''}`}
            data-testid="gift-currency-coins"
            onClick={() => setCurrency('coins')}
          >
            <PhotoIcon name="coin" size={16} /> {t('coins')}
          </button>
          <button
            type="button"
            className={`auth-tab${currency === 'gold' ? ' auth-tab-active' : ''}`}
            data-testid="gift-currency-gold"
            onClick={() => setCurrency('gold')}
          >
            <PhotoIcon name="gem" size={16} /> {t('gold')}
          </button>
          <span className="chip">{t('balance')}: {balance}</span>
        </div>

        <div className="field">
          <label htmlFor="gift-target">{t('sendGift')} {t('giftTo')}</label>
          <select id="gift-target" data-testid="gift-target" value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="room">{t('giftRoom')}</option>
            {members.map((member) => (
              <option key={member.user.id} value={String(member.user.id)}>
                {member.user.display_name || member.user.username}
              </option>
            ))}
          </select>
        </div>

        <div className="gift-grid" style={{ marginTop: 12 }}>
          {available.map((gift) => (
            <button
              type="button"
              key={gift.id}
              className={`gift-card${selected?.id === gift.id ? ' gift-card-active' : ''}`}
              data-testid={`gift-${gift.id}`}
              onClick={() => setSelected(gift)}
            >
              <span className="gift-emoji">
                <PhotoIcon name={giftIconName(gift.emoji)} size={34} alt={gift.name} />
              </span>
              <span>{gift.name}</span>
              <span className="gift-price">
                {currency === 'coins' ? gift.price_coins : gift.price_gold}{' '}
                <PhotoIcon name={currency === 'coins' ? 'coin' : 'gem'} size={13} />
              </span>
            </button>
          ))}
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {message ? <p className="success-text">{message}</p> : null}
        {meta && meta.payments_configured === false ? null : null}

        <button
          type="button"
          className="btn btn-primary btn-block"
          style={{ marginTop: 14 }}
          data-testid="gift-send"
          disabled={!selected || busy}
          onClick={submit}
        >
          {busy ? '…' : t('sendGift')}
        </button>
      </div>
    </div>
  )
}
