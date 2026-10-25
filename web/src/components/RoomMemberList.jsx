import Avatar from './Avatar.jsx'
import PhotoIcon from './PhotoIcon.jsx'
import { useI18n } from '../lib/i18n.jsx'

const ROLE_LABEL = { owner: 'مالك', moderator: 'مشرف', assistant: 'مساعد', member: 'عضو' }

/** قائمة أعضاء الغرفة: صورة واسم كل عضو، ودوره وحالة مايكه ومقعده. */
export default function RoomMemberList({ room, me, onSelect }) {
  const { t } = useI18n()
  if (!room?.members?.length) return null

  return (
    <div className="card glass" data-testid="room-members-list">
      <h3 className="section-title room-section-title" style={{ marginTop: 0 }}>
        <PhotoIcon name="friends" size={16} /> {t('roomMembers')} ({room.members.length})
      </h3>
      <div className="member-list">
        {room.members.map((member) => (
          <button
            type="button"
            className={`member-row${member.user.id === me?.id ? ' member-row-mine' : ''}`}
            key={member.user.id}
            data-testid={`room-member-${member.user.id}`}
            onClick={() => onSelect?.(member)}
          >
            <Avatar user={member.user} size={38} />
            <span className="member-name">
              {member.user.display_name || member.user.username}
              <span className="member-role">{ROLE_LABEL[member.role] || member.role}</span>
            </span>
            <span className="member-flags">
              {member.seat_index !== null ? (
                <span className="member-seat" data-testid={`member-seat-${member.user.id}`}>
                  {member.seat_index + 1}
                </span>
              ) : (
                <span className="member-seat muted">{t('listener')}</span>
              )}
              {member.muted_by_mod ? <PhotoIcon name="lock" size={14} /> : null}
              <PhotoIcon name="mic" size={14} className={member.mic_on ? '' : 'photo-icon-dim'} />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
