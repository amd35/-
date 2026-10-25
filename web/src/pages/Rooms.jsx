import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import PhotoIcon from '../components/PhotoIcon.jsx'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

const BACKGROUNDS = ['sunset', 'night', 'desert', 'sea', 'royal', 'aurora']

const emptyRoom = {
  name: '',
  description: '',
  seat_count: 20,
  is_private: false,
  password: '',
  gifts_enabled: true,
  chat_enabled: true,
  rules: '',
  background: 'sunset',
}

export default function Rooms() {
  const { user } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState(emptyRoom)
  const [showCreate, setShowCreate] = useState(false)
  const [passwordFor, setPasswordFor] = useState(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/api/rooms${query ? `?query=${encodeURIComponent(query)}` : ''}`)
      setRooms(data.rooms)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoaded(true)
    }
  }, [query])

  useEffect(() => {
    load()
  }, [load])

  const join = async (room, roomPassword) => {
    setError('')
    try {
      await api.post(`/api/rooms/${room.id}/join`, { password: roomPassword || null })
      navigate(`/rooms/${room.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  const create = async (event) => {
    event.preventDefault()
    setError('')
    try {
      const payload = { ...form, password: form.password || null }
      const data = await api.post('/api/rooms', payload)
      setShowCreate(false)
      setForm(emptyRoom)
      navigate(`/rooms/${data.room.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <div className="row-between">
        <h1 className="page-title">{t('rooms')}</h1>
        <button type="button" className="btn btn-primary" data-testid="open-create-room" onClick={() => setShowCreate(true)}>
          + {t('createRoom')}
        </button>
      </div>

      <div className="card glass">
        <div className="field">
          <label htmlFor="room-search">{t('search')}</label>
          <input id="room-search" data-testid="room-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} />
        </div>
      </div>

      {error ? <p className="error-text" data-testid="rooms-error">{error}</p> : null}

      <div className="stack">
        {loaded && rooms.length === 0 ? <p className="muted" data-testid="rooms-empty">{t('noRooms')}</p> : null}
        {rooms.map((room) => (
          <div className="card glass" key={room.id} data-testid={`room-card-${room.id}`}>
            <div className="row-between">
              <div>
                <strong>
                  {room.name} {room.is_private ? <PhotoIcon name="lock" size={14} /> : ''}
                </strong>
                <div className="muted">{room.description || '—'}</div>
                <div className="room-stats" style={{ marginTop: 6 }}>
                  <span>
                    <PhotoIcon name="friends" size={14} /> {room.member_count}
                  </span>
                  <span>
                    <PhotoIcon name="mic" size={14} /> {room.seat_count}
                  </span>
                  <span className="muted">{room.owner.display_name || room.owner.username}</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-accent"
                data-testid={`join-room-${room.id}`}
                onClick={() => (room.password_required ? setPasswordFor(room) : join(room))}
              >
                {t('joinRoom')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {showCreate ? (
        <div className="overlay" onClick={() => setShowCreate(false)}>
          <form className="glass sheet stack" onClick={(event) => event.stopPropagation()} onSubmit={create}>
            <h3 className="section-title" style={{ margin: 0 }}>
              {t('createRoom')}
            </h3>
            <div className="field">
              <label htmlFor="room-name">{t('roomName')}</label>
              <input
                id="room-name"
                data-testid="create-room-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="room-description">{t('roomDescription')}</label>
              <input
                id="room-description"
                data-testid="create-room-description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </div>
            <div className="grid-two">
              <div className="field">
                <label htmlFor="room-seats">{t('seats')}</label>
                <input
                  id="room-seats"
                  data-testid="create-room-seats"
                  type="number"
                  min="4"
                  max="24"
                  value={form.seat_count}
                  onChange={(event) => setForm({ ...form, seat_count: Number(event.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="room-background">الخلفية</label>
                <select
                  id="room-background"
                  data-testid="create-room-background"
                  value={form.background}
                  onChange={(event) => setForm({ ...form, background: event.target.value })}
                >
                  {BACKGROUNDS.map((background) => (
                    <option key={background} value={background}>
                      {background}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="room-rules">{t('rules')}</label>
              <textarea
                id="room-rules"
                data-testid="create-room-rules"
                rows="3"
                value={form.rules}
                onChange={(event) => setForm({ ...form, rules: event.target.value })}
              />
            </div>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                data-testid="create-room-private"
                checked={form.is_private}
                onChange={(event) => setForm({ ...form, is_private: event.target.checked })}
                style={{ width: 18 }}
              />
              <span>{t('privateRoom')}</span>
            </label>
            {form.is_private ? (
              <div className="field">
                <label htmlFor="room-password">{t('roomPassword')}</label>
                <input
                  id="room-password"
                  data-testid="create-room-password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </div>
            ) : null}
            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={form.gifts_enabled}
                onChange={(event) => setForm({ ...form, gifts_enabled: event.target.checked })}
                style={{ width: 18 }}
              />
              <span>تفعيل الهدايا</span>
            </label>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={form.chat_enabled}
                onChange={(event) => setForm({ ...form, chat_enabled: event.target.checked })}
                style={{ width: 18 }}
              />
              <span>تفعيل الدردشة</span>
            </label>
            <button type="submit" className="btn btn-primary btn-block" data-testid="create-room-submit" disabled={!form.name.trim()}>
              {t('createRoom')}
            </button>
          </form>
        </div>
      ) : null}

      {passwordFor ? (
        <div className="overlay" onClick={() => setPasswordFor(null)}>
          <div className="glass sheet stack" onClick={(event) => event.stopPropagation()}>
            <h3 className="section-title" style={{ margin: 0 }}>
              {t('roomPassword')}
            </h3>
            <input
              data-testid="join-room-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
            />
            <button
              type="button"
              className="btn btn-primary btn-block"
              data-testid="join-room-password-submit"
              onClick={() => join(passwordFor, password)}
            >
              {t('joinRoom')}
            </button>
          </div>
        </div>
      ) : null}

      <p className="muted" style={{ marginTop: 18 }}>
        {t('friends')}: {user.username}
      </p>
    </div>
  )
}
