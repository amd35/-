import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useRealtime } from '../../lib/realtime';
import { Avatar, formatCoins, Icon, Spinner, useToast } from '../../lib/ui';
import { RankBadge } from '../RankBadge';
import { LevelBadge, VipBadge } from '../ProgressionBadges';
import { isArtFrame } from '../AvatarFrame';
import { useUserProfile } from './useUserProfile';

/**
 * The compact profile card shown when a user taps someone on a mic. It floats at
 * the bottom of the room so the stage stays visible, and never takes over the mics.
 */
export function UserProfileCard({
  userId,
  onClose,
  onSendGift,
  onOpenFull,
  seatActions,
}: {
  userId: string;
  onClose: () => void;
  onSendGift: (userId: string) => void;
  onOpenFull: (userId: string) => void;
  /** A member sitting on a mic: frames, and the seat powers for room staff. */
  seatActions?: {
    onLeaveMic?: () => void;
    onFrames: () => void;
    muted?: boolean;
    onMute?: () => void;
    onKick?: () => void;
    onBan2h?: () => void;
    onBanYear?: () => void;
  } | null;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { online } = useRealtime();
  const { data, loading, patchUser } = useUserProfile(userId);
  const user = data?.user;
  const isOnline = Boolean(user && (online.has(user.id) || user.online));

  const follow = async () => {
    if (!user) return;
    try {
      const response = await api<{ following: boolean }>(`/users/${user.id}/follow`, { method: 'POST' });
      patchUser({ isFollowing: response.following });
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const message = async () => {
    if (!user) return;
    try {
      const response = await api<{ conversationId: string }>('/chat/conversations', {
        method: 'POST',
        body: { userId: user.id },
      });
      navigate(`/chats/${response.conversationId}`);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return createPortal(
    <div className="room-profile-layer" onClick={onClose}>
      <div className="room-profile-card" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="room-profile-close" onClick={onClose} aria-label="إغلاق">
          <Icon name="x" size={16} />
        </button>

        {loading || !user ? (
          <div className="room-profile-loading">
            <Spinner label="جارٍ التحميل…" />
          </div>
        ) : (
          <>
            <div className="room-profile-head">
              <span className="room-profile-avatar">
                <Avatar user={{ ...user, online: isOnline }} size={72} />
                {isArtFrame(user.frame) ? (
                  <span className="room-profile-crown" aria-hidden="true">
                    👑
                  </span>
                ) : null}
              </span>
              <div className="room-profile-identity">
                <div className="room-profile-name">
                  {user.rank ? <RankBadge rank={user.rank} size={15} /> : null}
                  <LevelBadge level={user.level ?? 1} size={15} />
                  <VipBadge vip={user.vip} size={14} />
                  <b>{user.displayName}</b>
                </div>
                <span className="room-profile-id" dir="ltr">
                  ID: {user.username}
                </span>
                <span className={`room-profile-status${isOnline ? ' online' : ''}`}>
                  <i />
                  {isOnline ? 'متصل الآن' : 'غير متصل'}
                </span>
              </div>
            </div>

            <div className="room-profile-stats">
              <div>
                <b>{user.level ?? 1}</b>
                <span>المستوى</span>
              </div>
              {data?.balances ? (
                <div>
                  <b>{formatCoins(data.balances.coins)}</b>
                  <span>كونز</span>
                </div>
              ) : null}
              <div>
                <b>{formatCoins(data?.gifts.count ?? 0)}</b>
                <span>هدايا مستلمة</span>
              </div>
            </div>

            <div className="room-profile-gifts-bar">
              <Icon name="gift" size={14} />
              الهدايا المستلمة: {formatCoins(data?.gifts.count ?? 0)}
              <span className="room-profile-gifts-value">
                <Icon name="coins" size={13} /> {formatCoins(data?.gifts.coins ?? 0)}
              </span>
            </div>

            <div className="room-profile-actions">
              {seatActions ? (
                <>
                  {seatActions.onLeaveMic ? (
                    <button
                      type="button"
                      className="room-profile-action leave"
                      onClick={seatActions.onLeaveMic}
                    >
                      <Icon name="logout" size={15} /> مغادرة المايك
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="room-profile-action frame"
                    onClick={seatActions.onFrames}
                  >
                    <Icon name="frame" size={15} /> الإطار
                  </button>
                  {seatActions.onMute ? (
                    <button
                      type="button"
                      className="room-profile-action"
                      onClick={seatActions.onMute}
                    >
                      <Icon name={seatActions.muted ? 'mic' : 'micOff'} size={15} />
                      {seatActions.muted ? 'فتح الصوت' : 'كتم الصوت'}
                    </button>
                  ) : null}
                  {seatActions.onKick ? (
                    <button
                      type="button"
                      className="room-profile-action leave"
                      onClick={seatActions.onKick}
                    >
                      <Icon name="logout" size={15} /> إنزال من المايك
                    </button>
                  ) : null}
                  {seatActions.onBan2h ? (
                    <button
                      type="button"
                      className="room-profile-action"
                      onClick={seatActions.onBan2h}
                    >
                      <Icon name="ban" size={15} /> حظر ساعتين
                    </button>
                  ) : null}
                  {seatActions.onBanYear ? (
                    <button
                      type="button"
                      className="room-profile-action"
                      onClick={seatActions.onBanYear}
                    >
                      <Icon name="ban" size={15} /> حظر سنة
                    </button>
                  ) : null}
                </>
              ) : null}
              <button type="button" className="room-profile-action message" onClick={() => void message()}>
                <Icon name="chat" size={15} /> مراسلة خاصة
              </button>
              <button
                type="button"
                className="room-profile-action gift"
                onClick={() => onSendGift(user.id)}
              >
                <Icon name="gift" size={15} /> إرسال هدية
              </button>
              <button
                type="button"
                className={`room-profile-action follow${user.isFollowing ? ' active' : ''}`}
                onClick={() => void follow()}
              >
                <Icon name="users" size={15} /> {user.isFollowing ? 'متابَع' : 'متابعة'}
              </button>
              <button
                type="button"
                className="room-profile-action view"
                onClick={() => onOpenFull(user.id)}
              >
                <Icon name="eye" size={15} /> عرض الملف
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
