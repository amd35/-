import { useEffect } from 'react';
import { Icon } from '../../lib/ui';

/**
 * A room level just unlocked more mic seats: a short, full-screen gold
 * celebration over the stage before the extra seats appear.
 */
export function RoomSeatsUnlock({
  slots,
  level,
  onDone,
}: {
  slots: number;
  level: number;
  onDone: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 6000);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="seats-unlock" role="dialog" aria-label="فتح مايكات جديدة" onClick={onDone}>
      <div className="seats-unlock-card">
        <span className="seats-unlock-glow" aria-hidden="true" />
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <span key={index} className={`seats-unlock-spark spark-${index}`} aria-hidden="true">
            <Icon name="sparkle" size={14} />
          </span>
        ))}
        <p className="seats-unlock-kicker">مستوى {level} — الغرفة تطوّرت</p>
        <div className="seats-unlock-number">{slots}</div>
        <p className="seats-unlock-title">مايكات صارت متاحة على المسرح</p>
        <p className="seats-unlock-sub">انفتحت مقاعد إضافية — اصعد وشارك الحضور</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={onDone}>
          متابعة
        </button>
      </div>
    </div>
  );
}
