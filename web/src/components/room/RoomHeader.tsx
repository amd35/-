import { Icon } from '../../lib/ui';
import { assetUrl } from '../../lib/api';

/**
 * Compact room header: a round room picture, the room name beside it and the
 * room ID in small type under the name. Room management can tap the picture to
 * open the identity sheet (rename + new picture from the device).
 */
export function RoomHeader({
  name,
  code,
  avatar,
  level,
  levelXp,
  levelXpFloor,
  levelXpNext,
  micSlots,
  canManage,
  onBack,
  onSettings,
  onIdentity,
}: {
  name: string;
  code: string;
  avatar?: string | null;
  level?: number;
  levelXp?: number;
  levelXpFloor?: number;
  levelXpNext?: number | null;
  micSlots?: number;
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
  onIdentity?: () => void;
  onMembers?: () => void;
  onStore?: () => void;
}) {
  const photo = avatar && /^(https?:|\/uploads\/)/.test(avatar) ? assetUrl(avatar) : null;
  const levelPercent =
    levelXpNext == null
      ? 100
      : Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ((Number(levelXp ?? 0) - Number(levelXpFloor ?? 0)) /
                Math.max(1, levelXpNext - Number(levelXpFloor ?? 0))) *
                100
            )
          )
        );

  const picture = (
    <>
      {photo ? (
        <img src={photo} alt="" />
      ) : (
        <span className="room-head-photo-fallback" aria-hidden="true">
          ♛
        </span>
      )}
    </>
  );

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
        {onIdentity && canManage ? (
          <button
            type="button"
            className="room-head-photo is-editable"
            onClick={onIdentity}
            aria-label="تغيير اسم الغرفة وصورتها"
          >
            {picture}
          </button>
        ) : (
          <span className="room-head-photo">{picture}</span>
        )}
        <span className="room-head-meta">
          <span className="room-head-name">{name}</span>
          <span className="room-head-code">ID: {code}</span>
          {level ? (
            <span
              className="room-head-level"
              title={
                levelXpNext == null
                  ? `المستوى ${level} — أعلى مستوى`
                  : `${levelXp ?? 0} / ${levelXpNext} نقطة تفاعل`
              }
            >
              <span className="room-head-level-badge">LV {level}</span>
              <span className="room-head-level-bar" aria-hidden="true">
                <span style={{ width: `${levelPercent}%` }} />
              </span>
              <span className="room-head-level-seats">{micSlots ?? 5} مايك</span>
            </span>
          ) : null}
        </span>
      </div>
    </header>
  );
}
