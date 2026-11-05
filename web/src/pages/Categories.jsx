import { Link } from 'react-router-dom'
import PageBar from '../components/PageBar.jsx'
import PhotoIcon from '../components/PhotoIcon.jsx'
import { api } from '../lib/api.js'
import { useRemote } from '../lib/hooks.js'
import { BACKGROUND_LABELS, usePageText } from '../lib/pageText.js'
import { useI18n } from '../lib/i18n.jsx'

/** Grouped browsing: store items, gifts, room backgrounds and games. */
export default function Categories() {
  const s = usePageText()
  const { lang } = useI18n()

  // اسم الخلفية يأتي من الخادم مع كل غرفة (`background_name_ar/en`)،
  // والقاموس القديم يبقى احتياطاً لثيمات التدرّج.
  const backgroundLabel = (rooms, slug) =>
    (lang === 'en' ? rooms[0]?.background_name_en : rooms[0]?.background_name_ar) ||
    BACKGROUND_LABELS[lang]?.[slug] ||
    BACKGROUND_LABELS.ar[slug] ||
    slug

  const { data, error, loading } = useRemote(async () => {
    const [cosmetics, gifts, rooms, catalog] = await Promise.all([
      api.get('/api/store/cosmetics'),
      api.get('/api/gifts'),
      api.get('/api/rooms?limit=50'),
      api.get('/api/games/catalog'),
    ])
    return { cosmetics, gifts, rooms: rooms.rooms, catalog }
  })

  const byKind = (kind) => (data?.cosmetics.items || []).filter((item) => item.kind === kind)
  const giftCategories = Object.entries(data?.gifts.groups || {})
  const backgrounds = Object.entries(
    (data?.rooms || []).reduce((groups, room) => {
      const key = room.background || 'sunset'
      groups[key] = groups[key] || []
      groups[key].push(room)
      return groups
    }, {}),
  )

  return (
    <div data-testid="categories-page">
      <PageBar title={s.categories} back="/dashboard" testId="categories" />

      <p className="muted" style={{ margin: '0 2px 12px' }}>
        {s.categoriesSub}
      </p>

      {error ? <p className="error-text">{error}</p> : null}
      {loading && !data ? <p className="muted">{s.loading}</p> : null}

      <h2 className="section-title">
        <PhotoIcon name="bag" size={18} /> {s.catStore}
      </h2>
      {['dice', 'theme'].map((kind) => {
        const items = byKind(kind)
        if (!items.length) return null
        return (
          <div className="card glass" key={kind} data-testid={`category-${kind}`}>
            <div className="row-between">
              <strong>{kind === 'dice' ? s.catStore : kind}</strong>
              <span className="chip">
                {items.length} {s.items}
              </span>
            </div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              {items.slice(0, 8).map((item) => (
                <span className="badge-pill" key={item.id}>
                  {item.name} · {item.price_diamonds}/{item.price_gold}
                </span>
              ))}
            </div>
            <Link className="btn" style={{ marginTop: 10 }} to="/store">
              {s.browse}
            </Link>
          </div>
        )
      })}

      <h2 className="section-title">
        <PhotoIcon name="gift" size={18} /> {s.catGifts}
      </h2>
      {giftCategories.map(([category, gifts]) => (
        <div className="card glass" key={category} data-testid={`category-gift-${category}`}>
          <div className="row-between">
            <strong>{category}</strong>
            <span className="chip">
              {gifts.length} {s.items}
            </span>
          </div>
          <div className="row wrap" style={{ marginTop: 8 }}>
            {gifts.slice(0, 8).map((gift) => (
              <span className="badge-pill" key={gift.id}>
                {gift.name} · {gift.price_diamonds || gift.price_gold}
              </span>
            ))}
          </div>
          <Link className="btn" style={{ marginTop: 10 }} to="/rooms">
            {s.browse}
          </Link>
        </div>
      ))}

      <h2 className="section-title">
        <PhotoIcon name="palette" size={18} /> {s.catRoomsByBg}
      </h2>
      {backgrounds.map(([background, rooms]) => (
        <div className="card glass" key={background} data-testid={`category-bg-${background}`}>
          <div className="row-between">
            <strong>{backgroundLabel(rooms, background)}</strong>
            <span className="chip">
              {rooms.length} {s.items}
            </span>
          </div>
          {rooms.slice(0, 3).map((room) => (
            <Link className="list-item" key={room.id} to={`/item-details?type=room&id=${room.id}`}>
              <PhotoIcon name="mic" size={22} />
              <div style={{ minWidth: 0 }}>
                <strong>{room.name}</strong>
                <div className="muted">
                  {room.member_count}/{room.seat_count}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ))}

      <h2 className="section-title">
        <PhotoIcon name="dice" size={18} /> {s.catGames}
      </h2>
      <div className="card glass" data-testid="category-games">
        {(data?.catalog.games || []).map((game) => (
          <div className="ledger-row" key={game.key}>
            <span>
              {game.name} · {game.min_players}-{game.max_players}
            </span>
            <span className={`status-pill status-${game.enabled ? 'paid' : 'pending'}`}>
              {game.enabled ? s.configured : s.notConfigured}
            </span>
          </div>
        ))}
        <Link className="btn" style={{ marginTop: 10 }} to="/games">
          {s.browse}
        </Link>
      </div>
    </div>
  )
}
