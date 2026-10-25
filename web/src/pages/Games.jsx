import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import PhotoIcon from '../components/PhotoIcon.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

const GAME_META = {
  ludo: { icon: 'dice', blurb: 'طاولة لودو بأربعة لاعبين — النرد والحركات تتحقق على الخادم.' },
  domino: { icon: 'domino', blurb: 'دومينو (6-6) — توزيع القطع، الأدوار والنقاط تُحسب على الخادم.' },
}

export default function Games() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const { } = useAuth()
  const [catalog, setCatalog] = useState(null)
  const [rooms, setRooms] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [seats, setSeats] = useState({ ludo: 4, domino: 2 })

  const load = useCallback(async () => {
    try {
      const [catalogData, roomData] = await Promise.all([api.get('/api/games/catalog'), api.get('/api/games/rooms')])
      setCatalog(catalogData)
      setRooms(roomData.rooms)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 8000)
    return () => clearInterval(timer)
  }, [load])

  const createTable = async (game) => {
    setBusy(`create-${game}`)
    setError('')
    try {
      const data = await api.post('/api/games/rooms', {
        game,
        max_players: Number(seats[game]) || (game === 'domino' ? 2 : 4),
      })
      navigate(`/games/${data.room.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  const joinTable = async (room) => {
    setError('')
    try {
      await api.post(`/api/games/rooms/${room.id}/join`)
      navigate(`/games/${room.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  const games = catalog?.games || [
    { key: 'ludo', name: 'لودو', enabled: false },
    { key: 'domino', name: 'دومينو', enabled: false },
  ]

  return (
    <div>
      <h1 className="page-title">{t('games')}</h1>
      {error ? <p className="error-text">{error}</p> : null}

      <div className="grid-two">
        {games.map((game) => (
          <div className="card glass" key={game.key} data-testid={`game-${game.key}`}>
            <div className="row-between">
              <strong>
                <PhotoIcon name={GAME_META[game.key]?.icon} size={18} /> {game.name}
              </strong>
              <span className={`status-pill ${game.enabled ? 'status-paid' : 'status-pending'}`}>
                {game.enabled ? 'متاحة' : 'معطّلة'}
              </span>
            </div>
            <p className="muted" style={{ margin: '10px 0' }}>
              {GAME_META[game.key]?.blurb}
            </p>
            <div className="row wrap">
              <label className="field" style={{ flex: '1 1 120px' }}>
                <span className="muted">عدد اللاعبين</span>
                <select
                  className="input"
                  data-testid={`game-${game.key}-players`}
                  value={seats[game.key]}
                  onChange={(event) => setSeats((previous) => ({ ...previous, [game.key]: event.target.value }))}
                >
                  {[2, 3, 4].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn btn-primary"
                style={{ alignSelf: 'flex-end' }}
                data-testid={`game-${game.key}-create`}
                disabled={!game.enabled || busy === `create-${game.key}`}
                onClick={() => createTable(game.key)}
              >
                إنشاء طاولة
              </button>
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              الفائز يحصل على {catalog?.win_reward_coins ?? 200} كوين. لا يوجد أي مراهنة أو مال حقيقي في الألعاب.
            </p>
          </div>
        ))}
      </div>

      <h2 className="section-title">الطاولات المفتوحة</h2>
      {rooms.length === 0 ? <p className="muted" data-testid="games-empty">لا توجد طاولات مفتوحة الآن — أنشئ طاولة وشاركها مع أصدقائك.</p> : null}
      <div className="stack">
        {rooms.map((room) => (
          <div className="list-item" key={room.id} data-testid={`games-room-${room.id}`}>
            <span>
              <PhotoIcon name={GAME_META[room.game]?.icon} size={22} />
            </span>
            <Avatar user={room.host} size={34} />
            <div>
              <strong>{room.name}</strong>
              <div className="muted">
                {room.game === 'ludo' ? 'لودو' : 'دومينو'} · {room.player_count}/{room.max_players} لاعبين ·{' '}
                {room.status === 'playing' ? 'جارية الآن' : 'بانتظار اللاعبين'}
              </div>
            </div>
            <div className="topbar-spacer" />
            <span className={`status-pill status-${room.status === 'playing' ? 'paid' : 'pending'}`}>
              {room.status === 'playing' ? 'مباراة جارية' : 'مفتوحة'}
            </span>
            <button
              type="button"
              className="btn btn-primary"
              data-testid={`games-room-${room.id}-join`}
              disabled={room.status !== 'waiting' || room.player_count >= room.max_players}
              onClick={() => joinTable(room)}
            >
              {t('joinRoom')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
