import { useState } from 'react';
import { Avatar, Icon } from '../../lib/ui';
import type { FrameInfo } from '../AvatarFrame';
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
  canModerate,
  onTake,
  onLeave,
  onMute,
  onKick,
  onLock,
}: {
  mic: RoomMic;
  level: number;
  busy: boolean;
  canModerate: boolean;
  onTake: () => void;
  onLeave: () => void;
  onMute: () => void;
  onKick: () => void;
  onLock: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const speaking = Boolean(mic.user) && !mic.muted && level > 0.14;
  const owner = mic.kind === 'host';

  return (
    <div
      className={`seat${mic.user ? ' taken' : ''}${mic.mine ? ' mine' : ''}${
        speaking ? ' speaking' : ''
      }${mic.muted ? ' muted' : ''}${mic.isLocked ? ' locked' : ''}`}
    >
      <button
        type="button"
        className="seat-hit"
        onClick={() => (mic.mine ? onLeave() : mic.user ? undefined : onTake())}
        disabled={busy || Boolean(mic.user && !mic.mine)}
        aria-label={mic.user ? mic.user.displayName : `مايك ${mic.position}`}
      >
        <span className="seat-ring">
          <span className="seat-glow" />
          {mic.user ? (
            <Avatar
              user={{
                displayName: mic.user.displayName,
                avatarUrl: mic.user.avatarUrl,
                online: mic.user.online,
                frame: mic.user.frame,
              }}
              size={58}
            />
          ) : (
            <span className="seat-empty">
              <Icon name={mic.isLocked ? 'lock' : 'mic'} size={24} />
            </span>
          )}
          <span className="seat-num">{mic.position}</span>
          {owner ? <span className="seat-crown" aria-hidden="true">👑</span> : null}
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

      {canModerate || mic.mine ? (
        <button
          type="button"
          className="seat-menu-btn"
          onClick={() => setMenu((value) => !value)}
          aria-label="خيارات المايك"
        >
          ⋮
        </button>
      ) : null}

      {menu ? (
        <div className="seat-menu" onMouseLeave={() => setMenu(false)}>
          {mic.user && (mic.mine || canModerate) ? (
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                onMute();
              }}
            >
              <Icon name={mic.muted ? 'mic' : 'micOff'} size={13} />
              {mic.muted ? 'فتح الصوت' : 'كتم الصوت'}
            </button>
          ) : null}
          {canModerate && mic.user && !mic.mine ? (
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                onKick();
              }}
            >
              <Icon name="logout" size={13} /> إنزال من المايك
            </button>
          ) : null}
          {canModerate ? (
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                onLock();
              }}
            >
              <Icon name={mic.isLocked ? 'check' : 'lock'} size={13} />
              {mic.isLocked ? 'فتح المايك' : 'قفل المايك'}
            </button>
          ) : null}
          {mic.mine ? (
            <button
              type="button"
              onClick={() => {
                setMenu(false);
                onLeave();
              }}
            >
              <Icon name="logout" size={13} /> مغادرة المايك
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
