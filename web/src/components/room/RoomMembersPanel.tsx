import { Avatar, Sheet } from '../../lib/ui';
import type { RoomRoleEntry } from './types';

export interface PresenceUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'صاحب الغرفة',
  admin: 'مدير الغرفة',
  supervisor: 'مشرف',
  member: 'عضو',
};

/** Everyone currently inside the room, with the owner's role controls. */
export function RoomMembersPanel({
  open,
  onClose,
  users,
  roles,
  meId,
  canManage,
  onSetRole,
}: {
  open: boolean;
  onClose: () => void;
  users: PresenceUser[];
  roles: RoomRoleEntry[];
  meId: string | null;
  canManage: boolean;
  onSetRole: (userId: string, role: 'admin' | 'supervisor' | null) => void;
}) {
  const roleByUser = new Map(roles.map((entry) => [entry.userId, entry.role]));
  return (
    <Sheet open={open} onClose={onClose} title={`الأعضاء (${users.length})`}>
      <div className="room-panel-list">
        {users.length === 0 ? <p className="tiny muted center">لا أحد في الغرفة الآن</p> : null}
        {users.map((user) => {
          const role = user.role || roleByUser.get(user.id) || 'member';
          return (
            <div key={user.id} className="room-panel-row">
              <Avatar user={{ displayName: user.displayName, avatarUrl: user.avatarUrl, online: true }} size={34} />
              <span className="room-panel-copy">
                <b>{user.displayName}</b>
                <span className={`room-role-tag role-${role}`}>{ROLE_LABEL[role] ?? 'عضو'}</span>
              </span>
              {canManage && role !== 'owner' && user.id !== meId ? (
                <span className="room-role-actions">
                  <button
                    type="button"
                    className={`chip${role === 'admin' ? ' on' : ''}`}
                    onClick={() => onSetRole(user.id, role === 'admin' ? null : 'admin')}
                  >
                    مدير
                  </button>
                  <button
                    type="button"
                    className={`chip${role === 'supervisor' ? ' on' : ''}`}
                    onClick={() => onSetRole(user.id, role === 'supervisor' ? null : 'supervisor')}
                  >
                    مشرف
                  </button>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
