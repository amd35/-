/**
 * Royal profile screen — laid out in the reference order:
 * top bar (status + settings) → gold name plaque → framed avatar with wings
 * and a level ribbon → level / VIP / position badges → ID bar with copy →
 * identity card → Diamond & Gold balances → six counters → four actions.
 *
 * Every figure comes from the signed-in account (`/auth/me` + `/users/:id`);
 * nothing here is placeholder data.
 */
import type { Me } from '../../lib/auth';
import { assetUrl } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Avatar, formatCoins, Icon, useToast } from '../../lib/ui';
import { CurrencyIcon } from '../CurrencyIcon';
import { NameCard } from '../Cosmetics';
import { rankName } from '../RankBadge';
import { LevelBadge, formatXp } from '../ProgressionBadges';
import { countryFlag, countryName } from '../../lib/countries';
import {
  CrownSvg,
  EditSvg,
  GiftSvg,
  ShieldSvg,
  TrophySvg,
  WalletSvg,
  WingsSvg,
} from './RoyalArt';

export interface ProfileStats {
  counts: { friends: number; followers: number; following: number; rooms?: number };
  earnings: { total: number; calls: number } | null;
  gifts?: { count: number; coins: number; sent?: number };
}

export type ConnectionKind = 'followers' | 'following' | 'friends';

export function ProfileHero({
  me,
  stats,
  onSettings,
  onCustomize,
  onEdit,
  onWallet,
  onGold,
  onGifts,
  onAchievements,
  onRooms,
  onConnections,
}: {
  me: Me;
  stats: ProfileStats | null;
  onSettings: () => void;
  onCustomize: () => void;
  onEdit: () => void;
  onWallet: () => void;
  onGold: () => void;
  onGifts: () => void;
  onAchievements: () => void;
  onRooms: () => void;
  onConnections: (kind: ConnectionKind) => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  /* Wings, halo and aura belong to the royal administration identity only and
     are switched on per position from the admin panel («المؤثرات»). */
  const showEffects = Boolean(me.adminLook?.effectsEnabled);

  const level = me.level?.level ?? 1;
  const xp = me.level?.xp ?? 0;
  const position = me.adminLook?.label || (me.rank ? rankName(me.rank, lang) : '');
  const title =
    position ||
    (me.vip ? (lang === 'ar' ? me.vip.titleAr : me.vip.titleEn || me.vip.titleAr) : '') ||
    t('royalMember');
  const joined = me.user.createdAt
    ? new Date(me.user.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  const copyId = async () => {
    const value = me.user.username;
    try {
      await navigator.clipboard.writeText(value);
      toast.push(t('copied'), 'success');
    } catch {
      const field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      document.execCommand('copy');
      field.remove();
      toast.push(t('copied'), 'success');
    }
  };

  const counters: {
    key: string;
    label: string;
    value: number;
    icon: string;
    tone: string;
    onClick: () => void;
  }[] = [
    {
      key: 'sent',
      label: t('giftsSent'),
      value: stats?.gifts?.sent ?? 0,
      icon: 'gift',
      tone: 'rose',
      onClick: onGifts,
    },
    {
      key: 'received',
      label: t('receivedGifts'),
      value: stats?.gifts?.count ?? 0,
      icon: 'gift',
      tone: 'gold',
      onClick: onGifts,
    },
    {
      key: 'rooms',
      label: t('roomsCount'),
      value: stats?.counts.rooms ?? 0,
      icon: 'home',
      tone: 'violet',
      onClick: onRooms,
    },
    {
      key: 'followers',
      label: t('followers'),
      value: stats?.counts.followers ?? 0,
      icon: 'users',
      tone: 'blue',
      onClick: () => onConnections('followers'),
    },
    {
      key: 'following',
      label: t('followingCount'),
      value: stats?.counts.following ?? 0,
      icon: 'users',
      tone: 'pink',
      onClick: () => onConnections('following'),
    },
    {
      key: 'friends',
      label: t('friendsCount'),
      value: stats?.counts.friends ?? 0,
      icon: 'user',
      tone: 'gold',
      onClick: () => onConnections('friends'),
    },
  ];

  return (
    <section className={`rp-shell${me.adminLook ? ' is-admin' : ''}`}>
      {showEffects ? <span className="admin-profile-aura" aria-hidden="true" /> : null}

      {/* 1 — status and settings */}
      <div className="rp-topbar">
        <span className="rp-status rp-status-name" title={t('onlineNow')}>
          <i className="rp-status-dot" aria-hidden="true" />
          <b>{me.user.displayName}</b>
        </span>
        <button className="rp-gear" type="button" onClick={onSettings} aria-label={t('settings')}>
          <Icon name="settings" size={18} />
        </button>
      </div>

      {/* 2 — gold name plaque with the crown above and the wings around it */}
      <div className="rp-plaque">
        <CrownSvg className="rp-plaque-crown" />
        {showEffects ? (
          <>
            <WingsSvg className="rp-plaque-wing is-start" />
            <WingsSvg className="rp-plaque-wing is-end" flip />
          </>
        ) : null}
        <div className="rp-plaque-body">
          {me.cosmetics?.namecard ? (
            <NameCard
              cosmetic={me.cosmetics.namecard}
              name={me.user.displayName}
              id={me.user.username}
              avatarUrl={me.user.avatarUrl}
            />
          ) : (
            <span className="rp-plaque-name">{me.user.displayName}</span>
          )}
          {me.user.verified ? (
            <span className="rp-plaque-check" title={t('verified')} aria-label={t('verified')}>
              <Icon name="check" size={12} />
            </span>
          ) : null}
          {me.agent?.status === 'active' ? (
            <span className="agent-badge">
              <Icon name="shield" size={11} />
              {lang === 'ar' ? 'وكيل شحن رسمي' : 'Official agent'}
            </span>
          ) : null}
        </div>
      </div>

      {/* 3 — avatar: ornate frame, wings, crown and level ribbon; tap to change photo / frame */}
      <div className="rp-avatar">
        {showEffects ? (
          <>
            <WingsSvg className="rp-avatar-wing is-start" />
            <WingsSvg className="rp-avatar-wing is-end" flip />
            <span className="rp-avatar-glow" aria-hidden="true" />
          </>
        ) : null}
        <button
          type="button"
          className="rp-avatar-ring"
          onClick={onCustomize}
          aria-label={t('customizeProfile')}
        >
          <Avatar user={{ ...me.user, online: true }} size={84} />
          {me.vip?.frameImageUrl ? (
            <img className="vip-avatar-frame" src={assetUrl(me.vip.frameImageUrl)} alt="" />
          ) : null}
          <span className="rp-avatar-tap">
            <Icon name="sparkle" size={13} />
          </span>
        </button>
      </div>

      {/* 4 — level / VIP / position badges */}
      <div className="rp-badges">
        <div className="rp-badge is-level">
          <span className="rp-badge-art">
            <LevelBadge level={level} size={34} color={me.level?.badgeColor ?? '#ffd75e'} />
          </span>
          <span className="rp-badge-label">{t('level')}</span>
          <b className="rp-badge-value">Lv. {level}</b>
          <span className="rp-badge-sub">{formatXp(xp)} XP</span>
        </div>
        <div className={`rp-badge is-vip${me.vip ? '' : ' is-empty'}`}>
          <span className="rp-badge-art">
            <CrownSvg className="rp-badge-crown" />
          </span>
          <span className="rp-badge-label">VIP</span>
          <b className="rp-badge-value">{me.vip ? `VIP ${me.vip.tier}` : '—'}</b>
          <span className="rp-badge-sub">
            {me.vip ? (lang === 'ar' ? me.vip.titleAr : me.vip.titleEn || me.vip.titleAr) : t('noVip')}
          </span>
        </div>
        <div className={`rp-badge is-rank${position ? '' : ' is-empty'}`}>
          <span className="rp-badge-art">
            <ShieldSvg className="rp-badge-shield" />
          </span>
          <span className="rp-badge-label">{t('position')}</span>
          <b className="rp-badge-value">{position || t('member')}</b>
          <span className="rp-badge-sub">{t('royalAccount')}</span>
        </div>
      </div>

      {/* 5 — account ID with copy */}
      <div className="rp-idbar">
        <span className="rp-idbar-label">{t('id')}</span>
        <b className="rp-idbar-value" dir="ltr">
          {me.user.username}
        </b>
        <button className="rp-copy" type="button" onClick={() => void copyId()} aria-label={t('copyId')}>
          <Icon name="copy" size={14} />
        </button>
      </div>

      {/* 6 — identity card */}
      <section className="rp-card">
        {showEffects ? (
          <>
            <WingsSvg className="rp-card-wing is-start" />
            <WingsSvg className="rp-card-wing is-end" flip />
          </>
        ) : null}
        <h3 className="rp-card-title">{title}</h3>
        <p className="rp-card-bio">{me.user.bio || t('noBio')}</p>
        {me.user.country ? (
          <span className="rp-card-meta">
            {countryFlag(me.user.country)} {countryName(me.user.country, lang)}
          </span>
        ) : null}
        {joined ? (
          <span className="rp-card-meta">
            <Icon name="clock" size={12} /> {t('joined')}: {joined}
          </span>
        ) : null}
      </section>

      {/* 7 — balances */}
      <div className="rp-wallets">
        <button className="rp-wallet is-gems" type="button" onClick={onWallet}>
          <span className="rp-wallet-head">
            <span className="rp-wallet-icon">
              <CurrencyIcon code="DIAMOND" size={24} />
            </span>
            <span className="rp-wallet-name">{lang === 'ar' ? 'الماس' : 'Diamond'}</span>
          </span>
          <b className="rp-wallet-value">{formatCoins(me.wallet.balance)}</b>
          <span className="rp-wallet-plus" aria-hidden="true">
            <Icon name="plus" size={13} />
          </span>
        </button>
        <button className="rp-wallet is-beans" type="button" onClick={onGold}>
          <span className="rp-wallet-head">
            <span className="rp-wallet-icon">
              <CurrencyIcon code="GOLD" size={24} />
            </span>
            <span className="rp-wallet-name">{t('gold')}</span>
          </span>
          <b className="rp-wallet-value">{formatCoins(me.wallet.gold ?? 0)}</b>
          <span className="rp-wallet-plus" aria-hidden="true">
            <Icon name="plus" size={13} />
          </span>
        </button>
      </div>

      {/* 8 — six counters, each opening its own destination */}
      <div className="rp-stats">
        {counters.map((item) => (
          <button key={item.key} className="rp-stat" type="button" onClick={item.onClick}>
            <span className={`rp-stat-icon is-${item.tone}`}>
              <Icon name={item.icon} size={15} />
            </span>
            <b>{formatCoins(item.value)}</b>
            <span className="rp-stat-label">{item.label}</span>
          </button>
        ))}
      </div>

      {/* 9 — the four profile actions */}
      <div className="rp-actions">
        <button className="rp-action" type="button" onClick={onAchievements}>
          <span className="rp-action-art">
            <TrophySvg />
          </span>
          <span>{t('achievements')}</span>
        </button>
        <button className="rp-action" type="button" onClick={onGifts}>
          <span className="rp-action-art">
            <GiftSvg />
          </span>
          <span>{t('gifts')}</span>
        </button>
        <button className="rp-action" type="button" onClick={onWallet}>
          <span className="rp-action-art">
            <WalletSvg />
          </span>
          <span>{t('wallet')}</span>
        </button>
        <button className="rp-action is-primary" type="button" onClick={onEdit}>
          <span className="rp-action-art">
            <EditSvg />
          </span>
          <span>{t('editProfile')}</span>
        </button>
      </div>
    </section>
  );
}
