import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import PageNav from '../components/PageNav.jsx'
import PhotoIcon, { giftIconName } from '../components/PhotoIcon.jsx'
import GiftSheet from '../components/GiftSheet.jsx'
import ProfileEditSheet from '../components/ProfileEditSheet.jsx'
import ProfileSheet from '../components/ProfileSheet.jsx'
import ProfileWalletSheet from '../components/ProfileWalletSheet.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

/**
 * الملف الشخصي: هوية العضو والأرقام الحقيقية (متابعون/يتابع/أصدقاء)، والرصيد من
 * `/api/wallet`، والمستوى ورويال من الخادم. لا رقم ثابت في هذه الصفحة:
 * كل قيمة تُقرأ من `/api/*` (متابعة، أصدقاء، حظر، هدايا، محفظة).
 */
export default function Profile() {
  const { user, wallet, refresh, unread, logout } = useAuth()
  const { t } = useI18n()
  const [counts, setCounts] = useState({ followers: 0, following: 0 })
  const [friends, setFriends] = useState([])
  const [people, setPeople] = useState({ mode: 'followers', title: '', users: [] })
  const [blocked, setBlocked] = useState([])
  const [gifts, setGifts] = useState([])
  const [giftTo, setGiftTo] = useState(null)
  const [sheet, setSheet] = useState('')
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [summary, friendData] = await Promise.all([api.get('/api/follows/summary'), api.get('/api/friends')])
      setCounts(summary)
      setFriends(friendData.friends)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const listTitle = (mode) => (mode === 'followers' ? t('followers') : t('following'))

  const openPeople = async (mode) => {
    setSheet('people')
    setPeople({ mode, title: listTitle(mode), users: [] })
    try {
      const data = await api.get(`/api/follows/${user.id}/${mode}`)
      setCounts(data.counts)
      setPeople({ mode, title: listTitle(mode), users: data.users })
    } catch (err) {
      setError(err.message)
    }
  }

  const unfollow = async (target) => {
    try {
      const data = await api.del(`/api/follows/${target.id}`)
      setCounts(data.summary)
      setPeople((previous) => ({ ...previous, users: previous.users.filter((row) => row.id !== target.id) }))
    } catch (err) {
      setError(err.message)
    }
  }

  const openBlocked = async () => {
    setSheet('blocked')
    try {
      const data = await api.get('/api/blocks')
      setBlocked(data.blocked)
    } catch (err) {
      setError(err.message)
    }
  }

  const unblock = async (target) => {
    try {
      await api.del(`/api/blocks/${target.id}`)
      setBlocked((rows) => rows.filter((row) => row.id !== target.id))
    } catch (err) {
      setError(err.message)
    }
  }

  const openGifts = async () => {
    setSheet('gifts')
    try {
      const data = await api.get('/api/gifts/history?limit=30')
      setGifts(data.transactions)
    } catch (err) {
      setError(err.message)
    }
  }

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(String(user.id))
      setCopied(true)
      setMessage('تم نسخ المعرّف')
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError('تعذّر النسخ على هذا المتصفح')
    }
  }

  return (
    <div className="profile-screen" data-testid="profile-page">
      <header className="profile-head">
        <span className="profile-head-side" />
        <h1 className="profile-head-title">{t('me')}</h1>
        <Link className="profile-bell" to="/notifications" aria-label={t('notifications')} data-testid="profile-bell">
          <PhotoIcon name="bell" size={22} />
          {unread ? <span className="profile-bell-badge">{unread}</span> : null}
        </Link>
      </header>

      <section className="profile-identity" data-testid="profile-card">
        <button
          type="button"
          className="profile-avatar"
          onClick={() => setSheet('edit')}
          aria-label={t('avatar')}
          data-testid="profile-avatar"
        >
          <Avatar user={user} size={84} />
        </button>
        <div className="profile-identity-text">
          <div className="profile-name-row">
            <strong className="profile-name" data-testid="profile-name">
              {user.display_name || user.username}
            </strong>
            {user.country ? <span className="profile-country">{user.country}</span> : null}
          </div>
          <button type="button" className="profile-id" onClick={copyId} data-testid="profile-id">
            <span>ID: {user.id}</span>
            <span className="profile-id-copy">{copied ? 'تم النسخ ✓' : 'نسخ'}</span>
          </button>
          <div className="profile-pills">
            <span className="badge-pill" data-testid="profile-royal">
              {user.royal_name || `${t('royal')} ${user.royal_level}`}
            </span>
            <span className="badge-pill" data-testid="profile-level-pill">
              {t('level')} {user.level}
            </span>
            {user.badges.map((badge) => (
              <span className="badge-pill" key={badge}>
                {badge}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="profile-more"
          onClick={() => setSheet('menu')}
          aria-label={t('settings')}
          data-testid="profile-more"
        >
          ⋯
        </button>
      </section>

      <section className="profile-stats" data-testid="profile-stats">
        <button type="button" className="profile-stat" onClick={() => openPeople('followers')} data-testid="stat-followers">
          <span className="profile-stat-value">{counts.followers}</span>
          <span className="profile-stat-label">{t('followers')}</span>
        </button>
        <button type="button" className="profile-stat" onClick={() => openPeople('following')} data-testid="stat-following">
          <span className="profile-stat-value">{counts.following}</span>
          <span className="profile-stat-label">{t('following')}</span>
        </button>
        <button type="button" className="profile-stat" onClick={() => setSheet('friends')} data-testid="stat-friends">
          <span className="profile-stat-value">{friends.length}</span>
          <span className="profile-stat-label">{t('friends')}</span>
        </button>
      </section>

      <section className="profile-cards">
        <Link className="profile-privilege" to="/royal" data-testid="profile-royal-card">
          <span className="profile-privilege-title">{user.royal_name || t('royal')}</span>
          <span className="profile-privilege-row">
            <PhotoIcon name="crown" size={18} />
            <span>{t('royalRanksBenefits')}</span>
          </span>
        </Link>
        <Link className="profile-privilege" to="/recharge" data-testid="profile-recharge-card">
          <span className="profile-privilege-title">{t('recharge')}</span>
          <span className="profile-privilege-row">
            <PhotoIcon name="star" size={18} />
            <span>{t('rechargeBenefits')}</span>
          </span>
        </Link>
      </section>

      <button type="button" className="profile-wallet" onClick={() => setSheet('wallet')} data-testid="profile-wallet-row">
        <span className="profile-wallet-icon">
          <PhotoIcon name="wallet" size={26} />
        </span>
        <span className="profile-wallet-label">{t('wallet')}</span>
        <span className="topbar-spacer" />
        <span className="profile-chip profile-chip-gold">
          <PhotoIcon name="gold" size={15} /> {wallet.gold}
        </span>
        <span className="profile-chip profile-chip-gem">
          <PhotoIcon name="gem" size={15} /> {wallet.diamonds}
        </span>
      </button>

      <section className="profile-icon-grid">
        <Link className="profile-icon-cell" to="/store" data-testid="profile-appearance">
          <span className="profile-icon-plate">
            <PhotoIcon name="cart" size={28} />
          </span>
          <span>{t('appearance')}</span>
        </Link>
        <button type="button" className="profile-icon-cell" onClick={() => setSheet('level')} data-testid="profile-level">
          <span className="profile-icon-plate">
            <PhotoIcon name="trophy" size={28} />
          </span>
          <span>{t('level')}</span>
        </button>
        <button type="button" className="profile-icon-cell" onClick={() => setSheet('badges')} data-testid="profile-medal">
          <span className="profile-icon-plate">
            <PhotoIcon name="star" size={28} />
          </span>
          <span>{t('medal')}</span>
        </button>
      </section>

      <section className="profile-rows">
        <Link className="profile-row" to="/store" data-testid="row-store">
          <span className="profile-row-icon">
            <PhotoIcon name="bag" size={22} />
          </span>
          <span className="profile-row-label">{t('store')}</span>
          <span className="topbar-spacer" />
          <span className="profile-row-chevron">‹</span>
        </Link>
        <Link className="profile-row" to="/rooms" data-testid="row-rooms">
          <span className="profile-row-icon">
            <PhotoIcon name="mic" size={22} />
          </span>
          <span className="profile-row-label">{t('rooms')}</span>
          <span className="topbar-spacer" />
          <span className="profile-row-chevron">‹</span>
        </Link>
        <button type="button" className="profile-row" onClick={openGifts} data-testid="row-gifts">
          <span className="profile-row-icon">
            <PhotoIcon name="gift" size={22} />
          </span>
          <span className="profile-row-label">{t('gifts')}</span>
          <span className="topbar-spacer" />
          <span className="profile-row-chevron">‹</span>
        </button>
        <Link className="profile-row" to="/search" data-testid="row-explore">
          <span className="profile-row-icon">
            <PhotoIcon name="friends" size={22} />
          </span>
          <span className="profile-row-label">{t('explore')}</span>
          <span className="topbar-spacer" />
          <span className="profile-row-chevron">‹</span>
        </Link>
        <button type="button" className="profile-row" onClick={openBlocked} data-testid="row-blocked">
          <span className="profile-row-icon">
            <PhotoIcon name="lock" size={22} />
          </span>
          <span className="profile-row-label">{t('blocked')}</span>
          <span className="topbar-spacer" />
          <span className="profile-row-chevron">‹</span>
        </button>
        <Link className="profile-row" to="/contact" data-testid="row-agents">
          <span className="profile-row-icon">
            <PhotoIcon name="hand" size={22} />
          </span>
          <span className="profile-row-label">{t('agents')}</span>
          <span className="topbar-spacer" />
          <span className="profile-row-chevron">‹</span>
        </Link>
        <Link className="profile-row" to="/settings" data-testid="row-settings">
          <span className="profile-row-icon">
            <PhotoIcon name="palette" size={22} />
          </span>
          <span className="profile-row-label">{t('settings')}</span>
          <span className="topbar-spacer" />
          <span className="profile-row-chevron">‹</span>
        </Link>
      </section>

      <PageNav testIdPrefix="profile-nav" />

      {sheet === 'menu' ? (
        <ProfileSheet title={t('profile')} icon="user" onClose={() => setSheet('')} testId="profile-menu-sheet">
          <button type="button" className="btn btn-block" onClick={() => setSheet('edit')} data-testid="profile-open-edit">
            {t('editProfile')}
          </button>
          <button type="button" className="btn btn-block" style={{ marginTop: 8 }} onClick={() => setSheet('wallet')}>
            {t('wallet')} — {t('ledger')}
          </button>
          <Link className="btn btn-block" style={{ marginTop: 8, textAlign: 'center' }} to="/notifications">
            {t('notifications')}
          </Link>
          <Link className="btn btn-block" style={{ marginTop: 8, textAlign: 'center' }} to="/help">
            مركز المساعدة
          </Link>
          <Link className="btn btn-block" style={{ marginTop: 8, textAlign: 'center' }} to="/settings" data-testid="profile-open-settings">
            {t('settings')}
          </Link>
          <button
            type="button"
            className="btn btn-danger btn-block"
            style={{ marginTop: 8 }}
            data-testid="profile-logout"
            onClick={() => logout()}
          >
            {t('logout')}
          </button>
        </ProfileSheet>
      ) : null}

      {sheet === 'edit' ? <ProfileEditSheet user={user} onSaved={refresh} onClose={() => setSheet('')} /> : null}

      {sheet === 'wallet' ? <ProfileWalletSheet onClose={() => setSheet('')} /> : null}

      {sheet === 'people' ? (
        <ProfileSheet
          title={`${people.title} (${people.users.length})`}
          icon="user"
          onClose={() => setSheet('')}
          testId="profile-people-sheet"
        >
          {people.users.length === 0 ? <p className="muted">{t('notYet')}</p> : null}
          {people.users.map((person) => (
            <div className="list-item" key={person.id}>
              <Avatar user={person} size={36} />
              <div>
                <strong>{person.display_name || person.username}</strong>
                <div className="muted">
                  @{person.username} · {t('level')} {person.level}
                </div>
              </div>
              <div className="topbar-spacer" />
              <Link className="btn" to="/friends">
                {t('sendMessage')}
              </Link>
              {people.mode === 'following' ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => unfollow(person)}
                  data-testid={`unfollow-${person.id}`}
                >
                  {t('unfollow')}
                </button>
              ) : null}
            </div>
          ))}
        </ProfileSheet>
      ) : null}

      {sheet === 'friends' ? (
        <ProfileSheet
          title={`${t('friends')} (${friends.length})`}
          icon="friends"
          onClose={() => setSheet('')}
          testId="profile-friends-sheet"
        >
          {friends.length === 0 ? <p className="muted">{t('notYet')}</p> : null}
          {friends.map((friend) => (
            <div className="list-item" key={friend.id}>
              <Avatar user={friend} size={36} />
              <div>
                <strong>{friend.display_name || friend.username}</strong>
                <div className="muted">
                  <PhotoIcon name={friend.online ? 'dotOn' : 'dotOff'} size={12} />{' '}
                  {friend.online ? t('online') : t('offline')}
                </div>
              </div>
              <div className="topbar-spacer" />
              <Link className="btn" to="/friends">
                {t('sendMessage')}
              </Link>
              <button type="button" className="btn btn-accent" onClick={() => setGiftTo(friend)} data-testid={`gift-to-${friend.id}`}>
                {t('sendGift')}
              </button>
            </div>
          ))}
        </ProfileSheet>
      ) : null}

      {sheet === 'blocked' ? (
        <ProfileSheet title={`${t('blocked')} (${blocked.length})`} icon="lock" onClose={() => setSheet('')} testId="profile-blocked-sheet">
          {blocked.length === 0 ? <p className="muted">{t('notYet')}</p> : null}
          {blocked.map((person) => (
            <div className="list-item" key={person.id}>
              <Avatar user={person} size={36} />
              <span>{person.display_name || person.username}</span>
              <div className="topbar-spacer" />
              <button type="button" className="btn" onClick={() => unblock(person)} data-testid={`unblock-${person.id}`}>
                إلغاء الحظر
              </button>
            </div>
          ))}
        </ProfileSheet>
      ) : null}

      {sheet === 'gifts' ? (
        <ProfileSheet title={t('gifts')} icon="gift" onClose={() => setSheet('')} testId="profile-gifts-sheet">
          {gifts.length === 0 ? <p className="muted">{t('notYet')}</p> : null}
          {gifts.map((row) => (
            <div className="ledger-row" key={row.id}>
              <span>
                <PhotoIcon name={giftIconName(row.gift?.emoji)} size={16} /> {row.gift?.name || '—'} ·{' '}
                {row.direction === 'sent' ? `إلى ${row.receiver?.username || '—'}` : `من ${row.sender?.username || '—'}`}
              </span>
              <span className="amount-out">
                {row.amount} <PhotoIcon name={row.currency === 'gold' ? 'gold' : 'gem'} size={13} />
              </span>
            </div>
          ))}
          <Link className="btn btn-block" style={{ marginTop: 10, textAlign: 'center' }} to="/friends">
            اختر صديقًا لإرسال هدية
          </Link>
        </ProfileSheet>
      ) : null}

      {sheet === 'level' ? (
        <ProfileSheet title={t('level')} icon="trophy" onClose={() => setSheet('')} testId="profile-level-sheet">
          <div className="profile-level-line">
            <span className="muted">{t('level')}</span>
            <strong data-testid="level-value">{user.level}</strong>
          </div>
          <div className="profile-level-line">
            <span className="muted">{t('xp')}</span>
            <strong>
              {user.xp_into_level}/{user.next_level_xp}
            </strong>
          </div>
          <div className="progress" style={{ marginTop: 8 }}>
            <div
              className="progress-fill"
              style={{ width: `${Math.min(100, Math.round((user.xp_into_level / Math.max(user.next_level_xp, 1)) * 100))}%` }}
            />
          </div>
          <div className="profile-level-line" style={{ marginTop: 12 }}>
            <span className="muted">{t('royal')}</span>
            <strong data-testid="royal-value">
              {user.royal_name || `${t('royal')} ${user.royal_level}`} · {user.royal_points}
            </strong>
          </div>
          <Link className="btn btn-primary btn-block" style={{ marginTop: 10, textAlign: 'center' }} to="/royal">
            {t('royalRanksBenefits')}
          </Link>
        </ProfileSheet>
      ) : null}

      {sheet === 'badges' ? (
        <ProfileSheet title={t('badges')} icon="star" onClose={() => setSheet('')} testId="profile-badges-sheet">
          {user.badges.length === 0 ? <p className="muted">{t('notYet')}</p> : null}
          <div className="row wrap">
            {user.badges.map((badge) => (
              <span className="badge-pill" key={badge} data-testid="badge-pill">
                {badge}
              </span>
            ))}
          </div>
        </ProfileSheet>
      ) : null}

      {giftTo ? (
        <GiftSheet
          room={null}
          members={[{ user: giftTo }]}
          initialReceiverId={giftTo.id}
          onClose={() => setGiftTo(null)}
          onSent={(result) => {
            setMessage('تم إرسال الهدية')
            setGiftTo(null)
            void result
          }}
        />
      ) : null}

      {message ? (
        <p className="success-text" data-testid="profile-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="error-text" data-testid="profile-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
