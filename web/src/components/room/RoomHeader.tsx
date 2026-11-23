import { Icon } from '../../lib/ui';
import { assetUrl } from '../../lib/api';
import { coverUrlFor } from './roomCovers';

/**
 * Compact room header: a round room picture, the room name beside it and the
 * room ID in small type under the name. The ID card, owner card, counters and
 * country row stay hidden; the settings gear is the only extra control kept.
 */
export function RoomHeader({
  name,
  code,
  cover,
  canManage,
  onBack,
  onSettings,
}: {
  name: string;
  code: string;
  cover?: string | null;
  owner?: unknown;
  occupied?: number;
  total?: number;
  members?: number;
  capacity?: number;
  country?: string;
  language?: string;
  canManage: boolean;
  onBack: () => void;
  onSettings: () => void;
  onMembers?: () => void;
  onStore?: () => void;
}) {
  const photo = cover
    ? coverUrlFor(cover) ?? (/^(https?:|\/uploads)/.test(cover) ? assetUrl(cover) : null)
    : null;

  return (
    <header className="room-head room-head-clean">
      <button type="button" className="room-back" onClick={onBack} aria-label="رجوع">
        <Icon name="arrowLeft" size={16} />
      </button>

      {canManage ? (
        <button
          type="button"
          className="room-back room-head-gear"
          onClick={onSettings}
          aria-label="إعدادات الغرفة"
        >
          <Icon name="settings" size={16} />
        </button>
      ) : null}

      <div className="room-head-row">
        <span className="room-head-photo">
          {photo ? (
            <img src={photo} alt="" />
          ) : (
            <span className="room-head-photo-fallback" aria-hidden="true">
              ♛
            </span>
          )}
        </span>
        <span className="room-head-meta">
          <span className="room-head-name">{name}</span>
          <span className="room-head-code">ID: {code}</span>
        </span>
      </div>
    </header>
  );
}
