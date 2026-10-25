import { Link, useSearchParams } from 'react-router-dom'
import PageBar from '../components/PageBar.jsx'
import PhotoIcon from '../components/PhotoIcon.jsx'
import { api } from '../lib/api.js'
import { useRemote } from '../lib/hooks.js'
import { useAuth } from '../lib/store.jsx'
import { BACKGROUND_LABELS, usePageText } from '../lib/pageText.js'

const ICONS = { room: 'mic', game: 'dice', transaction: 'coin', order: 'cart', gift: 'gift' }

/** Full detail view for one record (?type=room&id=12) with the actions it supports. */
export default function ItemDetails() {
  const [params] = useSearchParams()
  const type = params.get('type') || 'room'
  const id = Number(params.get('id') || 0)
  const { user } = useAuth()
  const s = usePageText()

  const { data, error, loading } = useRemote(async () => {
    if (!id) return null
    if (type === 'room') {
      const result = await api.get(`/api/rooms/${id}`)
      return { room: result.room }
    }
    if (type === 'game') {
      const result = await api.get(`/api/games/rooms/${id}`)
      return { game: result.room }
    }
    if (type === 'transaction') {
      const result = await api.get('/api/wallet/ledger?limit=200')
      return { entry: result.entries.find((item) => item.id === id) }
    }
    if (type === 'order') {
      const result = await api.get('/api/store/purchases')
      return { order: result.orders.find((item) => item.id === id) }
    }
    if (type === 'gift') {
      const result = await api.get('/api/gifts/history?limit=100')
      return { gift: result.transactions.find((item) => item.id === id) }
    }
    return null
  }, [type, id])

  const date = (value) => (value ? new Date(value).toLocaleString('en') : '—')
  const rows = (pairs) =>
    pairs
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([label, value]) => (
        <div className="ledger-row" key={label}>
          <span className="muted">{label}</span>
          <span>{value}</span>
        </div>
      ))

  const room = data?.room
  const game = data?.game
  const entry = data?.entry
  const order = data?.order
  const gift = data?.gift
  const backgroundLabel = room ? BACKGROUND_LABELS.ar[room.background] || room.background : '—'

  const found = Boolean(room || game || entry || order || gift)
  const isOwner = room && user && room.owner?.id === user.id

  return (
    <div data-testid="item-details-page">
      <PageBar title={s.itemDetails} back="/data-management" testId="item-details">
        <Link className="btn btn-small" to="/data-management">
          {s.actionAllRecords}
        </Link>
      </PageBar>

      {error ? <p className="error-text">{error}</p> : null}
      {loading ? <p className="muted">{s.loading}</p> : null}
      {!loading && !error && !found ? (
        <p className="notice" data-testid="item-missing">
          {s.itemMissing}
        </p>
      ) : null}

      {room ? (
        <div className="card glass" data-testid="details-room">
          <div className="row">
            <PhotoIcon name={ICONS.room} size={34} />
            <div style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 17 }}>{room.name}</strong>
              <div className="muted">{room.status}</div>
            </div>
          </div>
          {rows([
            [s.fieldOwner, room.owner?.username || '—'],
            [s.fieldMembers, `${room.member_count}/${room.seat_count}`],
            [s.fieldBackground, backgroundLabel],
            [s.fieldPrivate, room.is_private ? s.yes : s.no],
            [s.fieldGifts, room.gifts_enabled ? s.yes : s.no],
            [s.fieldChat, room.chat_enabled ? s.yes : s.no],
            [s.createdAt, date(room.created_at)],
          ])}
          {room.description ? (
            <>
              <h4 className="section-title">{s.fieldDescription}</h4>
              <p className="muted" style={{ margin: 0 }}>
                {room.description}
              </p>
            </>
          ) : null}
          {room.rules ? (
            <>
              <h4 className="section-title">{s.fieldRules}</h4>
              <p className="muted" style={{ margin: 0 }}>
                {room.rules}
              </p>
            </>
          ) : null}
          <h4 className="section-title">{s.fieldMembers}</h4>
          {(room.members || []).map((member) => (
            <div className="ledger-row" key={member.user?.id ?? member.user_id}>
              <span>{member.user?.username || member.user_id}</span>
              <span className="status-pill">
                {member.role} · {member.seat_index ?? '—'}
              </span>
            </div>
          ))}
          <div className="row wrap" style={{ marginTop: 12 }}>
            <Link className="btn btn-primary" to={`/rooms/${room.id}`} data-testid="open-room">
              {s.actionOpenRoom}
            </Link>
            {isOwner ? (
              <Link className="btn" to={`/entry-form?id=${room.id}`} data-testid="edit-room">
                {s.actionEditRoom}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {game ? (
        <div className="card glass" data-testid="details-game">
          <div className="row">
            <PhotoIcon name={ICONS.game} size={34} />
            <div style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 17 }}>{game.name}</strong>
              <div className="muted">{game.status}</div>
            </div>
          </div>
          {rows([
            [s.fieldGame, game.game],
            [s.fieldPlayers, `${(game.players || []).length}/${game.max_players}`],
            [s.fieldPrivate, game.is_private ? s.yes : s.no],
            [s.createdAt, date(game.created_at)],
          ])}
          {(game.players || []).map((player) => (
            <div className="ledger-row" key={player.seat}>
              <span>
                {player.user?.username} {player.ready ? '· ready' : ''}
              </span>
              <span className="status-pill">
                {player.score} · {player.seat}
              </span>
            </div>
          ))}
          <div className="row wrap" style={{ marginTop: 12 }}>
            <Link className="btn btn-primary" to={`/games/${game.id}`} data-testid="open-table">
              {s.actionOpenTable}
            </Link>
          </div>
        </div>
      ) : null}

      {entry ? (
        <div className="card glass" data-testid="details-transaction">
          <div className="row">
            <PhotoIcon name={ICONS.transaction} size={34} />
            <strong style={{ fontSize: 17 }}>{entry.kind}</strong>
          </div>
          {rows([
            [s.amount, `${entry.amount >= 0 ? '+' : ''}${entry.amount} ${entry.currency}`],
            [s.fieldKind, entry.kind],
            [s.fieldNote, entry.note || '—'],
            [s.fieldRef, entry.ref || '—'],
            [s.createdAt, date(entry.created_at)],
          ])}
        </div>
      ) : null}

      {order ? (
        <div className="card glass" data-testid="details-order">
          <div className="row">
            <PhotoIcon name={ICONS.order} size={34} />
            <strong style={{ fontSize: 17 }}>#{order.id}</strong>
          </div>
          {rows([
            [s.amount, `${order.amount} ${order.currency}`],
            [s.fieldPrice, `${order.price_amount} ${order.price_currency}`],
            [s.status, order.status],
            [s.fieldProvider, order.provider],
            [s.createdAt, date(order.created_at)],
          ])}
        </div>
      ) : null}

      {gift ? (
        <div className="card glass" data-testid="details-gift">
          <div className="row">
            <PhotoIcon name={ICONS.gift} size={34} />
            <strong style={{ fontSize: 17 }}>{gift.gift?.name || '—'}</strong>
          </div>
          {rows([
            [s.amount, `${gift.amount} ${gift.currency}`],
            [s.type, gift.direction],
            [s.fieldSender, gift.sender?.username || '—'],
            [s.fieldReceiver, gift.receiver?.username || '—'],
            [s.fieldTarget, gift.room_id ? `room ${gift.room_id}` : '—'],
            [s.createdAt, date(gift.created_at)],
          ])}
        </div>
      ) : null}
    </div>
  )
}
