import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCall } from '../lib/call';
import { useI18n } from '../lib/i18n';
import { useRealtime } from '../lib/realtime';
import {
  Avatar,
  EmptyState,
  formatCoins,
  Icon,
  Sheet,
  Spinner,
  useToast,
} from '../lib/ui';
import { AppShell } from '../components/AppShell';
import { RankTag } from '../components/RankBadge';
import { ProfileHero, type ConnectionKind } from '../components/profile/ProfileHero';
import { ConnectionsSheet } from '../components/profile/ConnectionsSheet';
import { LevelBadge, VipBadge, formatXp } from '../components/ProgressionBadges';
import { ProfileCustomize } from '../components/ProfileCustomize';
import { GiftGallery } from '../components/profile/GiftGallery';
import type { UserCardData } from '../components/UserCard';

interface ProfileResponse {
  user: UserCardData;
  counts: { friends: number; followers: number; following: number; rooms?: number };
  earnings: { total: number; calls: number } | null;
  gifts?: { count: number; coins: number; sent?: number };
  isSelf: boolean;
}

export function Profile() {
  const { me, refresh } = useAuth();
  const { t } = useI18n();
  const { on } = useRealtime();
  const navigate = useNavigate();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [connections, setConnections] = useState<ConnectionKind | null>(null);
  const [requests, setRequests] = useState<{ id: string; user: UserCardData }[]>([]);
  const [stats, setStats] = useState<ProfileResponse | null>(null);
  const [name, setName] = useState(me?.user.displayName ?? '');
  const [bio, setBio] = useState(me?.user.bio ?? '');
  const [age, setAge] = useState(me?.user.age ? String(me.user.age) : '');
  const [busy, setBusy] = useState(false);

  const userId = me?.user.id;

  const loadStats = useCallback(async () => {
    if (!userId) return;
    const [profile, friendRequests] = await Promise.all([
      api<ProfileResponse>(`/users/${userId}`).catch(() => null),
      api<{ requests: { id: string; user: UserCardData }[] }>('/users/friends/requests').catch(() => null),
    ]);
    if (profile) setStats(profile);
    if (friendRequests) setRequests(friendRequests.requests);
  }, [userId]);

  useEffect(() => {
    if (!me) return;
    setName(me.user.displayName);
    setBio(me.user.bio ?? '');
    setAge(me.user.age ? String(me.user.age) : '');
    void loadStats();
  }, [userId, loadStats]);

  // Keep the counters live: refresh friends / followers / following / earnings when a
  // relevant event arrives or the app regains focus, instead of freezing on load values.
  useEffect(() => {
    if (!userId) return;
    const offNotification = on('notification', () => void loadStats());
    const offWallet = on('wallet:update', () => void loadStats());
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadStats();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      offNotification();
      offWallet();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, on, loadStats]);

  if (!me) return null;

  const save = async () => {
    setBusy(true);
    try {
      await api('/auth/me', {
        method: 'PATCH',
        body: { displayName: name, bio, age: age ? Number(age) : undefined },
      });
      await refresh();
      setEditOpen(false);
      toast.push(t('profileUpdated'), 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    try {
      const upload = await api<{ url: string }>('/uploads', { method: 'POST', form });
      await api('/auth/me', { method: 'PATCH', body: { avatarUrl: upload.url } });
      await refresh();
      toast.push(t('saved'), 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const acceptRequest = async (id: string) => {
    try {
      await api(`/users/friends/${id}/accept`, { method: 'POST' });
      setRequests((current) => current.filter((item) => item.id !== id));
      toast.push(t('friendAdded'), 'success');
      await Promise.all([refresh(), loadStats()]);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <AppShell title={t('profile')} active="profile" bare>
      <div className="page page-tight">
        <ProfileHero
          me={me}
          stats={stats}
          onSettings={() => navigate('/settings')}
          onCustomize={() => setCustomizeOpen(true)}
          onEdit={() => setEditOpen(true)}
          onWallet={() => navigate('/wallet')}
          onEarnings={() => navigate('/earnings')}
          onRooms={() => navigate('/rooms')}
          onConnections={setConnections}
          onGifts={() =>
            document.getElementById('profile-gifts')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          onAchievements={() => navigate('/levels')}
        />

        <section className="card">
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="tiny muted">{t('earnings')}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#ffd75e' }}>
                {formatCoins(stats?.earnings?.total ?? me.wallet.earned)}
              </div>
            </div>
            <div className="tiny muted center">
              {stats?.earnings?.calls ?? 0}
              <br />
              {t('calls')}
            </div>
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            {t('earningsHint')}
          </p>
        </section>

        <div id="profile-gifts">
          <GiftGallery userId={me.user.id} />
        </div>

        {requests.length > 0 ? (
          <section className="stack">
            <div className="section-head">
              <h2>{t('friends')}</h2>
              <span className="tiny muted">{requests.length}</span>
            </div>
            <div className="list">
              {requests.map((request) => (
                <div key={request.id} className="row static">
                  <Avatar user={request.user} />
                  <div className="row-main">
                    <div className="row-title">{request.user.displayName}</div>
                    <div className="row-sub">#{request.user.username}</div>
                  </div>
                  <button className="btn btn-primary btn-xs" onClick={() => void acceptRequest(request.id)}>
                    {t('accept')}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="list">
          <div className="row level-entry-row" onClick={() => navigate('/levels')}>
            <span className="rank-entry-icon" aria-hidden="true">✦</span>
            <div className="row-main">
              <div className="row-title">{t('levelsAndVip')}</div>
              <div className="row-sub">
                {t('level')} {me.level?.level ?? 1} • {formatXp(me.level?.xp ?? 0)} XP
                {me.vip ? ` • VIP ${me.vip.tier}` : ''}
              </div>
            </div>
            <Icon name="arrowLeft" size={17} />
          </div>
          <div className="row" onClick={() => navigate('/frames')}>
            <Icon name="sparkle" size={19} />
            <div className="row-main">
              <div className="row-title">{t('framesStore')}</div>
              <div className="row-sub">{t('framesSub')}</div>
            </div>
            <Icon name="arrowLeft" size={17} />
          </div>
          <div className="row" onClick={() => navigate('/settings')}>
            <Icon name="settings" size={19} />
            <div className="row-main">
              <div className="row-title">{t('settings')}</div>
            </div>
            <Icon name="arrowLeft" size={17} />
          </div>
          <div className="row" onClick={() => navigate('/notifications')}>
            <Icon name="bell" size={19} />
            <div className="row-main">
              <div className="row-title">{t('notifications')}</div>
            </div>
            {me.unreadNotifications > 0 ? (
              <span className="pill pill-pink" style={{ fontSize: 10 }}>
                {me.unreadNotifications}
              </span>
            ) : null}
          </div>
          <div className="row" onClick={() => navigate('/calls')}>
            <Icon name="phone" size={19} />
            <div className="row-main">
              <div className="row-title">{t('callHistory')}</div>
            </div>
            <Icon name="arrowLeft" size={17} />
          </div>
        </section>
      </div>

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title={t('editProfile')}>
        <div className="stack">
          <div className="center stack" style={{ alignItems: 'center' }}>
            <Avatar user={me.user} size={84} />
            <label className="btn btn-ghost btn-sm">
              <Icon name="image" size={15} /> {t('chooseAvatar')}
              <input type="file" accept="image/*" hidden onChange={(event) => void uploadAvatar(event)} />
            </label>
          </div>
          <div className="field">
            <label>{t('name')}</label>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="field">
            <label>{t('age')}</label>
            <input
              className="input"
              type="number"
              min={13}
              max={120}
              value={age}
              onChange={(event) => setAge(event.target.value)}
              dir="ltr"
            />
          </div>
          <div className="field">
            <label>{t('bio')}</label>
            <textarea className="textarea" value={bio} onChange={(event) => setBio(event.target.value)} />
          </div>
          <button className="btn btn-primary btn-block" onClick={() => void save()} disabled={busy}>
            {busy ? <span className="spinner" /> : t('save')}
          </button>
        </div>
      </Sheet>

      <ProfileCustomize
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        onEditInfo={() => setEditOpen(true)}
      />

      <ConnectionsSheet kind={connections} userId={me.user.id} onClose={() => setConnections(null)} />
    </AppShell>
  );
}

export function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { startCall } = useCall();
  const { online } = useRealtime();
  const toast = useToast();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('harassment');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api<ProfileResponse>(`/users/${id}`)
      .then(setData)
      .catch((error: Error) => toast.push(error.message, 'error'))
      .finally(() => setLoading(false));
  }, [id, toast]);

  if (me?.user.id === id) {
    return <Navigate to="/profile" replace />;
  }

  const patch = (changes: Partial<UserCardData>) =>
    setData((current) => (current ? { ...current, user: { ...current.user, ...changes } } : current));

  const toggleFollow = async () => {
    if (!id || !data) return;
    const response = await api<{ following: boolean }>(`/users/${id}/follow`, { method: 'POST' });
    patch({ isFollowing: response.following });
  };

  const toggleFavorite = async () => {
    if (!id || !data) return;
    const response = await api<{ favorite: boolean }>(`/users/${id}/favorite`, { method: 'POST' });
    patch({ isFavorite: response.favorite });
  };

  const addFriend = async () => {
    if (!id) return;
    const response = await api<{ status: string }>(`/users/${id}/friend`, { method: 'POST' });
    patch({ isFriend: response.status === 'accepted' });
    toast.push(response.status === 'accepted' ? t('friendAdded') : t('friendRequested'), 'success');
  };

  const openChat = async () => {
    if (!id) return;
    try {
      const response = await api<{ conversationId: string }>('/chat/conversations', {
        method: 'POST',
        body: { userId: id },
      });
      navigate(`/chats/${response.conversationId}`);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const block = async () => {
    if (!id) return;
    const response = await api<{ blocked: boolean }>(`/users/${id}/block`, { method: 'POST' });
    patch({ isBlocked: response.blocked });
    toast.push(response.blocked ? t('blocked') : t('unblock'), 'success');
  };

  const submitReport = async () => {
    if (!id) return;
    try {
      await api(`/users/${id}/report`, { method: 'POST', body: { reason } });
      toast.push(t('report'), 'success');
      setReportOpen(false);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  if (loading) {
    return (
      <AppShell title={t('profile')} active="home">
        <Spinner label={t('loading')} />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell title={t('profile')} active="home">
        <EmptyState icon="user" title={t('noResults')} />
      </AppShell>
    );
  }

  const user = data.user;
  const isOnline = online.has(user.id) || user.online;

  return (
    <AppShell
      title={user.displayName}
      subtitle={`#${user.username}`}
      active="home"
      right={
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="back">
          <Icon name="arrowRight" size={19} />
        </button>
      }
    >
      <div className="page page-tight">
        <section className="royal-profile">
          <div className="royal-name-row">
            <h2 className="royal-name">{user.displayName}</h2>
            <span className="royal-status">
              <i className={`royal-status-dot${isOnline ? '' : ' is-off'}`} aria-hidden="true" />
              {isOnline ? t('onlineNow') : t('offline')}
            </span>
          </div>
          <div className="royal-avatar">
            <span className="royal-avatar-glow" aria-hidden="true" />
            <div className="royal-avatar-ring is-static">
              <Avatar user={{ ...user, online: isOnline }} size={104} />
            </div>
          </div>
          <div className="royal-info">
            <span className="royal-id">
              <span className="royal-id-label">{t('id')}</span>
              <b className="royal-id-value" dir="ltr">
                {user.username}
              </b>
              <LevelBadge level={user.level ?? 1} size={22} />
            </span>
            <VipBadge vip={user.vip} size={18} showTitle />
            {user.rank ? <RankTag rank={user.rank} size={16} /> : null}
            {user.verified ? (
              <span className="royal-verified">
                <Icon name="check" size={12} /> {t('verified')}
              </span>
            ) : null}
            {user.isBlocked ? <span className="pill pill-red">{t('blocked')}</span> : null}
          </div>
          <section className="royal-card">
            {user.bio ? <p className="royal-bio">{user.bio}</p> : null}
            {user.createdAt ? (
              <div className="royal-meta">
                <span className="royal-meta-item">
                  <Icon name="clock" size={13} /> {t('joined')}:{' '}
                  {new Date(user.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-GB', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
            ) : null}
          </section>
          <div className="royal-stats">
            <div className="royal-stat">
              <b>{formatCoins(data.counts.friends)}</b>
              <span>{t('friendsCount')}</span>
            </div>
            <div className="royal-stat">
              <b>{formatCoins(data.counts.followers)}</b>
              <span>{t('followers')}</span>
            </div>
            <div className="royal-stat">
              <b>{formatCoins(data.gifts?.count ?? 0)}</b>
              <span>{t('receivedGifts')}</span>
            </div>
          </div>
        </section>

        <section className="card stack">
          <div className="inline" style={{ gap: 8 }}>
            <button className="btn btn-primary btn-sm grow" onClick={() => void openChat()}>
              <Icon name="chat" size={15} /> {t('message')}
            </button>
            <button
              className="btn btn-ghost btn-sm grow"
              onClick={() => void startCall({ id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl }, 'voice')}
            >
              <Icon name="phone" size={15} /> {t('voiceCall')}
            </button>
            <button
              className="btn btn-ghost btn-sm grow"
              onClick={() => void startCall({ id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl }, 'video')}
            >
              <Icon name="video" size={15} /> {t('videoCall')}
            </button>
          </div>
          <div className="inline" style={{ gap: 8 }}>
            <button className="btn btn-outline btn-sm grow" onClick={() => void toggleFollow()}>
              <Icon name="users" size={15} /> {user.isFollowing ? t('following') : t('follow')}
            </button>
            <button className="btn btn-outline btn-sm grow" onClick={() => void addFriend()}>
              <Icon name="plus" size={15} /> {user.isFriend ? t('friends') : t('addFriend')}
            </button>
            <button className="icon-btn" onClick={() => void toggleFavorite()} aria-label="favorite">
              <Icon name="star" size={17} fill={user.isFavorite ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div className="inline" style={{ gap: 8 }}>
            <button className="btn btn-ghost btn-xs grow" onClick={() => void block()}>
              <Icon name="ban" size={13} /> {user.isBlocked ? t('unblock') : t('block')}
            </button>
            <button className="btn btn-ghost btn-xs grow" onClick={() => setReportOpen(true)}>
              <Icon name="alert" size={13} /> {t('report')}
            </button>
          </div>
        </section>

        {data.earnings ? (
          <section className="card">
            <div className="tiny muted">{t('earnings')}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#ffd75e' }}>
              {formatCoins(data.earnings.total)} {t('coins')}
            </div>
            <div className="tiny muted">
              {data.earnings.calls} {t('calls')}
            </div>
          </section>
        ) : null}

        <GiftGallery userId={user.id} />
      </div>

      <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title={t('report')}>
        <div className="stack">
          <div className="field">
            <label>{t('report')}</label>
            <select className="select" value={reason} onChange={(event) => setReason(event.target.value)}>
              <option value="harassment">تحرش أو إساءة</option>
              <option value="spam">سبام</option>
              <option value="impersonation">انتحال شخصية</option>
              <option value="fraud">احتيال</option>
              <option value="other">أخرى</option>
            </select>
          </div>
          <button className="btn btn-danger btn-block" onClick={() => void submitReport()}>
            {t('send')}
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}
