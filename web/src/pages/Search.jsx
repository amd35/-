import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageBar from '../components/PageBar.jsx'
import { api } from '../lib/api.js'
import { useRemote } from '../lib/hooks.js'
import { usePageText } from '../lib/pageText.js'

/** One search box across the user's rooms, games, friends, store, wallet and alerts. */
export default function Search() {
  const [params, setParams] = useSearchParams()
  const s = usePageText()
  const [query, setQuery] = useState(params.get('q') || '')

  const { data, error, loading } = useRemote(async () => {
    const [rooms, games, friends, cosmetics, gifts, ledger, alerts] = await Promise.all([
      api.get('/api/rooms?limit=50'),
      api.get('/api/games/rooms'),
      api.get('/api/friends'),
      api.get('/api/store/cosmetics'),
      api.get('/api/gifts/history?limit=50'),
      api.get('/api/wallet/ledger?limit=100'),
      api.get('/api/notifications?limit=50'),
    ])
    return {
      rooms: rooms.rooms,
      games: games.rooms,
      friends: friends.friends,
      items: cosmetics.items,
      gifts: gifts.transactions,
      ledger: ledger.entries,
      alerts: alerts.notifications,
    }
  })

  const needle = query.trim().toLowerCase()

  // The query lives in the URL, so a search can be reloaded or shared. The guard
  // keeps the effect from writing an identical URL back on every render.
  useEffect(() => {
    const current = params.get('q') || ''
    const next = query.trim()
    if (current !== next) setParams(next ? { q: next } : {}, { replace: true })
  }, [query, params, setParams])

  const groups = useMemo(() => {
    if (!data || needle.length < 2) return []
    const has = (...values) => values.filter((value) => value !== undefined && value !== null).join(' ').toLowerCase().includes(needle)
    return [
      {
        key: 'rooms',
        title: s.groupRooms,
        items: data.rooms
          .filter((room) => has(room.name, room.description, room.owner?.username))
          .map((room) => ({
            id: `room-${room.id}`,
            title: room.name,
            meta: `${room.member_count}/${room.seat_count} · ${room.status}`,
            to: `/item-details?type=room&id=${room.id}`,
          })),
      },
      {
        key: 'games',
        title: s.groupGames,
        items: data.games
          .filter((game) => has(game.name, game.game, game.host?.username, game.status))
          .map((game) => ({
            id: `game-${game.id}`,
            title: game.name,
            meta: `${game.player_count}/${game.max_players} · ${game.status}`,
            to: `/item-details?type=game&id=${game.id}`,
          })),
      },
      {
        key: 'friends',
        title: s.groupFriends,
        items: data.friends
          .filter((friend) => has(friend.username, friend.display_name, friend.country))
          .map((friend) => ({
            id: `friend-${friend.id}`,
            title: friend.display_name || friend.username,
            meta: `@${friend.username} · ${friend.online ? 'online' : 'offline'}`,
            to: '/friends',
          })),
      },
      {
        key: 'store',
        title: s.groupStore,
        items: data.items
          .filter((item) => has(item.name, item.name_en, item.description, item.kind))
          .map((item) => ({
            id: `item-${item.id}`,
            title: item.name,
            meta: `${item.kind} · ${item.price_diamonds} diamonds / ${item.price_gold} gold`,
            to: '/store',
          })),
      },
      {
        key: 'gifts',
        title: s.groupGifts,
        items: data.gifts
          .filter((gift) => has(gift.gift?.name, gift.sender?.username, gift.receiver?.username, gift.currency))
          .map((gift) => ({
            id: `gift-${gift.id}`,
            title: gift.gift?.name || '—',
            meta: `${gift.direction} · ${gift.amount} ${gift.currency}`,
            to: `/item-details?type=gift&id=${gift.id}`,
          })),
      },
      {
        key: 'ledger',
        title: s.groupLedger,
        items: data.ledger
          .filter((entry) => has(entry.kind, entry.note, entry.ref, entry.currency))
          .map((entry) => ({
            id: `ledger-${entry.id}`,
            title: `${entry.kind} · ${entry.note || '—'}`,
            meta: `${entry.amount >= 0 ? '+' : ''}${entry.amount} ${entry.currency}`,
            to: `/item-details?type=transaction&id=${entry.id}`,
          })),
      },
      {
        key: 'alerts',
        title: s.groupNotifs,
        items: data.alerts
          .filter((alert) => has(alert.title, alert.body, alert.type))
          .map((alert) => ({
            id: `alert-${alert.id}`,
            title: alert.title,
            meta: `${alert.type} · ${new Date(alert.created_at).toLocaleString('en')}`,
            to: '/notifications',
          })),
      },
    ].filter((group) => group.items.length)
  }, [data, needle, s])

  const total = groups.reduce((sum, group) => sum + group.items.length, 0)

  return (
    <div data-testid="search-page">
      <PageBar title={s.searchTitle} back="/dashboard" testId="search" />

      <p className="muted" style={{ margin: '0 2px 12px' }}>
        {s.searchSub}
      </p>

      <div className="field" style={{ marginBottom: 12 }}>
        <input
          type="search"
          autoFocus
          value={query}
          placeholder={s.searchPlaceholder}
          aria-label={s.searchTitle}
          data-testid="search-input"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {loading && !data ? <p className="muted">{s.loading}</p> : null}
      {needle.length < 2 ? <p className="muted">{s.searchHint}</p> : null}
      {needle.length >= 2 && data ? (
        <p className="muted">
          {total} {s.results}
        </p>
      ) : null}
      {needle.length >= 2 && data && total === 0 ? <p className="notice">{s.noResults}</p> : null}

      {groups.map((group) => (
        <section key={group.key} data-testid={`search-group-${group.key}`}>
          <h2 className="section-title">
            {group.title} ({group.items.length})
          </h2>
          <div className="card glass">
            {group.items.slice(0, 12).map((item) => (
              <Link className="list-item" key={item.id} to={item.to} data-testid="search-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{item.title}</strong>
                  <div className="muted">{item.meta}</div>
                </div>
                <span className="status-pill">{s.open}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
