/**
 * Royal profile header: crown, name + status, framed avatar, account badges
 * (ID, level, VIP, rank, verification), identity card, balances, the six
 * account counters and the four profile actions — in that order.
 *
 * Everything is drawn from the signed-in account's real data (`/auth/me` and
 * `/users/:id`); the only visual layer is the gold/purple frame around the
 * avatar, which leaves the equipped avatar frame and the VIP frame untouched.
 */
import type { Me } from '../../lib/auth';
import { assetUrl } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Avatar, formatCoins, Icon } from '../../lib/ui';
import { IdBadge, NameCard } from '../Cosmetics';
import { RankTag } from '../RankBadge';
import { LevelBadge, VipBadge, formatXp } from '../ProgressionBadges';

export interface ProfileStats {
  counts: { friends: number; followers: number; following: number; rooms?: number };
  earnings: { total: number; calls: number } | null;
  gifts?: { count: number; coins: number; sent?: number };
}

function CrownArt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 64" aria-hidden="true">
      <defs>
        <linearGradient id="royal-crown-gold" x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor="#fff8d6" />
          <stop offset="0.42" stopColor="#ffd75e" />
          <stop offset="1" stopColor="#b07807" />
        </linearGradient>
      </defs>
      <path
        d="M15 46 8 15l26 17L60 7l26 25 26-17-7 31Z"
        fill="url(#royal-crown-gold)"
        stroke="#7a4a05"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <rect x="15" y="44" width="90" height="12" rx="4" fill="url(#royal-crown-gold)" stroke="#7a4a05" strokeWidth="2.2" />
      <circle cx="60" cy="50" r="4.4" fill="#e11d48" stroke="#7a0b22" strokeWidth="1.2" />
      <circle cx="38" cy="50" r="3" fill="#ff5b8f" />
      <circle cx="82" cy="50" r="3" fill="#ff5b8f" />
      <circle cx="8" cy="13" r="3.6" fill="#fff3c4" stroke="#7a4a05" strokeWidth="1.4" />
      <circle cx="112" cy="13" r="3.6" fill="#fff3c4" stroke="#7a4a05" strokeWidth="1.4" />
      <circle cx="60" cy="5" r="4.2" fill="#fff8d6" stroke="#7a4a05" strokeWidth="1.4" />
    </svg>
  );
}

export function ProfileHero({
  me,
  stats,
  onCustomize,
  onEdit,
  onWallet,
  onGifts,
  onAchievements,
}: {
  me: Me;
  stats: ProfileStats | null;
  onCustomize: () => void;
  onEdit: () => void;
  onWallet: () => void;
  onGifts: () => void;
  onAchievements: () => void;
}) {
  const { t, lang } = useI18n();
  const level = me.level?.level ?? 1;
  const title = me.adminLook?.label || me.rank?.nameAr || me.vip?.titleAr || '';
  const joined = me.user.createdAt
    ? new Date(me.user.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  const counters = [
    { key: 'friends', label: t('friendsCount'), value: stats?.counts.friends ?? 0 },
    { key: 'followers', label: t('followers'), value: stats?.counts.followers ?? 0 },
    { key: 'following', label: t('followingCount'), value: stats?.counts.following ?? 0 },
    { key: 'rooms', label: t('roomsCount'), value: stats?.counts.rooms ?? 0 },
    { key: 'received', label: t('receivedGifts'), value: stats?.gifts?.count ?? 0 },
    { key: 'sent', label: t('giftsSent'), value: stats?.gifts?.sent ?? 0 },
  ];

  return (
    <section className={`royal-profile${me.adminLook ? ' royal-profile-admin' : ''}`}>
      {me.adminLook?.effectsEnabled ? <span className="admin-profile-aura" aria-hidden="true" /> : null}

      <CrownArt className="royal-crown" />

      {/* 1 — name above the avatar, with the account status next to it */}
      <div className="royal-name-row">
        {me.cosmetics?.namecard ? (
          <NameCard
            cosmetic={me.cosmetics.namecard}
            name={me.user.displayName}
            id={me.user.username}
            avatarUrl={me.user.avatarUrl}
          />
        ) : (
          <h2 className="royal-name">{me.user.displayName}</h2>
        )}
        <span className="royal-status">
          <i className="royal-status-dot" aria-hidden="true" />
          {t('onlineNow')}
        </span>
      </div>

      {/* 2 — avatar with the gold frame; tapping opens the existing customizer */}
      <div className="royal-avatar">
        <span className="royal-avatar-glow" aria-hidden="true" />
        <button
          type="button"
          className="royal-avatar-ring"
          onClick={onCustomize}
          aria-label={t('customizeProfile')}
        >
          <Avatar user={{ ...me.user, online: true }} size={104} />
          {me.vip?.frameImageUrl ? (
            <img className="vip-avatar-frame" src={assetUrl(me.vip.frameImageUrl)} alt="" />
          ) : null}
          <span className="avatar-tap-badge">
            <Icon name="sparkle" size={14} />
          </span>
        </button>
      </div>

      {/* 3 — account information: ID + level, VIP, rank, verification */}
      <div className="royal-info">
        <span className="royal-id">
          <span className="royal-id-label">{t('id')}</span>
          {me.cosmetics?.id ? (
            <IdBadge cosmetic={me.cosmetics.id} value={me.user.username} />
          ) : (
            <b className="royal-id-value" dir="ltr">
              {me.user.username}
            </b>
          )}
          <LevelBadge level={level} size={22} color={me.level?.badgeColor ?? '#ffd75e'} />
        </span>
        <VipBadge vip={me.vip} size={18} showTitle />
        {me.rank ? <RankTag rank={me.rank} size={16} /> : null}
        {me.user.verified ? (
          <span className="royal-verified" title={t('verified')}>
            <Icon name="check" size={12} /> {t('verified')}
          </span>
        ) : null}
      </div>

      {/* 4 — identity card: title, bio, status and join date */}
      <section className="royal-card">
        {title ? (
          <div className="royal-card-title">
            <span className="royal-card-wing" aria-hidden="true" />
            <span>{title}</span>
            <span className="royal-card-wing flip" aria-hidden="true" />
          </div>
        ) : null}
        {me.user.bio ? <p className="royal-bio">{me.user.bio}</p> : null}
        <div className="royal-meta">
          <span className="royal-meta-item">
            <Icon name="shield" size={13} /> {t('accountStatus')}: {t('onlineNow')}
          </span>
          {joined ? (
            <span className="royal-meta-item">
              <Icon name="clock" size={13} /> {t('joined')}: {joined}
            </span>
          ) : null}
        </div>
      </section>

      {/* 5 — balances: points (XP), coins and earnings */}
      <div className="royal-balances">
        <div className="royal-balance">
          <span className="royal-balance-label">
            <Icon name="star" size={12} /> {t('points')}
          </span>
          <b>{formatXp(me.level?.xp ?? 0)}</b>
        </div>
        <div className="royal-balance">
          <span className="royal-balance-label">
            <Icon name="coins" size={12} /> {t('coins')}
          </span>
          <b>{formatCoins(me.wallet.balance)}</b>
        </div>
        <div className="royal-balance">
          <span className="royal-balance-label">
            <Icon name="chart" size={12} /> {t('earnings')}
          </span>
          <b>{formatCoins(stats?.earnings?.total ?? me.wallet.earned)}</b>
        </div>
      </div>

      {/* 6 — six account counters */}
      <div className="royal-stats">
        {counters.map((item) => (
          <div className="royal-stat" key={item.key}>
            <b>{formatCoins(item.value)}</b>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {/* 7 — profile actions */}
      <div className="royal-actions">
        <button className="royal-action is-primary" onClick={onEdit}>
          <Icon name="user" size={16} />
          <span>{t('editProfile')}</span>
        </button>
        <button className="royal-action" onClick={onWallet}>
          <Icon name="wallet" size={16} />
          <span>{t('wallet')}</span>
        </button>
        <button className="royal-action" onClick={onGifts}>
          <Icon name="gift" size={16} />
          <span>{t('gifts')}</span>
        </button>
        <button className="royal-action" onClick={onAchievements}>
          <Icon name="shield" size={16} />
          <span>{t('achievements')}</span>
        </button>
      </div>
    </section>
  );
}
