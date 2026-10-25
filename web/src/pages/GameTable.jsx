import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import DominoTable from '../components/DominoTable.jsx'
import LudoBoard from '../components/LudoBoard.jsx'
import { api } from '../lib/api.js'
import { useAuth, useSocketEvent } from '../lib/store.jsx'

const STATUS_LABEL = { waiting: 'بانتظار اللاعبين', playing: 'جارية', finished: 'منتهية', closed: 'مغلقة' }
const GAME_LABEL = { ludo: 'لودو', domino: 'دومينو' }

function lastEventText(state) {
  const event = state?.last_event
  if (!event) return ''
  const who = (seat) => `اللاعب ${Number(seat) + 1}`
  switch (event.kind) {
    case 'roll':
      return `${who(event.seat)} رمى النرد: ${event.dice}`
    case 'no_moves':
      return `${who(event.seat)} رمى ${event.dice} ولا حركة متاحة — انتقل الدور`
    case 'three_sixes':
      return `${who(event.seat)} رمى ثلاثة ستات — فقد الدور`
    case 'move':
      return `${who(event.seat)} حرّك القطعة ${Number(event.token) + 1}` +
        (event.captures?.length ? ' وأخرج قطعة الخصم' : '') +
        (event.home ? ' وأوصل قطعة إلى البيت 🎉' : '')
    case 'play':
      return `${who(event.seat)} لعب قطعة`
    case 'draw':
      return `${who(event.seat)} سحب قطعة من المخزن`
    case 'pass':
      return `${who(event.seat)} مرّر الدور`
    case 'round_end':
      return `انتهت الجولة ${event.round}: الفائز ${who(event.seat)} بـ ${event.points} نقطة`
    case 'finish':
      return `انتهت المباراة — الفائز ${who(event.seat)}`
    default:
      return ''
  }
}

export default function GameTable() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const { user, send, subscribe } = useAuth()
  const [room, setRoom] = useState(null)
  const [geometry, setGeometry] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const tableId = Number(gameId)

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/api/games/rooms/${tableId}`)
      setRoom(data.room)
      setError('')
      if (data.room.game === 'ludo' && !geometry) {
        const board = await api.get('/api/games/board/ludo')
        setGeometry(board)
      }
    } catch (err) {
      setError(err.message)
    }
  }, [tableId, geometry])

  useEffect(() => {
    load()
  }, [load])

  // Join the live channel; the server sends the authoritative state back.
  useEffect(() => {
    send({ type: 'game_join', game_room_id: tableId })
  }, [send, tableId])

  useSocketEvent('game_state', (payload) => {
    if (payload.state?.id === tableId) setRoom(payload.state)
  })
  useSocketEvent('game_error', (payload) => setError(payload.message || 'تعذر تنفيذ الإجراء'))
  useSocketEvent('game_closed', (payload) => {
    if (payload.game_room_id === tableId) {
      setNotice('تم إغلاق الطاولة')
      setTimeout(() => navigate('/games'), 1200)
    }
  })

  const act = useCallback(
    async (action, payload = {}) => {
      setError('')
      const delivered = send({ type: 'game_action', game_room_id: tableId, action, payload })
      if (!delivered) {
        try {
          const data = await api.post(`/api/games/rooms/${tableId}/action`, { action, payload })
          setRoom(data.room)
        } catch (err) {
          setError(err.message)
        }
      }
    },
    [send, tableId],
  )

  const join = async () => {
    try {
      const data = await api.post(`/api/games/rooms/${tableId}/join`)
      setRoom(data.room)
      send({ type: 'game_join', game_room_id: tableId })
    } catch (err) {
      setError(err.message)
    }
  }

  const startTable = async () => {
    try {
      const data = await api.post(`/api/games/rooms/${tableId}/start`)
      setRoom(data.room)
    } catch (err) {
      setError(err.message)
    }
  }

  const leaveTable = async () => {
    try {
      await api.post(`/api/games/rooms/${tableId}/leave`)
      send({ type: 'game_leave', game_room_id: tableId })
    } catch {
      /* leaving twice is harmless */
    }
    navigate('/games')
  }

  if (!room) {
    return (
      <div>
        <h1 className="page-title">طاولة اللعب</h1>
        {error ? <p className="error-text">{error}</p> : <p className="muted">…</p>}
        <button type="button" className="btn" onClick={() => navigate('/games')}>
          رجوع إلى الألعاب
        </button>
      </div>
    )
  }

  const state = room.state || {}
  const me = room.players.find((player) => player.user.id === user.id)
  const isHost = room.host_id === user.id
  const myTurn = room.my_seat !== null && state.turn === room.my_seat && room.status === 'playing'
  const dice = state.dice
  const winner = room.players.find((player) => player.user.id === room.winner_id)

  return (
    <div data-testid="game-table">
      <div className="row-between">
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>
            {GAME_LABEL[room.game]} — {room.name}
          </h1>
          <p className="muted" style={{ margin: 0 }} data-testid="game-table-status">
            طاولة #{room.id} · {STATUS_LABEL[room.status] || room.status} ·{' '}
            {room.my_seat === null ? 'مشاهد' : `مقعدك ${room.my_seat + 1}`}
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={load}>
            تحديث
          </button>
          <button type="button" className="btn btn-danger" data-testid="game-table-leave" onClick={leaveTable}>
            خروج
          </button>
        </div>
      </div>

      {room.status === 'playing' ? (
        <p className={myTurn ? 'success-text' : 'muted'} data-testid="game-turn">
          {myTurn ? 'دورك الآن' : `دور اللاعب ${Number(state.turn || 0) + 1}`}
          {room.game === 'ludo' && dice ? ` · النرد: ${dice}` : ''}
        </p>
      ) : null}
      {room.status === 'finished' ? (
        <p className="success-text" data-testid="game-winner">
          {winner ? `الفائز: ${winner.user.display_name || winner.user.username} — مكافأة الفوز أُضيفت إلى رصيده` : 'انتهت المباراة'}
        </p>
      ) : null}
      {lastEventText(state) ? <p className="muted" data-testid="game-last-event">{lastEventText(state)}</p> : null}
      {error ? <p className="error-text" data-testid="game-table-error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <div className="card glass">
        <h3 className="section-title" style={{ marginTop: 0 }}>
          اللاعبون ({room.players.length}/{room.max_players})
        </h3>
        <div className="stack">
          {room.players.map((player) => (
            <div className="list-item" key={player.seat} data-testid={`game-player-${player.seat}`}>
              <span className="seat-number">{player.seat + 1}</span>
              <Avatar user={player.user} size={34} />
              <div>
                <strong>{player.user.display_name || player.user.username}</strong>
                <div className="muted">
                  مستوى {player.user.level}
                  {player.seat === 0 ? ' · صاحب الطاولة' : ''}
                  {room.game === 'domino' ? ` · ${player.score} نقطة` : ''}
                </div>
              </div>
              <div className="topbar-spacer" />
              {!player.connected ? <span className="status-pill status-pending">غير متصل</span> : null}
              <span className={`status-pill status-${player.ready ? 'paid' : 'pending'}`}>
                {player.ready ? 'جاهز' : 'بانتظار'}
              </span>
              {state.turn === player.seat && room.status === 'playing' ? <span className="chip chip-gold">دوره</span> : null}
            </div>
          ))}
        </div>

        {room.status === 'waiting' ? (
          <div className="row wrap" style={{ marginTop: 12 }}>
            {me ? (
              <button
                type="button"
                className="btn"
                data-testid="game-ready"
                onClick={() => act('ready', { value: !me.ready })}
              >
                {me.ready ? 'إلغاء الجاهزية' : 'جاهز للبدء'}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" data-testid="game-join" onClick={join}>
                انضمام إلى الطاولة
              </button>
            )}
            {isHost ? (
              <button type="button" className="btn btn-primary" data-testid="game-start" onClick={startTable}>
                ابدأ المباراة
              </button>
            ) : null}
            <span className="muted">شارك رقم الطاولة #{room.id} مع أصدقائك لينضموا.</span>
          </div>
        ) : null}
      </div>

      {room.status === 'playing' || room.status === 'finished' ? (
        <div className="card glass" style={{ marginTop: 12 }}>
          {room.game === 'ludo' ? (
            <>
              <div className="row wrap" style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid="ludo-roll"
                  disabled={!myTurn || Boolean(dice)}
                  onClick={() => act('roll')}
                >
                  🎲 رمي النرد
                </button>
                {dice ? <span className="chip">النرد: {dice}</span> : null}
                {myTurn && dice && (room.legal || []).length ? (
                  <span className="muted">اختر قطعة مضيئة للتحريك</span>
                ) : null}
              </div>
              <LudoBoard
                geometry={geometry}
                state={state}
                mySeat={room.my_seat}
                legal={room.legal}
                onMove={(token) => act('move', { token })}
              />
            </>
          ) : (
            <DominoTable
              state={state}
              mySeat={room.my_seat}
              legal={room.legal}
              onPlay={(tile, side) => act('play', { tile, side })}
              onDraw={() => act('draw')}
              onPass={() => act('pass')}
            />
          )}

          {room.status === 'finished' && room.game === 'domino' ? (
            <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} data-testid="domino-next-round" onClick={() => act('next_round')}>
              جولة جديدة
            </button>
          ) : null}
          {room.status === 'finished' ? (
            <button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => navigate('/games')}>
              طاولة جديدة
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
