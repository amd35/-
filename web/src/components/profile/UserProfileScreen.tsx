import { createPortal } from 'react-dom';
import { useRealtime } from '../../lib/realtime';
import { Avatar, formatCoins, Icon, Spinner } from '../../lib/ui';
import { RankTag } from '../RankBadge';
import { LevelBadge, VipBadge } from '../ProgressionBadges';
import { isArtFrame } from '../AvatarFrame';
import { GiftGallery } from './GiftGallery';
import { useUserProfile } from './useUserProfile';

/**
 * The full profile opened from inside a room. It renders as a full-screen layer
 * over the room instead of navigating away, so the voice session, the seat and
 * the live room keep running behind it.
 */
export function UserProfileScreen({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { online } = useRealtime();
  const { data, loading } = useUserProfile(userId);
  const user = data?.user;
  const isOnline = Boolean(user && (online.has(user.id) || user.online));

  return createPortal(
    <div className="room-full-profile">
      <header className="room-full-profile-head">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="رجوع">
          <Icon name="arrowRight" size={19} />
        </button>
        <h2>الملف الشخصي</h2>
        <span className="room-full-profile-head-spacer" />
      </header>

      {loading || !user ? (
        <Spinner label="جارٍ تحميل الملف…" />
      ) : (
        <div className="room-full-profile-body">
          <section className="room-full-profile-hero">
            <span className="room-full-profile-avatar">
              <Avatar user={{ ...user, online: true }} size={108} />
              {isArtFrame(user.frame) ? (
                <span className="room-profile-crown" aria-hidden="true">
                  👑
                </span>
              ) : null}
            </span>
            <h2>{user.displayName}</h2>
            {user.rank ? <RankTag rank={user.rank} size={17} /> : null}
            <div className="inline" style={{ gap: 6 }}>
              <LevelBadge level={user.level ?? 1} size={22} />
              <VipBadge vip={user.vip} size={18} showTitle />
            </div>
            <span className="room-full-profile-id" dir="ltr">
              ID: {user.username}
            </span>
            <span className={`room-profile-status${isOnline ? ' online' : ''}`}>
              <i />
              {isOnline ? 'متصل الآن' : 'غير متصل'}
            </span>
            {user.bio ? <p className="tiny muted center">{user.bio}</p> : null}

            <div className="room-full-profile-stats">
              <div>
                <b>{formatCoins(data.counts.friends)}</b>
                <span>الأصدقاء</span>
              </div>
              <div>
                <b>{formatCoins(data.counts.followers)}</b>
                <span>المتابعون</span>
              </div>
              <div>
                <b>{formatCoins(data.gifts.count)}</b>
                <span>الهدايا المستلمة</span>
              </div>
            </div>

            {data.balances ? (
              <div className="room-full-profile-balance">
                <Icon name="coins" size={14} /> رصيد الكونز: {formatCoins(data.balances.coins)}
              </div>
            ) : null}
          </section>

          {data.frames.length > 0 ? (
            <section className="room-full-profile-frames">
              <div className="section-head">
                <h2>الإطارات المملوكة</h2>
                <span className="tiny muted">{data.frames.length}</span>
              </div>
              <div className="room-full-profile-frame-row">
                {data.frames.map((frame) => (
                  <div key={frame.id} className={`room-full-profile-frame rarity-${frame.rarity}`}>
                    <span aria-hidden="true">✦</span>
                    {frame.name}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <GiftGallery userId={user.id} />
        </div>
      )}
    </div>,
    document.body
  );
}
