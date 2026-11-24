import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { assetUrl } from '../../lib/api';
import { formatCoins } from '../../lib/ui';
import { playLuckyBurst, playLuckyShake, playLuckyWin } from '../../lib/luckySound';
import { LuckyClover } from './LuckyClover';

/** One lucky spin, as announced to everyone inside the room. */
export interface LuckyGiftSpin {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  cost: number;
  prize: number;
  createdAt?: string;
}

const SHAKE_MS = 1600;
const BURST_MS = 950;
const REVEAL_MS = 3400;

type Phase = 'shake' | 'burst' | 'reveal';

/**
 * Full-screen «هدايا الحظ» reveal: a glowing golden bubble shakes, bursts with
 * flying diamonds, then shows the winner and the prize. Every member of the room
 * gets the same overlay at the same moment.
 */
export function LuckyGiftOverlay({ spin, onDone }: { spin: LuckyGiftSpin; onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('shake');
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDoneRef.current();
  };

  useEffect(() => {
    playLuckyShake();
    const burst = setTimeout(() => {
      setPhase('burst');
      playLuckyBurst();
    }, SHAKE_MS);
    const reveal = setTimeout(() => {
      setPhase('reveal');
      if (spin.prize > 0) playLuckyWin(spin.prize);
    }, SHAKE_MS + BURST_MS);
    const done = setTimeout(finish, SHAKE_MS + BURST_MS + REVEAL_MS);
    return () => {
      clearTimeout(burst);
      clearTimeout(reveal);
      clearTimeout(done);
    };
    // The overlay is keyed by spin id, so one mount = one spin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spin.id]);

  const particles = useMemo(
    () =>
      Array.from({ length: 26 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 26 + Math.random() * 0.4;
        const distance = 90 + Math.random() * 160;
        return {
          key: index,
          dx: Math.cos(angle) * distance,
          dy: Math.sin(angle) * distance,
          size: 6 + Math.random() * 12,
          delay: Math.random() * 0.2,
          rotate: Math.random() * 360,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spin.id]
  );

  return createPortal(
    <div
      className={`lucky-overlay phase-${phase}`}
      dir="rtl"
      onClick={() => {
        if (phase === 'reveal') finish();
      }}
    >
      <div className="lucky-rays" aria-hidden="true" />
      <div className="lucky-stage" aria-hidden="true">
        {phase !== 'reveal' ? (
          <div className="lucky-orb">
            <span className="lucky-orb-halo" />
            <span className="lucky-orb-core">
              <LuckyClover size={104} />
            </span>
          </div>
        ) : null}

        {phase !== 'shake' ? (
          <div className="lucky-particles">
            {particles.map((particle) => (
              <span
                key={particle.key}
                className="lucky-particle"
                style={
                  {
                    '--dx': `${particle.dx}px`,
                    '--dy': `${particle.dy}px`,
                    '--size': `${particle.size}px`,
                    '--delay': `${particle.delay}s`,
                    '--rot': `${particle.rotate}deg`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        ) : null}

        <span className="lucky-flash" />
      </div>

      <div className="lucky-caption">
        <span className="lucky-caption-title">🍀 هدايا الحظ</span>
        <span className="lucky-caption-name">{spin.name || 'لاعب'}</span>
        <span className="lucky-caption-cost">{formatCoins(spin.cost)} ماسة للمحاولة</span>
      </div>

      {phase === 'reveal' ? (
        <div className="lucky-reveal" onClick={(event) => event.stopPropagation()}>
          <span className="lucky-reveal-avatar">
            {spin.avatarUrl ? <img src={assetUrl(spin.avatarUrl)} alt="" /> : (spin.name || '?').charAt(0)}
          </span>
          <span className="lucky-reveal-name">{spin.name || 'لاعب'}</span>
          {spin.prize > 0 ? (
            <>
              <span className="lucky-reveal-label">ربحت</span>
              <span className="lucky-reveal-amount">
                {formatCoins(spin.prize)} <small>ماسة</small>
              </span>
            </>
          ) : (
            <span className="lucky-reveal-empty">لا شيء هذه المرة… حظ أوفر!</span>
          )}
          <button type="button" className="btn btn-gold btn-block" onClick={finish}>
            رائع
          </button>
        </div>
      ) : null}
    </div>,
    document.body
  );
}
