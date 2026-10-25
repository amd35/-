import { useEffect, useRef, useState } from 'react'
import Avatar from './Avatar.jsx'
import PhotoIcon from './PhotoIcon.jsx'
import { useI18n } from '../lib/i18n.jsx'

/** مقعد الشريحة: صورة عضو حقيقي تُفتح في بطاقته، أو إطار فارغ عندما لا يوجد عضو بعد. */
function MemberSlot({ member, onOpenUser }) {
  const { t } = useI18n()
  if (!member) {
    return (
      <span className="home-slide-person is-empty" aria-hidden="true">
        <span className="home-slide-empty-ring" />
        <span className="home-slide-person-name">{t('seatFree')}</span>
      </span>
    )
  }
  return (
    <button
      type="button"
      className="home-slide-person"
      onClick={() => onOpenUser(member)}
      data-testid={`home-slide-member-${member.id}`}
    >
      <Avatar user={member} size={54} />
      <span className="home-slide-person-name">{member.display_name || member.username}</span>
    </button>
  )
}

/**
 * الشريط الدوّار: شريحة لكل غرفة حقيقية — صورتا أول عضوين على الجانبين، والشعار
 * الذهبي في الوسط، وصورة خلفية الغرفة نفسها. النقاط تتبع التمرير (تعمل في RTL وLTR).
 */
export default function HomeHero({ rooms, onOpenRoom, onOpenUser, onCreate }) {
  const { t } = useI18n()
  const trackRef = useRef(null)
  const [index, setIndex] = useState(0)

  // غرف جديدة (تبويب آخر أو دولة أخرى) → ابدأ من الشريحة الأولى.
  useEffect(() => {
    setIndex(0)
    if (trackRef.current) trackRef.current.scrollLeft = 0
  }, [rooms])

  const onScroll = () => {
    const track = trackRef.current
    if (!track || !track.children.length) return
    const bounds = track.getBoundingClientRect()
    const center = bounds.left + bounds.width / 2
    let nearest = 0
    let best = Number.POSITIVE_INFINITY
    Array.from(track.children).forEach((child, childIndex) => {
      const childBounds = child.getBoundingClientRect()
      const distance = Math.abs(childBounds.left + childBounds.width / 2 - center)
      if (distance < best) {
        best = distance
        nearest = childIndex
      }
    })
    setIndex(nearest)
  }

  const goTo = (target) => {
    trackRef.current?.children[target]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  if (!rooms.length) {
    return (
      <section className="home-hero home-hero-empty" aria-label={t('rooms')}>
        <p className="muted">{t('noRooms')}</p>
        <button type="button" className="btn btn-primary" onClick={onCreate} data-testid="home-create-room">
          {t('createRoom')}
        </button>
      </section>
    )
  }

  return (
    <section className="home-hero" aria-label={t('rooms')}>
      <div className="home-hero-track" ref={trackRef} onScroll={onScroll} data-testid="home-hero-track">
        {rooms.map((room) => (
          <article
            className="home-slide"
            key={room.id}
            data-testid={`home-slide-${room.id}`}
            style={
              room.background_url
                ? { backgroundImage: `linear-gradient(180deg, rgba(24, 6, 8, 0.34), rgba(10, 3, 4, 0.86)), url(${room.background_url})` }
                : undefined
            }
          >
            <div className="home-slide-stage">
              <MemberSlot member={room.members?.[0]} onOpenUser={onOpenUser} />
              <button
                type="button"
                className="home-slide-crest"
                onClick={() => onOpenRoom(room)}
                data-testid={`home-slide-open-${room.id}`}
                aria-label={room.name}
              >
                <span className="home-crest">CP</span>
              </button>
              <MemberSlot member={room.members?.[1]} onOpenUser={onOpenUser} />
            </div>
            <button type="button" className="home-slide-caption" onClick={() => onOpenRoom(room)}>
              <span className="home-slide-name">{room.name}</span>
              <span className="home-slide-meta">
                <PhotoIcon name="mic" size={14} />
                {`${room.member_count} ${t('members')}`}
                <span className="home-slide-sep">·</span>
                {`${t('roomNumber')} ${room.number}`}
              </span>
            </button>
          </article>
        ))}
      </div>
      {rooms.length > 1 ? (
        <div className="home-hero-dots">
          {rooms.map((room, dotIndex) => (
            <button
              key={room.id}
              type="button"
              className={`home-hero-dot${dotIndex === index ? ' is-active' : ''}`}
              aria-label={`slide-${dotIndex + 1}`}
              onClick={() => goTo(dotIndex)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}
