import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageBar from '../components/PageBar.jsx'
import PhotoIcon from '../components/PhotoIcon.jsx'
import { api } from '../lib/api.js'
import { useRemote } from '../lib/hooks.js'
import { usePageText } from '../lib/pageText.js'

const TABS = [
  { key: 'rooms', icon: 'mic' },
  { key: 'games', icon: 'dice' },
  { key: 'ledger', icon: 'coin' },
  { key: 'orders', icon: 'cart' },
  { key: 'gifts', icon: 'gift' },
]

/** Every record the signed-in user owns or took part in, with search. */
export default function DataManagement() {
  const s = usePageText()
  const [tab, setTab] = useState('rooms')
  const [query, setQuery] = useState('')

  const { data, error, loading, reload } = useRemote(async () => {
    const [rooms, games, ledger, orders, gifts] = await Promise.all([
      api.get('/api/rooms?mine=true&limit=50'),
      api.get('/api/games/rooms'),
      api.get('/api/wallet/ledger?limit=100'),
      api.get('/api/store/purchases'),
      api.get('/api/gifts/history?limit=50'),
    ])
    return {
      rooms: rooms.rooms,
      games: games.rooms,
      ledger: ledger.entries,
      orders: orders.orders,
      gifts: gifts.transactions,
    }
  })

  const tabLabels = {
    rooms: s.tabRooms,
    games: s.tabGames,
    ledger: s.tabLedger,
    orders: s.tabOrders,
    gifts: s.tabGifts,
  }

  // One searchable row shape for every source, so the list renders identically.
  const rows = useMemo(() => {
    if (!data) return []
    if (tab === 'rooms') {
      return data.rooms.map((room) => ({
        id: `room-${room.id}`,
        title: room.name,
        meta: `${tabLabels.rooms} · ${room.member_count}/${room.seat_count} · ${room.status}`,
        to: `/item-details?type=room&id=${room.id}`,
      }))
    }
    if (tab === 'games') {
      return data.games.map((game) => ({
        id: `game-${game.id}`,
        title: game.name,
        meta: `${game.game === 'ludo' ? 'Ludo' : 'Domino'} · ${game.player_count}/${game.max_players} · ${game.status}`,
        to: `/item-details?type=game&id=${game.id}`,
      }))
    }
    if (tab === 'ledger') {
      return data.ledger.map((entry) => ({
        id: `ledger-${entry.id}`,
        title: `${entry.kind} · ${entry.note || '—'}`,
        meta: `${entry.amount >= 0 ? '+' : ''}${entry.amount} ${entry.currency} · ${new Date(entry.created_at).toLocaleDateString('en')}`,
        to: `/item-details?type=transaction&id=${entry.id}`,
      }))
    }
    if (tab === 'orders') {
      return data.orders.map((order) => ({
        id: `order-${order.id}`,
        title: `#${order.id} · ${order.amount} ${order.currency}`,
        meta: `${order.status} · ${order.price_amount} ${order.price_currency}`,
        to: `/item-details?type=order&id=${order.id}`,
      }))
    }
    return data.gifts.map((gift) => ({
      id: `gift-${gift.id}`,
      title: gift.gift?.name || '—',
      meta: `${gift.direction} · ${gift.amount} ${gift.currency} · ${
        gift.direction === 'sent' ? gift.receiver?.username || '—' : gift.sender?.username || '—'
      }`,
      to: `/item-details?type=gift&id=${gift.id}`,
    }))
  }, [data, tab, tabLabels])

  const needle = query.trim().toLowerCase()
  const visible = needle
    ? rows.filter((row) => `${row.title} ${row.meta}`.toLowerCase().includes(needle))
    : rows

  return (
    <div data-testid="data-management-page">
      <PageBar title={s.dataManagement} back="/dashboard" testId="data-management">
        <button type="button" className="btn btn-small" onClick={reload} disabled={loading}>
          {s.recheck}
        </button>
      </PageBar>

      <p className="muted" style={{ margin: '0 2px 12px' }}>
        {s.dataManagementSub}
      </p>

      <div className="subnav" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={`subnav-item${tab === item.key ? ' subnav-item-active' : ''}`}
            data-testid={`dm-tab-${item.key}`}
            onClick={() => setTab(item.key)}
          >
            {tabLabels[item.key]}
            <span className="muted"> {data ? rows.length : '…'}</span>
          </button>
        ))}
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <input
          type="search"
          value={query}
          placeholder={s.searchPlaceholder}
          aria-label={s.searchPlaceholder}
          data-testid="dm-search"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="card glass">
        <div className="row-between" style={{ marginBottom: 6 }}>
          <span className="muted">
            {visible.length} {s.results}
          </span>
          <PhotoIcon name={TABS.find((item) => item.key === tab).icon} size={18} />
        </div>
        {loading && !data ? <p className="muted">{s.loading}</p> : null}
        {data && visible.length === 0 ? <p className="muted">{query ? s.noResults : s.empty}</p> : null}
        {visible.map((row) => (
          <Link className="list-item" key={row.id} to={row.to} data-testid="dm-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{row.title}</strong>
              <div className="muted">{row.meta}</div>
            </div>
            <span className="status-pill">{s.details}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
