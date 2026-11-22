import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, assetUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useRealtime } from '../lib/realtime';
import {
  EmptyState,
  formatCoins,
  formatCountdown,
  Icon,
  useCountdown,
  useDebounced,
  useToast,
} from '../lib/ui';
import { AppShell, BellButton, CoinPill } from '../components/AppShell';
import { BotGreeter } from '../components/BotGreeter';
import { GiftCodeButton } from '../components/GiftCodeSheet';
import { UserCard, type UserCardData } from '../components/UserCard';

type Tab = 'all' | 'online' | 'favorites';

export default function Home() {
  const { t, lang } = useI18n();
  const { me } = useAuth();
  const { online, on } = useRealtime();
  const navigate = useNavigate();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query);
  const [users, setUsers] = useState<UserCardData[]>([]);
  const [suggestions, setSuggestions] = useState<UserCardData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await api<{ users: UserCardData[] }>(
        `/users?filter=${tab}&q=${encodeURIComponent(debouncedQuery)}`
      );
      setUsers(response.users);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [tab, debouncedQuery, toast]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // Keep the online counter and the people list live as users come online / go offline.
  useEffect(() => {
    const off = on('presence', () => void loadUsers(true));
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadUsers(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      off();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [on, loadUsers]);

  useEffect(() => {
    api<{ users: UserCardData[] }>('/users/suggestions')
      .then((response) => setSuggestions(response.users))
      .catch(() => undefined);
  }, []);

  const toggleFavorite = async (user: UserCardData) => {
    try {
      const response = await api<{ favorite: boolean }>(`/users/${user.id}/favorite`, {
        method: 'POST',
      });
      const patch = (list: UserCardData[]) =>
        list.map((item) => (item.id === user.id ? { ...item, isFavorite: response.favorite } : item));
      setUsers(patch);
      setSuggestions(patch);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const free = me?.freeCalls;
  const countdown = useCountdown(free?.nextResetAt);
  const percent = free ? Math.round((free.remaining / Math.max(1, free.perDay)) * 100) : 0;
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? (lang === 'ar' ? 'صباح الخير' : 'Good morning') : hour < 18 ? (lang === 'ar' ? 'مساء الخير' : 'Good afternoon') : lang === 'ar' ? 'مساء الخير' : 'Good evening';

  return (
    <AppShell
      title={me?.config.appName || 'Connect+'}
      subtitle={greeting}
      active="home"
      right={
        <div className="inline">
          <CoinPill balance={me?.wallet.balance ?? 0} />
          <GiftCodeButton />
          <BellButton />
        </div>
      }
    >
      <div className="page">
        <section className={`free-strip ${free && free.remaining === 0 ? 'empty' : ''}`}>
          <span className="pill pill-gold">
            <Icon name="gift" size={13} /> {free?.remaining ?? 0} / {free?.perDay ?? 5}
          </span>
          <div className="free-strip-meter">
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>
          <span className="tiny muted">{formatCountdown(countdown, lang)}</span>
          <span className="tiny" style={{ color: '#ffd75e' }}>
            {me?.config.voicePrice ?? 100} / {t('minutes')}
          </span>
        </section>

        <BotGreeter />

        <div className="search">
          <Icon name="search" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search')}
          />
          {query ? (
            <button className="icon-btn plain" onClick={() => setQuery('')} aria-label="clear">
              <Icon name="x" size={16} />
            </button>
          ) : null}
        </div>

        <div className="tabs">
          <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
            {t('allUsers')}
          </button>
          <button className={`tab ${tab === 'online' ? 'active' : ''}`} onClick={() => setTab('online')}>
            {t('online')}
          </button>
          <button
            className={`tab ${tab === 'favorites' ? 'active' : ''}`}
            onClick={() => setTab('favorites')}
          >
            {t('myFavorites')}
          </button>
        </div>

        {suggestions.length > 0 && tab === 'all' && !query ? (
          <section className="stack">
            <div className="section-head">
              <h2>{t('suggestions')}</h2>
              <span className="tiny muted">{suggestions.length}</span>
            </div>
            <div className="hscroll">
              {suggestions.map((user) => (
                <div
                  key={user.id}
                  className="suggest-card"
                  onClick={() => navigate(`/u/${user.id}`)}
                  role="button"
                >
                  <AvatarMini user={user} online={online.has(user.id) || user.online} />
                  <span className="tiny" style={{ fontWeight: 600 }}>
                    {user.displayName}
                  </span>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      void api(`/users/${user.id}/friend`, { method: 'POST' })
                        .then(() => toast.push(t('friendRequested'), 'success'))
                        .catch((error: Error) => toast.push(error.message, 'error'));
                    }}
                  >
                    <Icon name="plus" size={12} /> {t('addFriend')}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="stack">
          <div className="section-head">
            <h2>{tab === 'favorites' ? t('favorites') : t('users')}</h2>
            <span className="tiny muted">
              {users.filter((user) => online.has(user.id) || user.online).length} {t('online')}
            </span>
          </div>

          {loading ? (
            <div className="user-grid">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="skeleton" style={{ height: 168 }} />
              ))}
            </div>
          ) : users.length === 0 ? (
            <EmptyState
              icon="users"
              title={query ? t('noResults') : t('noUsers')}
              hint={query ? undefined : t('freeCallsInfo')}
            />
          ) : (
            <div className="user-grid">
              {users.map((user) => (
                <UserCard key={user.id} user={user} onToggleFavorite={(item) => void toggleFavorite(item)} />
              ))}
            </div>
          )}
        </section>

        <div className="tiny muted center" style={{ paddingBottom: 10 }}>
          {t('freeCallsInfo')}
        </div>
      </div>
    </AppShell>
  );
}

function AvatarMini({ user, online }: { user: UserCardData; online?: boolean }) {
  return (
    <div
      className="avatar"
      style={{ width: 52, height: 52, fontSize: 19 }}
    >
      {user.avatarUrl ? <img src={assetUrl(user.avatarUrl)} alt={user.displayName} /> : user.displayName.charAt(0)}
      {online ? <span className="online-dot" /> : null}
    </div>
  );
}
