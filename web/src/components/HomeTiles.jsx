import { useNavigate } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import { useI18n } from '../lib/i18n.jsx'
import { countryName, flagUrl } from '../lib/flags.js'

/**
 * شبكة البطاقات الكبيرة (2×2) أسفل الصفحة الرئيسية:
 * غرفة الأنشطة الرسمية، الأعضاء الجدد، الأكثر متابعة، وخدمة العملاء.
 * كل صورة واسم ورقم من الخادم، وكل زر يؤدي وظيفته الحقيقية.
 */
function FlagBadge({ country }) {
  const { lang } = useI18n()
  const url = flagUrl(country)
  if (!url) return null
  return <img className="home-tile-flag" src={url} alt={countryName(country, lang)} loading="lazy" />
}

function AvatarRow({ users, onOpenUser, max = 4 }) {
  if (!users.length) return <span className="home-tile-empty">—</span>
  return (
    <div className="home-tile-avatars">
      {users.slice(0, max).map((member) => (
        <button
          type="button"
          className="home-tile-avatar"
          key={member.id}
          onClick={() => onOpenUser(member)}
          title={member.display_name || member.username}
          data-testid={`home-tile-user-${member.id}`}
        >
          <Avatar user={member} size={34} />
        </button>
      ))}
      {users.length > max ? <span className="home-tile-more">{`+${users.length - max}`}</span> : null}
    </div>
  )
}

function ActivityTile({ room, onOpenRoom, onOpenUser }) {
  const { t } = useI18n()
  if (!room) {
    return (
      <article className="home-tile is-empty" data-testid="home-tile-activity">
        <img className="home-tile-media" src="/img/bg/stage.jpg" alt="" loading="lazy" />
        <div className="home-tile-body">
          <span className="home-tile-name">{t('officialRoom')}</span>
          <span className="home-tile-sub">{t('notYet')}</span>
        </div>
      </article>
    )
  }
  return (
    <article className="home-tile" data-testid="home-tile-activity">
      <img className="home-tile-media" src={room.background_url || '/img/bg/stage.jpg'} alt="" loading="lazy" />
      <FlagBadge country={room.owner?.country} />
      <div className="home-tile-body">
        <span className="home-tile-name">{t('officialRoom')}</span>
        <span className="home-tile-sub">{room.name}</span>
        <AvatarRow users={room.members || []} onOpenUser={onOpenUser} />
        <button
          type="button"
          className="home-tile-cta"
          onClick={() => onOpenRoom(room)}
          data-testid="home-tile-activity-open"
        >
          {t('joinNow')}
        </button>
      </div>
    </article>
  )
}

export default function HomeTiles({ activityRoom, newUsers, topUsers, user, country, onOpenUser, onOpenRoom }) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const supportFlag = flagUrl(user?.country)
  const followers = topUsers.reduce((total, entry) => total + (entry.followers || 0), 0)

  // ترتيب البطاقات كما في التصميم من اليسار: الأنشطة أعلى اليسار، والمستخدمون الجدد
  // أعلى اليمين، وخدمة العملاء أسفل اليمين، ولوحة الصور أسفل اليسار.
  return (
    <section className="home-grid">
      <article className="home-tile" data-testid="home-tile-new-users">
        <img className="home-tile-media" src="/img/bg/bokeh.jpg" alt="" loading="lazy" />
        {country ? <FlagBadge country={country} /> : null}
        <div className="home-tile-body">
          <span className="home-tile-name">{t('newUsers')}</span>
          <span className="home-tile-sub">
            {newUsers.length ? `${newUsers.length} ${t('members')}` : t('notYet')}
          </span>
          <AvatarRow users={newUsers} onOpenUser={onOpenUser} max={5} />
        </div>
      </article>

      <ActivityTile room={activityRoom} onOpenRoom={onOpenRoom} onOpenUser={onOpenUser} />

      <article className="home-tile home-tile-support" data-testid="home-tile-support">
        <img className="home-tile-media" src="/img/bg/gold.jpg" alt="" loading="lazy" />
        <div className="home-tile-body">
          <span className="home-tile-brand">{t('appName')}</span>
          <span className="home-tile-id">{`ID ${user?.id ?? '—'}`}</span>
          <span className="home-tile-support-row">
            <button
              type="button"
              className="home-tile-cta"
              onClick={() => navigate('/contact')}
              data-testid="home-tile-support-open"
            >
              {t('customerService')}
            </button>
            {supportFlag ? <img className="home-tile-flag is-inline" src={supportFlag} alt={countryName(user.country, lang)} /> : null}
          </span>
        </div>
      </article>

      <article className="home-tile home-tile-collage" data-testid="home-tile-top">
        <div className="home-tile-collage-grid">
          {topUsers.length === 0 ? <span className="home-tile-empty">—</span> : null}
          {topUsers.map((entry) => (
            <button
              type="button"
              className="home-tile-avatar"
              key={entry.id}
              onClick={() => onOpenUser(entry)}
              title={entry.display_name || entry.username}
              data-testid={`home-collage-user-${entry.id}`}
            >
              <Avatar user={entry} size={40} />
            </button>
          ))}
        </div>
        <div className="home-tile-body">
          <span className="home-tile-name">{t('topFollowed')}</span>
          <span className="home-tile-sub">{`${followers} ${t('followers')}`}</span>
        </div>
      </article>
    </section>
  )
}
