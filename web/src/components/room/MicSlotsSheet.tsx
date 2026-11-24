import { Icon, Sheet } from '../../lib/ui';
import { assetUrl } from '../../lib/api';
import type { RoomData, RoomMic } from './types';

/** The levels that open more seats: 5 → 10 (level 10) → 15 (level 50). */
const SEAT_STEPS = [
  { slots: 10, level: 10 },
  { slots: 15, level: 50 },
];

/**
 * «تبديل المايكات»: every seat of the stage in one sheet — the open seats (tap a
 * free one to move to it) and the seats still locked behind a room level.
 */
export function MicSlotsSheet({
  open,
  onClose,
  room,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  room: RoomData;
  onPick: (mic: RoomMic) => void;
}) {
  const next = SEAT_STEPS.find((step) => room.micSlots < step.slots) ?? null;
  const locked: { position: number; level: number }[] = [];
  for (let position = room.micSlots + 1; position <= 15; position += 1) {
    locked.push({ position, level: position <= 10 ? 10 : 50 });
  }

  return (
    <Sheet open={open} onClose={onClose} title="المايكات">
      <div className="mic-slots">
        <div className="mic-slots-summary">
          <span className="mic-slots-stat">
            <Icon name="mic" size={13} /> {room.micSlots} مايك مفتوح
          </span>
          <span className="mic-slots-stat">
            <Icon name="star" size={13} /> المستوى {room.level}
          </span>
        </div>

        <p className="mic-slots-hint">
          {next
            ? `المقاعد الباقية مقفولة — تنفتح ${next.slots} مايكات عند وصول الغرفة إلى المستوى ${next.level}.`
            : 'كل المايكات الـ15 مفتوحة في غرفتك.'}
        </p>

        <div className="mic-slots-grid">
          {room.mics.map((mic) => (
            <button
              key={mic.id}
              type="button"
              className={`mic-slot${mic.mine ? ' mine' : ''}${mic.user && !mic.mine ? ' busy' : ''}`}
              disabled={Boolean(mic.user) || mic.isLocked}
              onClick={() => onPick(mic)}
            >
              <span className="mic-slot-avatar">
                {mic.isLocked ? (
                  <Icon name="lock" size={15} />
                ) : mic.user?.avatarUrl ? (
                  <img src={assetUrl(mic.user.avatarUrl)} alt="" />
                ) : (
                  <Icon name="mic" size={15} />
                )}
              </span>
              <b>{mic.position}</b>
              <span className="mic-slot-name">
                {mic.isLocked
                  ? 'مقفل'
                  : mic.mine
                    ? 'أنت'
                    : mic.user
                      ? mic.user.displayName
                      : 'متاح'}
              </span>
            </button>
          ))}

          {locked.map((seat) => (
            <div key={`locked-${seat.position}`} className="mic-slot locked" aria-disabled="true">
              <span className="mic-slot-avatar">
                <Icon name="lock" size={15} />
              </span>
              <b>{seat.position}</b>
              <span className="mic-slot-name">المستوى {seat.level}</span>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
