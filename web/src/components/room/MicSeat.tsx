import { assetUrl } from '../../lib/api';
import { Avatar, Icon } from '../../lib/ui';
import { isArtFrame, type FrameInfo } from '../AvatarFrame';
import { RankBadge, type RankInfo } from '../RankBadge';
import { LevelBadge, VipBadge, type VipInfo } from '../ProgressionBadges';

export interface SeatUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  online: boolean;
  frame: FrameInfo | null;
  rank?: RankInfo | null;
  level?: number;
  vip?: VipInfo | null;
}

export interface RoomMic {
  id: string;
  position: number;
  label: string;
  kind: string;
  isLocked: boolean;
  muted: boolean;
  mine: boolean;
  user: SeatUser | null;
}

/** One of the 15 stage seats: fiery ring, gold mic, avatar, name and mute state. */
export function MicSeat({
  mic,
  level,
  busy,
  onTake,
  onOpenProfile,
  giftFrame,
}: {
  mic: RoomMic;
  level: number;
  busy: boolean;
  /** A free seat asks «اصعد الآن» first; a locked one offers «افتح المايك» to staff. */
  onTake: () => void;
  /** Tapping someone else's avatar opens their quick profile card. */
  onOpenProfile?: () => void;
  /** Frame gifted to this member: drawn around the avatar, never over the face. */
  giftFrame?: { imageUrl: string; name: string } | null;
}) {
  const speaking = Boolean(mic.user) && !mic.muted && level > 0.14;
  const owner = mic.kind === 'host';
  // The full painted artwork frame is profile-sized; on a seat it would cover
  // the neighbouring mics, so the seat shows a small crown instead.
  const royal = isArtFrame(mic.user?.frame);

  return (
    <div
      className={`seat${mic.user ? ' taken' : ''}${!mic.user ? ' empty' : ''}${mic.mine ? ' mine' : ''}${
        speaking ? ' speaking' : ''
      }${mic.muted ? ' muted' : ''}${mic.isLocked ? ' locked' : ''}${royal ? ' royal' : ''}`}
    >
      <button
        type="button"
        className="seat-hit"
        onClick={() => (mic.user ? onOpenProfile?.() : onTake())}
        disabled={busy}
        aria-label={mic.user ? mic.user.displayName : `مايك ${mic.position}`}
      >
        <span className="seat-ring">
          <span className="seat-glow" />
          {mic.user && giftFrame ? (
            <img
              className="seat-gift-frame"
              src={assetUrl(giftFrame.imageUrl)}
              alt=""
              aria-hidden="true"
            />
          ) : null}
          {mic.user ? (
            <Avatar
              user={{
                displayName: mic.user.displayName,
                avatarUrl: mic.user.avatarUrl,
                online: mic.user.online,
                frame: royal ? null : mic.user.frame,
              }}
              size={50}
            />
          ) : (
            <span className="seat-empty">
              <Icon name={mic.isLocked ? 'lock' : 'mic'} size={22} />
            </span>
          )}
          <span className="seat-num">{mic.position}</span>
          {owner || royal ? <span className="seat-crown" aria-hidden="true">👑</span> : null}
          {mic.user && mic.muted ? (
            <span className="seat-mute" aria-label="مكتوم">
              <Icon name="micOff" size={11} />
            </span>
          ) : null}
          {mic.isLocked ? (
            <span className="seat-lock" aria-label="مقفل">
              <Icon name="lock" size={10} />
            </span>
          ) : null}
        </span>
        <span className="seat-name">
          {mic.user?.rank ? <RankBadge rank={mic.user.rank} size={12} /> : null}
          {mic.user ? <LevelBadge level={mic.user.level ?? 1} size={11} /> : null}
          <VipBadge vip={mic.user?.vip} size={10} />
          <span className="seat-name-text">{mic.user ? mic.user.displayName : `مايك ${mic.position}`}</span>
        </span>
      </button>
    </div>
  );
}
