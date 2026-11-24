import { useId } from 'react';
import 'flag-icons/css/flag-icons.min.css';

/** Stored in `gifts.design` for the country-flag category (e.g. `flag:iq`). */
export const FLAG_DESIGN_PREFIX = 'flag:';

export function isFlagGift(gift: { design?: string | null }): boolean {
  return Boolean(gift.design && gift.design.startsWith(FLAG_DESIGN_PREFIX));
}

/** ISO alpha-2 code of a flag gift, lowercased for the `fi-xx` class. */
export function flagCodeOf(design?: string | null): string | null {
  if (!design || !design.startsWith(FLAG_DESIGN_PREFIX)) return null;
  const code = design.slice(FLAG_DESIGN_PREFIX.length).trim().toLowerCase();
  return /^[a-z]{2}$/.test(code) ? code : null;
}

/** Light flag artwork for the catalog grid — one background image, no animation. */
export function FlagThumb({ design, className = '' }: { design?: string | null; className?: string }) {
  const code = flagCodeOf(design);
  if (!code) return null;
  return (
    <span className={`gift-flag-thumb ${className}`}>
      <span className={`fi fi-${code}`} />
    </span>
  );
}

/**
 * Animated country-flag gift: the flag hangs as a waving cloth inside a gold
 * frame, a liquid SVG ripple distorts it and two drifting water sheens flow over
 * it, so a sent flag reads as motion rather than a still picture.
 */
export function FlagScene({ design, className = '' }: { design?: string | null; className?: string }) {
  const code = flagCodeOf(design);
  const uid = useId().replace(/[:]/g, '');
  if (!code) return null;
  const liquid = `flag-liquid-${uid}`;

  return (
    <div className={`gift-scene gift-flag ${className}`}>
      <svg className="gift-flag-defs" aria-hidden="true" focusable="false">
        <filter id={liquid} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.014 0.032"
            numOctaves="2"
            seed="7"
            result="ripple"
          >
            <animate
              attributeName="baseFrequency"
              dur="9s"
              values="0.014 0.032;0.022 0.05;0.014 0.032"
              repeatCount="indefinite"
            />
          </feTurbulence>
          <feDisplacementMap
            in="SourceGraphic"
            in2="ripple"
            scale="9"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
      <span className="gift-flag-aura" />
      <div className="gift-flag-frame">
        <div className="gift-flag-cloth">
          <span className={`fi fi-${code} gift-flag-img`} style={{ filter: `url(#${liquid})` }} />
          <span className="gift-flag-water" />
          <span className="gift-flag-water second" />
          <span className="gift-flag-shine" />
        </div>
      </div>
      <span className="gift-flag-sparkles">
        {Array.from({ length: 5 }).map((_, index) => (
          <i key={index} style={{ animationDelay: `${index * 0.45}s` }} />
        ))}
      </span>
    </div>
  );
}
