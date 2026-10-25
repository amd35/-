import { Link } from 'react-router-dom'
import PageBar from '../components/PageBar.jsx'
import PhotoIcon from '../components/PhotoIcon.jsx'
import { api } from '../lib/api.js'
import { useRemote } from '../lib/hooks.js'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'
import { usePageText } from '../lib/pageText.js'

/** At-a-glance summary of the signed-in account — every number comes from the API. */
export default function Dashboard() {
  const { user, wallet } = useAuth()
  const { t } = useI18n()
  const s = usePageText()

  const { data, error, loading, reload } = useRemote(async () => {
    const [vault, rooms, games, friends, unread] = await Promise.all([
      api.get('/api/wallet'),
      api.get('/api/rooms?mine=true&limit=10'),
      api.get('/api/games/rooms'),
      api.get('/api/friends'),
      api.get('/api/notifications?unread_only=true&limit=1'),
    ])
    return {
      vault,
      rooms: rooms.rooms,
      games: games.rooms,
      friends: friends.friends,
      unread: unread.unread,
    }
  })

  const xpPercent = user.next_level_xp
    ? Math.min(100, Math.round((user.xp_into_level / user.next_level_xp) * 100))
    : 0

  const tiles = [
    { key: 'coins', label: s.coins, value: wallet.coins, icon: 'coin' },
    { key: 'gold', label: s.gold, value: wallet.gold, icon: 'gold' },
    { key: 'diamonds', label: t('diamonds'), value: wallet.diamonds, icon: 'gem' },
    { key: 'level', label: s.level, value: user.level, icon: 'star' },
    { key: 'friends', label: s.friendsCount, value: data ? data.friends.length : '—', icon: 'friends' },
    { key: 'rooms', label: s.myRooms, value: data ? data.rooms.length : '—', icon: 'mic' },
    { key: 'games', label: s.openGames, value: data ? data.games.length : '—', icon: 'dice' },
    { key: 'notifications', label: s.unreadCount, value: data ? data.unread : '—', icon: 'bell' },
    {
      key: 'royal',
      label: s.royalLevel,
      value: user.royal_name || `${t('royal')} ${user.royal_level}`,
      icon: 'crown',
    },
  ]

  const links = [
    ['/data-management', s.dataManagement],
    ['/entry-form', s.entryForm],
    ['/search', t('search')],
    ['/notifications', t('notifications')],
    ['/settings', t('settings')],
    ['/system-status', s.systemStatus],
    ['/help', s.help],
    ['/contact', s.contact],
    ['/categories', s.categories],
  ]

  return (
    <div data-testid="dashboard-page">
      <PageBar title={s.dashboard} back="/" testId="dashboard">
        <button type="button" className="btn btn-small" onClick={reload} disabled={loading}>
          {s.recheck}
        </button>
      </PageBar>

      <p className="muted" style={{ margin: '0 2px 12px' }}>
        {s.dashboardSub}
      </p>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="grid-two">
        {tiles.map((tile) => (
          <div className="card glass" key={tile.key} data-testid={`metric-${tile.key}`}>
            <div className="row-between">
              <span className="muted">{tile.label}</span>
              <PhotoIcon name={tile.icon} size={18} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 6 }}>{tile.value}</div>
          </div>
        ))}
      </div>

      <div className="card glass">
        <div className="progress-label">
          <span>
            {s.level} {user.level}
          </span>
          <span>
            {user.xp_into_level}/{user.next_level_xp}
          </span>
        </div>
        <div className="progress">
          <div className="progress-fill" style={{ width: `${xpPercent}%` }} />
        </div>
        <div className="muted" style={{ marginTop: 8 }} data-testid="dashboard-royal">
          {`${t('royal')} · ${user.royal_points} ${t('royalPoints')}`}
        </div>
      </div>

      <h2 className="section-title">{s.recentMoves}</h2>
      <div className="card glass">
        {data && !data.vault.recent.length ? <p className="muted">{s.empty}</p> : null}
        {(data?.vault?.recent || []).map((entry) => (
          <Link
            className="ledger-row"
            key={entry.id}
            to={`/item-details?type=transaction&id=${entry.id}`}
            data-testid="dashboard-ledger-row"
          >
            <span>
              {entry.kind}
              {entry.note ? ` · ${entry.note}` : ''}
            </span>
            <span className={entry.amount >= 0 ? 'amount-in' : 'amount-out'}>
              {entry.amount >= 0 ? '+' : ''}
              {entry.amount}
            </span>
          </Link>
        ))}
      </div>

      <h2 className="section-title">{s.latestRooms}</h2>
      <div className="card glass">
        {data && !data.rooms.length ? <p className="muted">{s.empty}</p> : null}
        {(data?.rooms || []).map((room) => (
          <Link className="list-item" key={room.id} to={`/item-details?type=room&id=${room.id}`}>
            <PhotoIcon name="mic" size={26} />
            <div>
              <strong>{room.name}</strong>
              <div className="muted">
                {room.member_count}/{room.seat_count} · {room.status}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <h2 className="section-title">{s.liveTables}</h2>
      <div className="card glass">
        {data && !data.games.length ? <p className="muted">{s.empty}</p> : null}
        {(data?.games || []).map((game) => (
          <Link className="list-item" key={game.id} to={`/item-details?type=game&id=${game.id}`}>
            <PhotoIcon name={game.game === 'ludo' ? 'dice' : 'domino'} size={26} />
            <div>
              <strong>{game.name}</strong>
              <div className="muted">
                {game.player_count}/{game.max_players} · {game.status}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <h2 className="section-title">{s.quickLinks}</h2>
      <div className="card glass row wrap">
        {links.map(([to, label]) => (
          <Link className="btn" key={to} to={to}>
            {label}
          </Link>
        ))}
        {user.is_admin ? (
          <Link className="btn" to="/activity-log">
            {s.activityLog}
          </Link>
        ) : null}
      </div>
    </div>
  )
}
