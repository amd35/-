import { Avatar, Icon } from '../../lib/ui';
import { RankBadge } from '../RankBadge';
import { LevelBadge, VipBadge } from '../ProgressionBadges';
import type { SeatUser } from './MicSeat';
import { RoomWings } from './RoomBackdrop';

/** The stage header: room identity, owner card and live occupancy. */
export function RoomHeader({
  name,
  code,
  owner,
  occupied,
  total,
  country,
  language,
  canManage,
  onBack,
  onSettings,
}: {
  name: string;
  code: string;
  owner: SeatUser | null;
  occupied: number;
  total: number;
  country: string;
  language: string;
  canManage: boolean;
  onBack: () => void;
  onSettings: () => void;
}) {
  return (
    <header className="room-head">
      <div className="room-head-top">
        <button type="button" className="room-icon-btn" onClick={onBack} aria-label="رجوع">
          <Icon name="arrowLeft" size={18} />
        </button>
        <span className="room-id">ID: {code}</span>
        <span className="room-head-spacer" />
        <span className="room-live">
          <i aria-hidden="true" />
          {occupied} / {total}
        </span>
        {canManage ? (
          <button type="button" className="room-icon-btn" onClick={onSettings} aria-label="إعدادات الغرفة">
            <Icon name="settings" size={17} />
          </button>
        ) : null}
      </div>

      <div className="room-logo">
        <RoomWings className="room-logo-wings" />
        <span className="room-logo-crown" aria-hidden="true">👑</span>
        <span className="room-logo-word">YALLA PHONE</span>
        <span className="room-logo-name">{name}</span>
      </div>

      <div className="room-head-meta">
        <div className="room-owner">
          {owner ? (
            <Avatar
              user={{
                displayName: owner.displayName,
                avatarUrl: owner.avatarUrl,
                online: owner.online,
                frame: owner.frame,
              }}
              size={42}
            />
          ) : (
            <span className="room-owner-empty">
              <Icon name="shield" size={18} />
            </span>
          )}
          <span className="room-owner-copy">
            <span className="room-owner-tag">صاحب الغرفة</span>
            <span className="room-owner-name">
              {owner?.rank ? <RankBadge rank={owner.rank} size={12} /> : null}
              {owner ? <LevelBadge level={owner.level ?? 1} size={11} /> : null}
              <VipBadge vip={owner?.vip} size={10} />
              {owner ? owner.displayName : 'إدارة يلا فون'}
            </span>
          </span>
        </div>
        <div className="room-place">
          <span>
            <Icon name="globe" size={12} /> {country}
          </span>
          <span>
            <Icon name="chat" size={12} /> {language}
          </span>
        </div>
      </div>
    </header>
  );
}
