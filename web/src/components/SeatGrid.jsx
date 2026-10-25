import PhotoIcon from './PhotoIcon.jsx'
import { useI18n } from '../lib/i18n.jsx'

/**
 * منصة صوتية بـ 12 مقعداً: الصعود مباشر إلى أي مقعد فارغ، والمايك مكتوم افتراضياً.
 * المؤشر الحوّل صورة المستخدم يظهر عند الكلام الفعلي (قياس مستوى الصوت).
 */
export default function SeatGrid({ room, me, onSeatClick, onMemberClick, speaking = {}, onUnseat }) {
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
        const isLocked = locked.has(seat)
        const isMine = Boolean(member && me && member.user.id === me.id)
        const isOwnerSeat = Boolean(member && room.owner && member.user.id === room.owner.id)
        const isTalking = Boolean(member && member.mic_on && speaking[member.user.id])
        const classes = [
          'seat',
          member ? 'seat-taken' : 'seat-empty',
          isLocked ? 'seat-locked' : '',
          isMine ? 'seat-mine' : '',
          member && member.mic_on ? 'seat-live' : '',
          isTalking ? 'seat-speaking' : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <div className="seat-cell" key={seat}>
            <button
              type="button"
              className={classes}
              data-testid={`seat-${seat}`}
              data-speaking={isTalking ? 'true' : 'false'}
              onClick={() => (member ? onMemberClick?.(member) : onSeatClick?.(seat))}
              disabled={isLocked && !member}
            >
              <span className="seat-number">{seat + 1}</span>
              {isOwnerSeat ? (
                <span className="seat-crown">
                  <PhotoIcon name="crown" size={14} />
                </span>
              ) : null}
              {member ? (
                <>
                  <span className={`seat-avatar${isTalking ? ' seat-avatar-speaking' : ''}`}>
                    {member.user.avatar_url ? (
                      <img src={member.user.avatar_url} alt={member.user.display_name} />
                    ) : (
                      (member.user.display_name || member.user.username).slice(0, 2)
                    )}
                  </span>
                  <span className="seat-name">{member.user.display_name || member.user.username}</span>
                  <span className="seat-mic" title={member.mic_on ? t('micOn') : t('micOff')}>
                    {member.mic_on ? (
                      <PhotoIcon name="mic" size={15} />
                    ) : (
                      <PhotoIcon name="mic" size={15} className="photo-icon-dim" />
                    )}
                  </span>
                </>
              ) : (
                <>
                  <span className="seat-mic">
                    <PhotoIcon name={isLocked ? 'lock' : 'mic'} size={20} className="photo-icon-dim" />
                  </span>
                  <span className="seat-name muted">{isLocked ? t('locked') : t('seatFree')}</span>
                </>
              )}
            </button>
            {isMine && member?.seat_index !== null ? (
              <button
                type="button"
                className="seat-down"
                data-testid={`seat-down-${seat}`}
                onClick={() => onUnseat?.(seat)}
              >
                {t('leaveSeat')}
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
