import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { EmptyState, formatTimeAgo, Icon, Spinner } from '../lib/ui';
import { AppShell } from '../components/AppShell';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const ICON_BY_TYPE: Record<string, string> = {
  message: 'chat',
  incoming_call: 'phoneIn',
  call_missed: 'phoneIn',
  call_no_answer: 'phoneOut',
  call_ended: 'phone',
  call_failed: 'alert',
  free_calls_last: 'gift',
  free_calls_exhausted: 'alert',
  recharge_confirmed: 'coins',
  recharge_failed: 'alert',
  earning_received: 'gift',
  friend_request: 'users',
  friend_accepted: 'check',
  new_follower: 'user',
  rank_granted: 'shield',
  account_banned: 'ban',
  account_unbanned: 'check',
  admin_broadcast: 'bell',
  announcement: 'megaphone',
  welcome: 'sparkle',
  withdrawal_requested: 'wallet',
  withdrawal_approved: 'check',
  withdrawal_rejected: 'alert',
};

export default function Notifications() {
  const { t, lang } = useI18n();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<{ notifications: NotificationRow[] }>('/notifications');
      setItems(response.notifications);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markAll = async () => {
    await api('/notifications/read-all', { method: 'POST' }).catch(() => undefined);
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    await refresh();
  };

  return (
    <AppShell
      title={t('notifications')}
      active="home"
      right={
        <button className="btn btn-ghost btn-xs" onClick={() => void markAll()}>
          {t('markAllRead')}
        </button>
      }
    >
      <div className="page page-tight">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : items.length === 0 ? (
          <EmptyState icon="bell" title={t('noNotifications')} />
        ) : (
          <div className="list">
            {items.map((item) => (
              <div
                key={item.id}
                className={item.type === 'announcement' ? 'row' : 'row static'}
                onClick={
                  item.type === 'announcement'
                    ? () => {
                        void api(`/notifications/${item.id}/read`, { method: 'POST' }).catch(
                          () => undefined
                        );
                        navigate('/announcements');
                      }
                    : undefined
                }
                style={{ background: item.readAt ? undefined : 'rgba(214,51,132,0.09)' }}
              >
                <div className="icon-btn plain">
                  <Icon name={ICON_BY_TYPE[item.type] ?? 'bell'} size={18} />
                </div>
                <div className="row-main">
                  <div className="row-title">{item.title}</div>
                  {item.body ? <div className="row-sub">{item.body}</div> : null}
                </div>
                <div className="row-meta">
                  <span>{formatTimeAgo(item.createdAt, lang)}</span>
                  {!item.readAt ? <span className="online-dot" style={{ position: 'static', width: 8, height: 8, border: 'none' }} /> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
