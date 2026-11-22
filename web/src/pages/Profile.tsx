import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import type { UserCardData } from '../components/UserCard';

interface ProfileResponse {
  user: UserCardData;
  counts: { friends: number; followers: number; following: number };
  earnings: { total: number; calls: number } | null;
  isSelf: boolean;
}

export function Profile() {
  const { me, refresh } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [requests, setRequests] = useState<{ id: string; user: UserCardData }[]>([]);
  const [stats, setStats] = useState<ProfileResponse | null>(null);
  const [name, setName] = useState(me?.user.displayName ?? '');
  const [username, setUsername] = useState(me?.user.username ?? '');
  const [bio, setBio] = useState(me?.user.bio ?? '');
  const [age, setAge] = useState(me?.user.age ? String(me.user.age) : '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me) return;
    setName(me.user.displayName);
    setUsername(me.user.username);
    setBio(me.user.bio ?? '');
    setAge(me.user.age ? String(me.user.age) : '');
    api<ProfileResponse>(`/users/${me.user.id}`)
      .then(setStats)
      .catch(() => undefined);
    api<{ requests: { id: string; user: UserCardData }[] }>('/users/friends/requests')
      .then((response) => setRequests(response.requests))
      .catch(() => undefined);
  }, [me?.user.id]);

  if (!me) return null;

  const save = async () => {
    setBusy(true);
    try {
      await api('/auth/me', {
        method: 'PATCH',
        body: { displayName: name, username, bio, age: age ? Number(age) : undefined },
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
      await refresh();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <AppShell
      title={t('profile')}
      active="profile"
      right={
        <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="settings">
          <Icon name="settings" size={19} />
        </button>
      }
    >
      <div className="page page-tight">
        <section className="profile-head">
          <Avatar user={{ ...me.user, online: true }} size={104} />
          <h2 style={{ fontSize: 21 }}>{me.user.displayName}</h2>
          <span className="tiny muted">@{me.user.username}</span>
          {me.user.bio ? <p className="tiny center muted">{me.user.bio}</p> : null}
          <div className="inline">
            <span className="pill pill-pink">
              <Icon name="user" size={12} /> {t('id')}: {me.user.id.slice(0, 6)}
            </span>
            <span className="pill pill-green">
              <Icon name="coins" size={12} /> {formatCoins(me.wallet.balance)}
            </span>
          </div>
          <div className="profile-stats">
            <div>
              <b>{stats?.counts.friends ?? 0}</b>
              <span>{t('friendsCount')}</span>
            </div>
            <div>
              <b>{stats?.counts.followers ?? 0}</b>
              <span>{t('followers')}</span>
            </div>
            <div>
              <b>{stats?.counts.following ?? 0}</b>
              <span>{t('followingCount')}</span>
            </div>
          </div>
          <div className="inline" style={{ marginTop: 6, width: '100%', gap: 8 }}>
            <button className="btn btn-primary btn-sm grow" onClick={() => setEditOpen(true)}>
              <Icon name="user" size={15} /> {t('editProfile')}
            </button>
            <button className="btn btn-outline btn-sm grow" onClick={() => navigate('/wallet')}>
              <Icon name="wallet" size={15} /> {t('wallet')}
            </button>
          </div>
        </section>

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
                    <div className="row-sub">@{request.user.username}</div>
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
            <label>{t('username')}</label>
            <input className="input" value={username} onChange={(event) => setUsername(event.target.value)} dir="ltr" />
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
    </AppShell>
  );
}

export function UserProfile() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const { t } = useI18n();
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
    navigate('/profile', { replace: true });
    return null;
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
      subtitle={`@${user.username}`}
      active="home"
      right={
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="back">
          <Icon name="arrowRight" size={19} />
        </button>
      }
    >
      <div className="page page-tight">
        <section className="profile-head">
          <Avatar user={{ ...user, online: isOnline }} size={104} />
          <h2 style={{ fontSize: 21 }}>{user.displayName}</h2>
          <span className="tiny muted">
            @{user.username} • {isOnline ? t('onlineNow') : t('offline')}
          </span>
          {user.bio ? <p className="tiny center muted">{user.bio}</p> : null}
          <div className="inline">
            <span className="pill pill-pink">
              <Icon name="user" size={12} /> {t('id')}: {user.id.slice(0, 6)}
            </span>
            {user.isBlocked ? <span className="pill pill-red">{t('blocked')}</span> : null}
          </div>
          <div className="profile-stats">
            <div>
              <b>{data.counts.friends}</b>
              <span>{t('friendsCount')}</span>
            </div>
            <div>
              <b>{data.counts.followers}</b>
              <span>{t('followers')}</span>
            </div>
            <div>
              <b>{data.counts.following}</b>
              <span>{t('followingCount')}</span>
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
