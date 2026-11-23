import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useCall } from '../lib/call';
import { useI18n } from '../lib/i18n';
import { useRealtime } from '../lib/realtime';
import { useToast } from '../lib/ui';
import { Avatar, formatCoins, formatDuration, Icon } from '../lib/ui';
import { RankBadge } from './RankBadge';
import { LevelBadge, VipBadge, type VipInfo } from './ProgressionBadges';

export interface UserCardData {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string | null;
  frame?: { id: string; design: string | null; kind: string; imageUrl: string | null; rarity: string } | null;
  rank?: import('./RankBadge').RankInfo | null;
  level?: number;
  vip?: VipInfo | null;
  bio?: string | null;
  verified?: boolean;
  createdAt?: string | null;
  online?: boolean;
  isFavorite?: boolean;
  isFriend?: boolean;
  isFollowing?: boolean;
  isBlocked?: boolean;
  age?: number | null;
  /** Approved recharge agency — drives the official agent badge. */
  isAgent?: boolean;
}

export function UserCard({
  user,
  onToggleFavorite,
}: {
  user: UserCardData;
  onToggleFavorite?: (user: UserCardData) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { startCall } = useCall();
  const { online } = useRealtime();
  const toast = useToast();
  const isOnline = online.has(user.id) || user.online;

  const call = async (kind: 'voice' | 'video') => {
    await startCall({ id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl }, kind);
  };

  return (
    <div className="user-card" onClick={() => navigate(`/u/${user.id}`)}>
      <button
        className={`fav-star ${user.isFavorite ? 'on' : ''}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite?.(user);
        }}
        aria-label="favorite"
      >
        <Icon name="star" size={15} fill={user.isFavorite ? 'currentColor' : 'none'} />
      </button>
      <Avatar user={{ ...user, online: isOnline }} size={62} />
      <div className="name name-with-rank">
        {user.rank ? <RankBadge rank={user.rank} size={15} /> : null}
        <LevelBadge level={user.level ?? 1} size={15} />
        <VipBadge vip={user.vip} size={15} />
        <span>{user.displayName}</span>
      </div>
      {user.age || isOnline ? (
        <div className="handle">
          {user.age ? `${user.age} ${t('years')}` : null}
          {user.age && isOnline ? ' • ' : null}
          {isOnline ? <span style={{ color: 'var(--green)' }}>{t('onlineNow')}</span> : null}
        </div>
      ) : null}
      <div className="actions">
        <button
          className="call-icon voice"
          aria-label={t('voiceCall')}
          title={t('voiceCall')}
          onClick={(event) => {
            event.stopPropagation();
            void call('voice');
          }}
        >
          <Icon name="phone" size={16} />
        </button>
        <button
          className="call-icon video"
          aria-label={t('videoCall')}
          title={t('videoCall')}
          onClick={(event) => {
            event.stopPropagation();
            void call('video');
          }}
        >
          <Icon name="video" size={17} />
        </button>
      </div>
    </div>
  );
}

export function UserRow({
  user,
  right,
  onClick,
}: {
  user: UserCardData;
  right?: React.ReactNode;
  onClick?: () => void;
}) {
  const { online } = useRealtime();
  const isOnline = online.has(user.id) || user.online;
  return (
    <div className="row" onClick={onClick}>
      <Avatar user={{ ...user, online: isOnline }} />
      <div className="row-main">
        <div className="row-title name-with-rank">
          {user.rank ? <RankBadge rank={user.rank} size={14} /> : null}
          <LevelBadge level={user.level ?? 1} size={14} />
          <VipBadge vip={user.vip} size={14} />
          <span>{user.displayName}</span>
        </div>
        <div className="row-sub">#{user.username}</div>
      </div>
      {right}
    </div>
  );
}

export function CallCostLine({
  isFree,
  ratePerMinute,
  elapsed,
  cost,
}: {
  isFree: boolean;
  ratePerMinute: number;
  elapsed: number;
  cost: number;
}) {
  const { t } = useI18n();
  return (
    <div className="call-cost">
      {isFree ? (
        <span>
          {t('freeCallBadge')} • {formatDuration(elapsed)}
        </span>
      ) : (
        <span>
          {formatCoins(cost)} {t('coins')} • {ratePerMinute} {t('perMinute')}
        </span>
      )}
    </div>
  );
}

export function useGoToProfile() {
  const navigate = useNavigate();
  return (id: string) => navigate(`/u/${id}`);
}

export function useStartCallAction() {
  const { startCall } = useCall();
  const { me } = useAuth();
  const toast = useToast();
  return async (user: UserCardData, kind: 'voice' | 'video') => {
    if (me?.user.id === user.id) {
      toast.push('You cannot call yourself', 'error');
      return;
    }
    await startCall({ id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl }, kind);
  };
}
