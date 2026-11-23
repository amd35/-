import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { playLevelUpSound } from '../lib/levelUpSound';
import { LevelBadge } from './ProgressionBadges';

interface LevelUpPayload {
  level: number;
  nameAr?: string;
  nameEn?: string;
  badgeImageUrl?: string | null;
}

/** Full-screen royal celebration shown the moment the server levels the user up. */
export function LevelUpOverlay() {
  const { on } = useRealtime();
  const { refresh } = useAuth();
  const [payload, setPayload] = useState<LevelUpPayload | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const offUp = on('level:up', (data) => {
      const level = Number(data?.level);
      if (!Number.isFinite(level) || level < 2) return;
      setPayload({
        level,
        nameAr: typeof data.nameAr === 'string' ? data.nameAr : undefined,
        nameEn: typeof data.nameEn === 'string' ? data.nameEn : undefined,
        badgeImageUrl: typeof data.badgeImageUrl === 'string' ? data.badgeImageUrl : null,
      });
      playLevelUpSound(level);
      // Pull the new level into every screen (profile, chat, rooms) right away.
      void refresh();
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setPayload(null), 6000);
    });
    // Admin grant/revoke changes the level without a celebration.
    const offChanged = on('level:changed', () => void refresh());
    return () => {
      offUp();
      offChanged();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [on, refresh]);

  if (!payload) return null;

  return (
    <div className="levelup-overlay" role="dialog" aria-live="polite" onClick={() => setPayload(null)}>
      <div className="levelup-rays" aria-hidden="true" />
      <div className="levelup-card">
        <span className="levelup-kicker">ترقية مستوى</span>
        <div className="levelup-badge-wrap">
          <LevelBadge level={payload.level} size={132} imageUrl={payload.badgeImageUrl ?? null} />
        </div>
        <h2 className="levelup-title">{payload.nameAr || `المستوى ${payload.level}`}</h2>
        <p className="levelup-sub">أجنحتك الجديدة ظهرت — استمر بالتألق!</p>
        <button type="button" className="btn btn-gold btn-sm" onClick={() => setPayload(null)}>
          متابعة
        </button>
      </div>
    </div>
  );
}
