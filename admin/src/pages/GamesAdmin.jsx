import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'

const STATUS_LABEL = { waiting: 'بانتظار اللاعبين', playing: 'جارية', finished: 'منتهية', closed: 'مغلقة' }

export default function GamesAdmin() {
  const [data, setData] = useState(null)
  const [draft, setDraft] = useState(null)
  const [moves, setMoves] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const payload = await api.get('/api/admin/games')
      setData(payload)
      setDraft(payload.settings)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async (event) => {
    event.preventDefault()
    setError('')
    try {
      await api.patch('/api/admin/games/settings', {
        games_enabled: draft.games_enabled,
        domino_target_score: Number(draft.domino_target_score),
        game_win_reward_diamonds: Number(draft.game_win_reward_diamonds),
        game_win_xp: Number(draft.game_win_xp),
      })
      setMessage('تم حفظ إعدادات الألعاب')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const closeRoom = async (room) => {
    setError('')
    try {
      await api.post(`/api/admin/games/${room.id}/close`)
      setMessage(`تم إغلاق طاولة #${room.id}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const showMoves = async (room) => {
    setError('')
    try {
      setMoves(await api.get(`/api/admin/games/${room.id}/moves`))
    } catch (err) {
      setError(err.message)
    }
  }

  if (!data || !draft) {
    return (
      <div>
        <h1>الألعاب</h1>
        {error ? <p className="error">{error}</p> : <p className="muted">…</p>}
      </div>
    )
  }

  return (
    <div>
      <h1>إدارة الألعاب (لودو ودومينو)</h1>
      {message ? <p className="success">{message}</p> : null}
      {error ? <p className="error" data-testid="admin-games-error">{error}</p> : null}

      <form className="panel" onSubmit={save} data-testid="admin-games-form">
        <h2>الإعدادات</h2>
        <div className="row">
          {['ludo', 'domino'].map((key) => (
            <label className="row" key={key} style={{ margin: 0 }}>
              <input
                type="checkbox"
                style={{ width: 18 }}
                checked={Boolean(draft.games_enabled?.[key])}
                data-testid={`admin-game-${key}`}
                onChange={(event) =>
                  setDraft({ ...draft, games_enabled: { ...draft.games_enabled, [key]: event.target.checked } })
                }
              />
              <span>{key === 'ludo' ? 'لودو' : 'دومينو'}</span>
            </label>
          ))}
        </div>
        <div className="grid">
          <div className="field">
            <label>نقاط الفوز في الدومينو (الهدف)</label>
            <input
              type="number"
              value={draft.domino_target_score}
              onChange={(event) => setDraft({ ...draft, domino_target_score: event.target.value })}
            />
          </div>
          <div className="field">
            <label>مكافأة الفوز (ماس)</label>
            <input
              type="number"
              value={draft.game_win_reward_diamonds}
              onChange={(event) => setDraft({ ...draft, game_win_reward_diamonds: event.target.value })}
            />
          </div>
          <div className="field">
            <label>مكافأة الفوز (نقاط خبرة)</label>
            <input
              type="number"
              value={draft.game_win_xp}
              onChange={(event) => setDraft({ ...draft, game_win_xp: event.target.value })}
            />
          </div>
        </div>
        <button type="submit" className="btn btn-primary" data-testid="admin-games-save">
          حفظ
        </button>
      </form>

      <div className="panel">
        <h2>إحصائيات</h2>
        <div className="row wrap">
          <span className="pill">بانتظار اللاعبين: {data.stats.waiting}</span>
          <span className="pill">جارية: {data.stats.playing}</span>
          <span className="pill">منتهية: {data.stats.finished}</span>
          <span className="pill">عدد الحركات المسجلة: {data.stats.moves}</span>
        </div>
      </div>

      <div className="panel">
        <h2>الطاولات</h2>
        {data.rooms.length === 0 ? <p className="muted">لا توجد طاولات بعد.</p> : null}
        <table className="table" data-testid="admin-games-rooms">
          <thead>
            <tr>
              <th>#</th>
              <th>اللعبة</th>
              <th>الطاولة</th>
              <th>صاحب الطاولة</th>
              <th>اللاعبون</th>
              <th>الحالة</th>
              <th>الفائز</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.rooms.map((room) => (
              <tr key={room.id}>
                <td>{room.id}</td>
                <td>{room.game_name}</td>
                <td>{room.name}</td>
                <td>{room.host.display_name || room.host.username}</td>
                <td>
                  {room.player_count}/{room.max_players}
                </td>
                <td>{STATUS_LABEL[room.status] || room.status}</td>
                <td>{room.winner ? room.winner.display_name || room.winner.username : '—'}</td>
                <td className="row">
                  <button type="button" className="btn" onClick={() => showMoves(room)}>
                    سجل الحركات
                  </button>
                  <button type="button" className="btn btn-danger" disabled={room.status === 'closed'} onClick={() => closeRoom(room)}>
                    إغلاق
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {moves ? (
        <div className="panel" data-testid="admin-games-moves">
          <div className="row">
            <h2>
              سجل الحركات — طاولة #{moves.room.id} ({moves.room.game})
            </h2>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn" onClick={() => setMoves(null)}>
              إغلاق
            </button>
          </div>
          <pre className="muted" style={{ maxHeight: 320, overflow: 'auto', direction: 'ltr' }}>
            {JSON.stringify(moves.moves, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  )
}
