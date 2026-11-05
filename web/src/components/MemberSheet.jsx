import { useState } from 'react'
import Avatar from './Avatar.jsx'
import PhotoIcon from './PhotoIcon.jsx'
import { useI18n } from '../lib/i18n.jsx'

const ROLE_LABEL = { owner: 'مالك', moderator: 'مشرف', assistant: 'مساعد', member: 'عضو' }

/**
 * نافذة إجراءات العضو: كتم/إلغاء كتم، إنزال من المقعد، إخراج فوري،
 * طرد ساعتين أو 12 شهراً بسبب، تعيين مشرف/مساعد، ومنح صلاحية الطرد (للمالك).
 */
export default function MemberSheet({ room, me, member, myRole, canBan, onClose, onAction, onGift, onUnseat, onDelete }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const rank = { owner: 3, moderator: 2, assistant: 1, member: 0 }
  const myRank = rank[myRole] ?? -1
  const isMe = member.user.id === me.id
  const isOwnerTarget = room.owner?.id === member.user.id
  const canModerate = !isMe && !isOwnerTarget
  const targetMember = room.members.find((item) => item.user.id === member.user.id) || member

  const run = async (action, body) => {
    setBusy(true)
    setError('')
    try {
      await onAction(action, member, body)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="glass sheet stack member-sheet" onClick={(event) => event.stopPropagation()} data-testid="member-sheet">
        <div className="row">
          <Avatar user={member.user} />
          <div>
            <strong>{member.user.display_name || member.user.username}</strong>
            <div className="muted">
              {ROLE_LABEL[member.role]} · {t('level')} {member.user.level}
              {targetMember.seat_index !== null ? ` · مقعد ${targetMember.seat_index + 1}` : ` · ${t('listener')}`}
            </div>
          </div>
        </div>

        {isMe ? (
          <>
            {targetMember.seat_index !== null ? (
              <button
                type="button"
                className="btn"
                data-testid="sheet-leave-seat"
                disabled={busy}
                onClick={() => run('unseat', undefined)}
              >
                {t('leaveSeat')}
              </button>
            ) : null}
          </>
        ) : null}

        {canModerate && myRank >= 1 ? (
          <>
            <button
              type="button"
              className="btn"
              data-testid="sheet-mute"
              disabled={busy}
              onClick={() => run('mute', { value: !targetMember.muted_by_mod })}
            >
              {targetMember.muted_by_mod ? 'إلغاء الكتم' : t('mute')}
            </button>
            {targetMember.seat_index !== null ? (
              <button type="button" className="btn" data-testid="sheet-unseat" disabled={busy} onClick={() => onUnseat(member)}>
                {t('unseat')}
              </button>
            ) : null}
            <button type="button" className="btn" data-testid="sheet-gift" onClick={() => onGift(member)}>
              <PhotoIcon name="gift" size={16} /> {t('gift')}
            </button>
          </>
        ) : null}

        {canModerate && myRank >= 2 ? (
          <div className="ban-box" data-testid="ban-box">
            <label className="field">
              <span className="muted">{t('banReason')}</span>
              <input
                data-testid="ban-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="سبب الطرد (اختياري)"
                maxLength={200}
              />
            </label>
            <div className="row wrap">
              <button
                type="button"
                className="btn btn-danger"
                data-testid="ban-2h"
                disabled={busy}
                onClick={() => run('ban', { duration: '2h', reason })}
              >
                {t('banTwoHours')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                data-testid="ban-12mo"
                disabled={busy}
                onClick={() => run('ban', { duration: '12mo', reason })}
              >
                {t('banTwelveMonths')}
              </button>
              <button type="button" className="btn" data-testid="kick-now" disabled={busy} onClick={() => run('kick', undefined)}>
                {t('kick')}
              </button>
            </div>
          </div>
        ) : null}

        {canModerate && myRole === 'owner' ? (
          <>
            <div className="row wrap">
              <button
                type="button"
                className="btn"
                data-testid="role-moderator"
                disabled={busy}
                onClick={() => run('role', { role: 'moderator' })}
              >
                تعيين مشرف
              </button>
              <button type="button" className="btn" data-testid="role-member" disabled={busy} onClick={() => run('role', { role: 'member' })}>
                إرجاع لعضو
              </button>
            </div>
            {targetMember.role === 'moderator' ? (
              <button
                type="button"
                className="btn"
                data-testid="toggle-can-ban"
                disabled={busy}
                onClick={() => run('permissions', { can_ban: !targetMember.can_ban })}
              >
                {targetMember.can_ban ? t('revokeBan') : t('grantBan')}
              </button>
            ) : null}
            <button type="button" className="btn btn-danger" data-testid="delete-room" disabled={busy} onClick={onDelete}>
              <PhotoIcon name="lock" size={16} /> {t('deleteRoom')}
            </button>
          </>
        ) : null}

        {error ? <p className="error-text">{error}</p> : null}
        <p className="muted">
          {t('canBanPermission')}: {member.role === 'owner' ? 'المالك' : targetMember.can_ban ? 'ممنوحة' : 'غير ممنوحة'}
        </p>
        <button type="button" className="btn" onClick={onClose}>
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}
