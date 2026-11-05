import { useCallback, useEffect, useState } from 'react'
import PhotoIcon from './PhotoIcon.jsx'
import { api } from '../lib/api.js'
import { useI18n } from '../lib/i18n.jsx'

/**
 * منتقي خلفيات الغرفة: مكتبة الخادم (صور فوتوغرافية + ثيمات التدرّج القديمة).
 * الخلفية تُحفظ على الخادم عبر `onApply` (POST /api/rooms/{id}/background).
 */
export default function RoomBackgroundSheet({ room, onClose, onApply }) {
  const { t, lang } = useI18n()
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/rooms/backgrounds')
      setItems(data.backgrounds || [])
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const apply = async (slug) => {
    if (saving) return
    setSaving(slug)
    try {
      await onApply(slug)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving('')
    }
  }

  return (
    <div className="overlay" data-testid="room-background-sheet" onClick={onClose}>
      <div className="glass sheet stack" onClick={(event) => event.stopPropagation()}>
        <div className="row-between">
          <h3 className="section-title" style={{ margin: 0 }}>
            <PhotoIcon name="palette" size={18} /> {t('roomBackgrounds')}
          </h3>
          <button type="button" className="btn" data-testid="close-backgrounds" onClick={onClose}>
            {t('close')}
          </button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {t('roomBackgroundsHint')}
        </p>
        {error ? (
          <p className="error-text" data-testid="backgrounds-error">
            {error}
          </p>
        ) : null}
        <div className="room-bg-grid">
          {items.map((item) => {
            const name = lang === 'en' ? item.name_en : item.name_ar
            return (
              <button
                key={item.slug}
                type="button"
                className={`room-bg-card${item.slug === room?.background ? ' room-bg-card-selected' : ''}`}
                data-testid={`room-bg-${item.slug}`}
                onClick={() => apply(item.slug)}
                disabled={saving === item.slug}
              >
                {item.kind === 'photo' ? (
                  <img src={item.thumb_url || item.url} alt={name} loading="lazy" />
                ) : (
                  <span className={`room-bg-theme bg-${item.slug}`} aria-hidden="true" />
                )}
                <span className="room-bg-card-name">{name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
