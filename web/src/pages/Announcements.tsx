import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useRealtime } from '../lib/realtime';
import { EmptyState, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { AppShell } from '../components/AppShell';
import {
  AnnouncementCard,
  type AnnouncementCategory,
  type AnnouncementData,
} from '../components/announcements/AnnouncementCard';

interface AnnouncementsResponse {
  categories: AnnouncementCategory[];
  emojis: string[];
  unread: number;
  announcements: AnnouncementData[];
}

export default function Announcements() {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const { on } = useRealtime();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<AnnouncementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [replyTo, setReplyTo] = useState<AnnouncementData | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api<AnnouncementsResponse>('/announcements');
      setData(response);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const offs = [
      on('announcement:new', () => void load()),
      on('announcement:updated', () => void load()),
      on('announcement:reaction', (payload) => {
        setData((current) => {
          if (!current) return current;
          const id = String(payload.announcementId || '');
          const reactions = (payload.reactions as Record<string, number> | undefined) ?? {};
          const reactionCount = Number(payload.reactionCount || 0);
          return {
            ...current,
            announcements: current.announcements.map((item) =>
              item.id === id ? { ...item, reactions, reactionCount } : item
            ),
          };
        });
      }),
      on('announcement:comment', () => void load()),
    ];
    return () => offs.forEach((off) => off());
  }, [on, load]);

  const markAll = async () => {
    await api('/announcements/read-all', { method: 'POST' }).catch(() => undefined);
    setData((current) =>
      current
        ? {
            ...current,
            unread: 0,
            announcements: current.announcements.map((item) => ({ ...item, read: true })),
          }
        : current
    );
    await refresh();
  };

  const view = async (id: string) => {
    await api(`/announcements/${id}/view`, { method: 'POST' }).catch(() => undefined);
    setData((current) =>
      current
        ? {
            ...current,
            announcements: current.announcements.map((item) =>
              item.id === id ? { ...item, read: true, viewed: true, views: item.views + 1 } : item
            ),
          }
        : current
    );
    await refresh();
  };

  const react = async (id: string, emoji: string) => {
    try {
      const response = await api<{ myReaction: string | null; reactions: Record<string, number> }>(
        `/announcements/${id}/reaction`,
        { method: 'POST', body: { emoji } }
      );
      setData((current) =>
        current
          ? {
              ...current,
              announcements: current.announcements.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      myReaction: response.myReaction,
                      reactions: response.reactions,
                      reactionCount: Object.values(response.reactions).reduce(
                        (sum, value) => sum + value,
                        0
                      ),
                    }
                  : item
              ),
            }
          : current
      );
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const sendReply = async () => {
    if (!replyTo) return;
    setSendingReply(true);
    try {
      const response = await api<{ conversationId: string }>(
        `/announcements/${replyTo.id}/reply`,
        { method: 'POST', body: { message: replyText } }
      );
      setReplyTo(null);
      setReplyText('');
      navigate(`/chats/${response.conversationId}`);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSendingReply(false);
    }
  };

  const categories = data?.categories ?? [];
  const visible = useMemo(() => {
    const list = data?.announcements ?? [];
    return filter === 'all' ? list : list.filter((item) => item.category === filter);
  }, [data, filter]);

  return (
    <AppShell
      title={t('announcements')}
      subtitle={t('announcementsSub')}
      active="home"
      right={
        <div className="inline">
          {(data?.unread ?? 0) > 0 ? (
            <button className="btn btn-ghost btn-xs" onClick={() => void markAll()}>
              {t('markAllRead')}
            </button>
          ) : null}
          <button className="icon-btn" onClick={() => navigate(-1)} aria-label="back">
            <Icon name="arrowRight" size={19} />
          </button>
        </div>
      }
    >
      <div className="page page-tight">
        <div className="chip-row">
          <button
            className={`tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('allCategories')}
          </button>
          {categories.map((category) => (
            <button
              key={category.key}
              className={`tab ${filter === category.key ? 'active' : ''}`}
              onClick={() => setFilter(category.key)}
            >
              {category.labelAr}
            </button>
          ))}
        </div>

        {loading ? (
          <Spinner label={t('loading')} />
        ) : visible.length === 0 ? (
          <EmptyState icon="megaphone" title={t('noAnnouncements')} />
        ) : (
          <div className="stack">
            {visible.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                categories={categories}
                emojis={data?.emojis ?? []}
                onView={view}
                onReact={react}
                onReply={(item) => {
                  setReplyTo(item);
                  setReplyText('');
                }}
                onChanged={() => void load()}
              />
            ))}
          </div>
        )}
      </div>

      <Sheet
        open={Boolean(replyTo)}
        onClose={() => setReplyTo(null)}
        title={t('replyToAnnouncement')}
      >
        <div className="stack">
          <p className="tiny muted">{replyTo?.title}</p>
          <textarea
            className="textarea"
            value={replyText}
            maxLength={1500}
            placeholder={t('writeComment')}
            onChange={(event) => setReplyText(event.target.value)}
          />
          <button
            className="btn btn-primary btn-block"
            disabled={sendingReply}
            onClick={() => void sendReply()}
          >
            {sendingReply ? <span className="spinner" /> : t('contactSupport')}
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}
