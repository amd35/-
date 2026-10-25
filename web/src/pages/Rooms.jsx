import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import PhotoIcon from '../components/PhotoIcon.jsx'
import { useI18n } from '../lib/i18n.jsx'

const BACKGROUNDS = ['sunset', 'night', 'desert', 'sea', 'royal', 'aurora']

const emptyRoom = {
  name: '',
  description: '',
  image_url: '',
  background: 'sunset',
  is_private: false,
  password: '',
  gifts_enabled: true,
  chat_enabled: true,
  rules: '',
}

export default function Rooms() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [myRoomId, setMyRoomId] = useState(null)
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
      setMyRoomId(data.my_room_id ?? null)
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
        {myRoomId ? (
          <button type="button" className="btn btn-accent" data-testid="go-my-room" onClick={() => navigate(`/rooms/${myRoomId}`)}>
            {t('goToMyRoom')}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" data-testid="open-create-room" onClick={() => setShowCreate(true)}>
            + {t('createRoom')}
          </button>
        )}
      </div>

      <div className="card glass">
        <div className="field">
          <label htmlFor="room-search">{t('search')}</label>
          <input
            id="room-search"
            data-testid="room-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search')}
          />
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          {myRoomId ? t('oneRoomOnly') : 'غرفة واحدة لكل مستخدم — منصة صوتية بـ 12 مقعداً، الانضمام مباشر بلا موافقة.'}
        </p>
      </div>

      {error ? (
        <p className="error-text" data-testid="rooms-error">
          {error}
        </p>
      ) : null}

      <div className="stack">
        {loaded && rooms.length === 0 ? (
          <p className="muted" data-testid="rooms-empty">
            {t('noRooms')}
          </p>
        ) : null}
        {rooms.map((room) => (
          <div className="card glass room-card" key={room.id} data-testid={`room-card-${room.id}`}>
            <div className="room-card-media">
              {room.image_url ? (
                <img src={room.image_url} alt={room.name} loading="lazy" />
              ) : (
                <PhotoIcon name="mic" size={40} />
              )}
            </div>
            <div className="room-card-body">
              <strong className="room-card-title">
                {room.name} {room.is_private ? <PhotoIcon name="lock" size={14} /> : ''}
              </strong>
              <div className="muted">
                {t('roomNumber')}: {room.number}
              </div>
              <div className="muted">{room.description || '—'}</div>
              <div className="room-stats" style={{ marginTop: 6 }}>
                <span data-testid={`room-card-members-${room.id}`}>
                  <PhotoIcon name="friends" size={14} /> {room.member_count}
                </span>
                <span>
                  <PhotoIcon name="mic" size={14} /> {room.seat_count}
                </span>
                <span data-testid={`room-card-likes-${room.id}`}>
                  <PhotoIcon name="heart" size={14} /> {room.like_count}
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
            <div className="field">
              <label htmlFor="room-image">صورة الغرفة (رابط)</label>
              <input
                id="room-image"
                data-testid="create-room-image"
                value={form.image_url}
                onChange={(event) => setForm({ ...form, image_url: event.target.value })}
                placeholder="https://…"
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
    </div>
  )
}
