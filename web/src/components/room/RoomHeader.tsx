import { Avatar, Icon } from '../../lib/ui';
import { VipBadge } from '../ProgressionBadges';
import { isArtFrame } from '../AvatarFrame';
import type { SeatUser } from './MicSeat';
import { RoomCrest } from './RoomCrest';

/**
 * Royal stage header: golden crowned eagle crest, the app wordmark, a compact
 * room info panel (owner avatar + name + ID + occupancy + settings), the room
 * announcement bar, the owner badges and the country/language pills.
 */
export function RoomHeader({
  name,
  code,
  owner,
  occupied,
  total,
  members,
  capacity,
  country,
  language,
  canManage,
  onBack,
  onSettings,
  onMembers,
  onStore,
}: {
  name: string;
  code: string;
  owner: SeatUser | null;
  occupied: number;
  total: number;
  members: number;
  capacity: number;
  country: string;
  language: string;
  canManage: boolean;
  onBack: () => void;
  onSettings: () => void;
  onMembers: () => void;
  onStore: () => void;
}) {
  // The painted artwork frame is profile-sized, so the stage shows a compact
  // crowned ring instead: it keeps the royal identity without covering a seat.
  const royal = isArtFrame(owner?.frame);

  return (
    <header className="room-head">
      <button type="button" className="room-back" onClick={onBack} aria-label="رجوع">
        <Icon name="arrowLeft" size={16} />
      </button>

      {/* Tapping the room image opens the member list. */}
      <button type="button" className="room-head-crest" onClick={onMembers} aria-label="أعضاء الغرفة">
        <RoomCrest />
      </button>

      <div className="room-brand">
        <span className="room-brand-gem" aria-hidden="true">◆</span>
        <span className="room-logo-word">YALLA PHONE</span>
        <span className="room-brand-gem" aria-hidden="true">◆</span>
      </div>

      <div className="room-info">
        <span className={`room-info-owner${royal ? ' royal' : ''}`}>
          {owner ? (
            <Avatar
              user={{
                displayName: owner.displayName,
                avatarUrl: owner.avatarUrl,
                online: owner.online,
                frame: royal ? null : owner.frame,
              }}
              size={42}
            />
          ) : (
            <span className="room-owner-empty">
              <Icon name="shield" size={16} />
            </span>
          )}
          {royal ? (
            <span className="room-info-crown" aria-hidden="true">👑</span>
          ) : null}
        </span>

        <span className="room-info-center">
          <span className="room-info-name">
            <span aria-hidden="true">♛</span> YALLA PHONE
          </span>
          <span className="room-info-id">
            <Icon name="package" size={11} /> ID: {code}
          </span>
        </span>

        <span className="room-info-side">
          <span className="room-live">
            <i aria-hidden="true" />
            {occupied} / {total}
          </span>
          <button
            type="button"
            className="room-capacity-chip"
            onClick={onStore}
            aria-label="متجر الغرفة وسعة الأعضاء"
          >
            <Icon name="users" size={11} /> {members}/{capacity}
          </button>
          {canManage ? (
            <button type="button" className="room-icon-btn" onClick={onSettings} aria-label="إعدادات الغرفة">
              <Icon name="settings" size={16} />
            </button>
          ) : null}
        </span>
      </div>

      <div className="room-announce">
        <Icon name="volume" size={13} />
        <span className="room-announce-text">{name}</span>
        <span className="room-announce-crown" aria-hidden="true">👑</span>
      </div>

      <div className="room-sub">
        <span className="room-sub-owner">
          <VipBadge vip={owner?.vip} size={10} />
          <span className="room-sub-name">{owner ? owner.displayName : 'إدارة يلا فون'}</span>
          <span className="room-sub-tag">{owner?.rank?.nameAr ?? 'صاحب الغرفة'}</span>
        </span>
        <span className="room-place">
          <span>
            <Icon name="globe" size={10} /> {country}
          </span>
          <span>
            <Icon name="chat" size={10} /> {language}
          </span>
        </span>
      </div>

      <span className="room-star" aria-hidden="true">✦</span>
    </header>
  );
}
