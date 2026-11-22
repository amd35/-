import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Avatar, Sheet, Spinner, useToast } from '../../lib/ui';
import type { FrameInfo } from '../AvatarFrame';

interface Friend {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  online: boolean;
  frame: FrameInfo | null;
}

/** Invites one of the caller's friends through an in-app notification. */
export function RoomInvitePanel({
  open,
  onClose,
  roomId,
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
}) {
  const toast = useToast();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api<{ users: Friend[] }>('/users?filter=friends&limit=50')
      .then((response) => setFriends(response.users))
      .catch((error: Error) => toast.push(error.message, 'error'))
      .finally(() => setLoading(false));
  }, [open, toast]);

  const invite = async (friend: Friend) => {
    try {
      await api(`/rooms/${roomId}/invite`, { method: 'POST', body: { userId: friend.id } });
      setSent((current) => new Set(current).add(friend.id));
      toast.push(`تمت دعوة ${friend.displayName}`, 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="دعوة الأصدقاء">
      {loading ? <Spinner label="جارٍ التحميل…" /> : null}
      {!loading && friends.length === 0 ? (
        <p className="tiny muted center">لا يوجد أصدقاء بعد — أضف أصدقاء من صفحة المستخدمين</p>
      ) : null}
      <div className="room-panel-list">
        {friends.map((friend) => (
          <div key={friend.id} className="room-panel-row">
            <Avatar
              user={{
                displayName: friend.displayName,
                avatarUrl: friend.avatarUrl,
                online: friend.online,
                frame: friend.frame,
              }}
              size={34}
            />
            <span className="room-panel-copy">
              <b>{friend.displayName}</b>
              <span className="tiny muted">{friend.online ? 'متصل الآن' : 'غير متصل'}</span>
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void invite(friend)}
              disabled={sent.has(friend.id)}
            >
              {sent.has(friend.id) ? 'تمت الدعوة' : 'دعوة'}
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
