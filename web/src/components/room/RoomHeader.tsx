import { Avatar, Icon } from '../../lib/ui';
import { RankBadge } from '../RankBadge';
import { VipBadge } from '../ProgressionBadges';
import type { SeatUser } from './MicSeat';
import { RoomWings } from './RoomBackdrop';

/** Compact stage header: identity, room name, owner and live occupancy. */
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
      <RoomWings className="room-head-wings" />

      <div className="room-head-top">
        <button type="button" className="room-icon-btn" onClick={onBack} aria-label="رجوع">
          <Icon name="arrowLeft" size={18} />
        </button>
        <div className="room-head-id">
          <span className="room-logo-word">YALLA PHONE</span>
          <span className="room-id">ID: {code}</span>
        </div>
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

      <div className="room-head-title">
        <span className="room-logo-crown" aria-hidden="true">👑</span>
        <h1 className="room-title">{name}</h1>
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
              size={30}
            />
          ) : (
            <span className="room-owner-empty">
              <Icon name="shield" size={14} />
            </span>
          )}
          <span className="room-owner-copy">
            <span className="room-owner-tag">صاحب الغرفة</span>
            <span className="room-owner-name">
              {owner?.rank ? <RankBadge rank={owner.rank} size={11} /> : null}
              <VipBadge vip={owner?.vip} size={9} />
              <span className="room-owner-name-text">{owner ? owner.displayName : 'إدارة يلا فون'}</span>
            </span>
          </span>
        </div>
        <div className="room-place">
          <span>
            <Icon name="globe" size={11} /> {country}
          </span>
          <span>
            <Icon name="chat" size={11} /> {language}
          </span>
        </div>
      </div>
    </header>
  );
}
