/**
 * Official rank badge. An uploaded badge image wins when the administration set
 * one; otherwise the badge is drawn from the rank colour and tier, so every rank
 * has a royal medallion even before any artwork is uploaded.
 */
import { useId, type CSSProperties } from 'react';
import { assetUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { ADMIN_BADGE_BY_RANK, AdminRoyalBadge } from './AdminRoyal';

export interface RankInfo {
  key: string;
  nameAr: string;
  nameEn: string;
  kind: string;
  tier: number;
  color: string;
  badgeImageUrl: string | null;
  jobTitle?: string | null;
}

export function rankName(rank: RankInfo, lang: 'ar' | 'en'): string {
  return lang === 'en' && rank.nameEn ? rank.nameEn : rank.nameAr;
}

export function RankBadge({
  rank,
  size = 26,
  className,
}: {
  rank: RankInfo | null | undefined;
  size?: number;
  className?: string;
}) {
  const rawId = useId();
  const gradientId = `rank-grad-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  if (!rank) return null;

  if (rank.badgeImageUrl) {
    return (
      <span
        className={`rank-badge rank-badge-img ${className ?? ''}`}
        style={{
          width: size,
          height: size,
          boxShadow: `0 0 ${Math.max(6, size / 4)}px ${rank.color}80`,
        }}
        title={rank.nameAr}
      >
        <img src={assetUrl(rank.badgeImageUrl)} alt={rank.nameAr} />
      </span>
    );
  }

  const adminDesign = ADMIN_BADGE_BY_RANK[rank.key];
  if (adminDesign) {
    return <AdminRoyalBadge design={adminDesign} size={size} label={rank.nameAr} className={className} />;
  }

  return (
    <svg
      className={`rank-badge ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={rank.nameAr}
      style={{ filter: `drop-shadow(0 0 ${Math.max(3, size / 7)}px ${rank.color}99)` }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={rank.color} stopOpacity="0.95" />
          <stop offset="55%" stopColor="#2a1440" stopOpacity="0.98" />
          <stop offset="100%" stopColor="#120a1e" stopOpacity="1" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill={`url(#${gradientId})`} stroke="#ffd75e" strokeWidth="2.5" />
      <circle cx="32" cy="32" r="23.5" fill="rgba(9,5,16,0.72)" stroke={rank.color} strokeWidth="1.4" />
      <path d="M17 26.5 21.5 14 27.5 22 32 11.5 36.5 22 42.5 14 47 26.5Z" fill="#ffd75e" />
      <rect x="17" y="28" width="30" height="4.2" rx="1.4" fill="#f0a92b" />
      <text
        x="32"
        y="50"
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill="#fff"
        style={{ fontFamily: 'Segoe UI, system-ui, sans-serif' }}
      >
        {rank.tier || ''}
      </text>
    </svg>
  );
}

/** Badge plus the rank (or job) name, shown next to a display name. */
export function RankTag({
  rank,
  size = 16,
  showName = true,
  className,
}: {
  rank: RankInfo | null | undefined;
  size?: number;
  showName?: boolean;
  className?: string;
}) {
  const { lang } = useI18n();
  if (!rank) return null;
  return (
    <span
      className={`rank-tag ${className ?? ''}`}
      style={{ '--rank-color': rank.color } as CSSProperties}
    >
      <RankBadge rank={rank} size={size} />
      {showName ? <span className="rank-tag-name">{rankName(rank, lang)}</span> : null}
    </span>
  );
}
