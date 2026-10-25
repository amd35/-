import PhotoIcon from './PhotoIcon.jsx'
import { useI18n } from '../lib/i18n.jsx'

export default function SeatGrid({ room, me, onSeatClick, onMemberClick, myMember }) {
  const { t } = useI18n()
  if (!room) return null

  const bySeat = new Map()
  ;(room.members || []).forEach((member) => {
    if (member.seat_index !== null && member.seat_index !== undefined) bySeat.set(member.seat_index, member)
  })
  const locked = new Set(room.locked_seats || [])
  const seats = Array.from({ length: room.seat_count }, (_, index) => index)

  return (
    <div className="seat-grid" data-testid="seat-grid">
      {seats.map((seat) => {
        const member = bySeat.get(seat)
        const isOwnerSeat = seat === 0
        const isLocked = locked.has(seat)
        const classes = [
          'seat',
          isOwnerSeat ? 'seat-owner' : '',
          isLocked ? 'seat-locked' : '',
          member && me && member.user.id === me.id ? 'seat-mine' : '',
          member && member.mic_on ? 'seat-speaking' : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <button
            type="button"
            key={seat}
            className={classes}
            data-testid={`seat-${seat}`}
            onClick={() => (member ? onMemberClick?.(member) : onSeatClick?.(seat))}
          >
            <span className="seat-number">{seat + 1}</span>
            {isOwnerSeat ? (
              <span className="seat-crown">
                <PhotoIcon name="crown" size={16} />
              </span>
            ) : null}
            {member ? (
              <>
                <span className="avatar" style={{ width: 38, height: 38 }}>
                  {member.user.avatar_url ? (
                    <img src={member.user.avatar_url} alt={member.user.display_name} />
                  ) : (
                    (member.user.display_name || member.user.username).slice(0, 2)
                  )}
                </span>
                <span className="seat-name">{member.user.display_name || member.user.username}</span>
                <span className="seat-mic">
                  {member.mic_on ? (
                    <PhotoIcon name="mic" size={15} />
                  ) : member.hand_raised ? (
                    <PhotoIcon name="hand" size={15} />
                  ) : (
                    <PhotoIcon name="mic" size={15} className="photo-icon-dim" />
                  )}
                </span>
                {member.user.vip ? <span className="vip-badge">VIP</span> : null}
              </>
            ) : (
              <>
                <span className="seat-mic">
                  <PhotoIcon name={isLocked ? 'lock' : 'mic'} size={22} />
                </span>
                <span className="seat-name muted">{isLocked ? t('locked') : t('seats')}</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}
