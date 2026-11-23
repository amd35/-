import { Avatar, Icon, Sheet } from '../../lib/ui';
import type { RoomCapacity, RoomMemberEntry } from './types';

export interface PresenceUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  role: string;
  /** Stored member of the room, or still just a visitor. */
  member?: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'صاحب الغرفة',
  admin: 'نائب المالك',
  supervisor: 'مشرف',
  member: 'عضو',
};

/**
 * The room's member list, opened by tapping the room image.
 * Visitors (inside the room, not members yet) come after the members; the heart
 * likes the room and the + makes the caller a member.
 */
export function RoomMembersPanel({
  open,
  onClose,
  members,
  visitors,
  capacity,
  liked,
  likes,
  isMember,
  meId,
  canManage,
  busy,
  onJoin,
  onLeave,
  onToggleLike,
  onSetRole,
  onRemove,
  onOpenStore,
}: {
  open: boolean;
  onClose: () => void;
  members: RoomMemberEntry[];
  visitors: PresenceUser[];
  capacity: RoomCapacity;
  liked: boolean;
  likes: number;
  isMember: boolean;
  meId: string | null;
  canManage: boolean;
  busy: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onToggleLike: () => void;
  onSetRole: (userId: string, role: 'admin' | 'supervisor' | null) => void;
  onRemove: (userId: string) => void;
  onOpenStore: () => void;
}) {
  const full = capacity.count >= capacity.limit;
  const percent = Math.min(100, Math.round((capacity.count / Math.max(1, capacity.limit)) * 100));

  return (
    <Sheet open={open} onClose={onClose} title="أعضاء الغرفة">
      <div className="room-members-top">
        <div className="room-capacity">
          <div className="room-capacity-line">
            <span>
              <Icon name="users" size={13} /> الأعضاء {capacity.count} / {capacity.limit}
            </span>
            <button type="button" className="room-store-link" onClick={onOpenStore}>
              <Icon name="package" size={13} /> متجر الغرفة
            </button>
          </div>
          <div className="room-capacity-bar" aria-hidden="true">
            <i style={{ width: `${percent}%` }} />
          </div>
          <span className="tiny muted">
            {capacity.tierName ? `الترقية الحالية: ${capacity.tierName}` : 'الغرفة المجانية تستوعب 1000 عضو'}
            {full ? ' — الغرفة ممتلئة، رقّي الغرفة أو أزل أعضاء' : ''}
          </span>
        </div>

        <div className="room-members-actions">
          <button
            type="button"
            className={`room-heart${liked ? ' on' : ''}`}
            onClick={onToggleLike}
            aria-label={liked ? 'إزالة الإعجاب' : 'إعجاب بالغرفة'}
          >
            <Icon name="heart" size={16} /> {likes}
          </button>
          {isMember ? (
            <button type="button" className="chip on" onClick={onLeave} disabled={busy}>
              <Icon name="check" size={13} /> عضو
            </button>
          ) : (
            <button type="button" className="chip" onClick={onJoin} disabled={busy}>
              <Icon name="plus" size={13} /> انضم كعضو
            </button>
          )}
        </div>
      </div>

      <div className="room-panel-list">
        <p className="room-panel-head">الأعضاء ({members.length})</p>
        {members.length === 0 ? <p className="tiny muted center">لا يوجد أعضاء بعد</p> : null}
        {members.map((member) => {
          const role = member.role || 'member';
          return (
            <div key={member.id} className="room-panel-row">
              <Avatar
                user={{ displayName: member.displayName, avatarUrl: member.avatarUrl, online: member.online }}
                size={34}
              />
              <span className="room-panel-copy">
                <b>{member.displayName}</b>
                <span className={`room-role-tag role-${role}`}>{ROLE_LABEL[role] ?? 'عضو'}</span>
              </span>
              {canManage && role !== 'owner' && member.id !== meId ? (
                <span className="room-role-actions">
                  <button
                    type="button"
                    className={`chip${role === 'admin' ? ' on' : ''}`}
                    onClick={() => onSetRole(member.id, role === 'admin' ? null : 'admin')}
                  >
                    نائب المالك
                  </button>
                  <button
                    type="button"
                    className={`chip${role === 'supervisor' ? ' on' : ''}`}
                    onClick={() => onSetRole(member.id, role === 'supervisor' ? null : 'supervisor')}
                  >
                    مشرف
                  </button>
                  <button
                    type="button"
                    className="room-icon-btn danger"
                    onClick={() => onRemove(member.id)}
                    aria-label="إزالة من الغرفة"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </span>
              ) : null}
            </div>
          );
        })}

        <p className="room-panel-head">الزوار ({visitors.length})</p>
        {visitors.length === 0 ? <p className="tiny muted center">لا يوجد زوار الآن</p> : null}
        {visitors.map((visitor) => (
          <div key={visitor.id} className="room-panel-row">
            <Avatar
              user={{ displayName: visitor.displayName, avatarUrl: visitor.avatarUrl, online: true }}
              size={34}
            />
            <span className="room-panel-copy">
              <b>{visitor.displayName}</b>
              <span className="room-role-tag role-visitor">زائر</span>
            </span>
            {visitor.id === meId ? (
              <button type="button" className="chip" onClick={onJoin} disabled={busy}>
                <Icon name="plus" size={13} /> انضم
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
