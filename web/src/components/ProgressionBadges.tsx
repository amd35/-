import type { CSSProperties } from 'react';

/** Level (1..100) driven by XP only. */
export interface LevelState {
  level: number;
  xp: number;
  nameAr: string;
  nameEn: string;
  badgeColor: string;
  badgeImageUrl: string | null;
  currentLevelXp: number;
  nextLevelXp: number | null;
  nextLevel: number | null;
  progress: number;
  rewardCoins: number;
}

/** Active VIP subscription. Independent of the level. */
export interface VipInfo {
  tier: number;
  nameAr: string;
  nameEn: string;
  color: string;
  titleAr: string;
  titleEn: string;
  badgeImageUrl: string | null;
  frameImageUrl: string | null;
  bubbleImageUrl: string | null;
  source: string;
  expiresAt: string | null;
}

export interface VipTier {
  tier: number;
  nameAr: string;
  nameEn: string;
  priceCoins: number;
  durationDays: number;
  color: string;
  badgeImageUrl: string | null;
  frameImageUrl: string | null;
  bubbleImageUrl: string | null;
  titleAr: string;
  titleEn: string;
  perks: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface LevelRowInfo {
  level: number;
  nameAr: string;
  nameEn: string;
  xpRequired: number;
  rewardCoins: number;
  badgeColor: string;
  badgeImageUrl: string | null;
  isActive: boolean;
}

/** Gold level medallion shown next to a user's name. */
export function LevelBadge({
  level,
  size = 22,
  color = '#ffd75e',
  className,
}: {
  level: number;
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={`level-badge ${className ?? ''}`}
      style={
        {
          width: size,
          height: size,
          fontSize: Math.max(9, Math.round(size * 0.45)),
          background: `linear-gradient(150deg, ${color} 0%, #b7791f 55%, #4a2c00 100%)`,
          boxShadow: `0 0 ${Math.max(4, size / 3)}px ${color}88`,
        } as CSSProperties
      }
      title={`Level ${level}`}
    >
      {level}
    </span>
  );
}

function CrownGlyph({ size = 12, color = '#0d0714' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 8.5 7.2 12 12 5l4.8 7L21 8.5 19 18H5L3 8.5Z"
        fill={color}
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** VIP badge: crown + VIP n, tinted with the tier colour. */
export function VipBadge({
  vip,
  size = 18,
  showTitle = false,
  className,
}: {
  vip: VipInfo | null | undefined;
  size?: number;
  showTitle?: boolean;
  className?: string;
}) {
  if (!vip) return null;
  return (
    <span
      className={`vip-badge ${className ?? ''}`}
      style={
        {
          '--vip-color': vip.color,
          fontSize: Math.max(9, Math.round(size * 0.55)),
          padding: `1px ${Math.round(size * 0.35)}px`,
          background: `linear-gradient(120deg, ${vip.color} 0%, #1a0f05 140%)`,
        } as CSSProperties
      }
      title={`VIP ${vip.tier}${vip.titleAr ? ` — ${vip.titleAr}` : ''}`}
    >
      <CrownGlyph size={Math.max(9, Math.round(size * 0.7))} />
      <b>VIP {vip.tier}</b>
      {showTitle && vip.titleAr ? <span className="vip-badge-title">{vip.titleAr}</span> : null}
    </span>
  );
}

export function formatVipDate(value: string | null): string {
  if (!value) return 'دائم';
  return new Date(value).toLocaleDateString('ar-IQ', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatXp(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)));
}

/** Room entrance effect for VIP members (tier 2 and above get a fuller sweep). */
export function VipEntryBanner({ vip, name }: { vip: VipInfo; name: string }) {
  return (
    <div
      className={`vip-entry ${vip.tier >= 4 ? 'royal' : ''}`}
      style={{ '--vip-color': vip.color } as CSSProperties}
    >
      <span className="vip-entry-beam" />
      <span className="vip-entry-crown">
        <CrownGlyph size={16} color="#1a1000" />
      </span>
      <span className="vip-entry-name">{name}</span>
      <span className="vip-entry-tier">
        VIP {vip.tier}
        {vip.titleAr ? ` • ${vip.titleAr}` : ''}
      </span>
      <span className="vip-entry-spark">✦</span>
    </div>
  );
}
