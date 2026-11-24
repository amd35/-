import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useRealtime } from '../lib/realtime';
import {
  Avatar,
  EmptyState,
  formatTimeAgo,
  Icon,
  Sheet,
  useAsyncData,
  useToast,
} from '../lib/ui';
import { AppShell } from '../components/AppShell';
import type { UserCardData } from '../components/UserCard';
import { LevelBadge, VipBadge, type VipInfo } from '../components/ProgressionBadges';

interface Conversation {
  id: string;
  lastMessageAt: string;
  unread: number;
  peer: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    online: boolean;
    lastSeenAt: string | null;
    frame?: UserCardData['frame'];
    level?: number;
    vip?: VipInfo | null;
    isSupport?: boolean;
  };
  lastMessage: { body: string; type: string; attachmentUrl: string | null; mine: boolean; createdAt: string } | null;
}

export default function Chats() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const { online, on } = useRealtime();
  const { refresh } = useAuth();
  const { data, loading, reload } = useAsyncData(
    () => api<{ conversations: Conversation[] }>('/chat/conversations'),
    []
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<UserCardData[]>([]);

  useEffect(() => {
    const off = on('message:new', () => reload());
    const offRead = on('message:read', () => reload());
    return () => {
      off();
      offRead();
    };
  }, [on, reload]);

  useEffect(() => {
    if (!sheetOpen) return;
    api<{ users: UserCardData[] }>(`/users?q=${encodeURIComponent(search)}`)
      .then((response) => setPeople(response.users))
      .catch(() => undefined);
  }, [sheetOpen, search]);

  const openConversation = async (userId: string) => {
    try {
      const response = await api<{ conversationId: string }>('/chat/conversations', {
        method: 'POST',
        body: { userId },
      });
      setSheetOpen(false);
      navigate(`/chats/${response.conversationId}`);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const conversations = data?.conversations ?? [];

  return (
    <AppShell
      title={t('chats')}
      active="chats"
      right={
        <button className="icon-btn" onClick={() => setSheetOpen(true)} aria-label="new chat">
          <Icon name="plus" size={19} />
        </button>
      }
    >
      <div className="page page-tight">
        {loading ? (
          <div className="stack">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState
            icon="chat"
            title={t('noChats')}
            action={
              <button className="btn btn-primary btn-sm" onClick={() => setSheetOpen(true)}>
                {t('message')}
              </button>
            }
          />
        ) : (
          <div className="list">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className="row"
                onClick={() => {
                  void api(`/chat/conversations/${conversation.id}/read`, { method: 'POST' }).catch(
                    () => undefined
                  );
                  void refresh();
                  navigate(`/chats/${conversation.id}`);
                }}
              >
                <Avatar
                  user={{ ...conversation.peer, online: online.has(conversation.peer.id) || conversation.peer.online }}
                />
                <div className="row-main">
                  <div className="row-title name-with-rank">
                    <LevelBadge level={conversation.peer.level ?? 1} size={13} />
                    <VipBadge vip={conversation.peer.vip} size={12} />
                    <span>{conversation.peer.displayName}</span>
                    {conversation.peer.isSupport ? (
                      <span className="official-badge">{t('officialBadge')}</span>
                    ) : null}
                  </div>
                  <div className="row-sub">
                    {conversation.lastMessage
                      ? `${conversation.lastMessage.mine ? `${t('send')}: ` : ''}${
                          conversation.lastMessage.type === 'image'
                            ? `📷 ${t('photo')}`
                            : conversation.lastMessage.type === 'video'
                              ? `🎬 ${t('videoMessage')}`
                              : conversation.lastMessage.type === 'audio'
                                ? `🎙️ ${t('voiceMessage')}`
                                : conversation.lastMessage.type === 'file'
                                  ? `📎 ${t('file')}`
                                  : conversation.lastMessage.body
                        }`
                      : t('noChats')}
                  </div>
                </div>
                <div className="row-meta">
                  <span>{formatTimeAgo(conversation.lastMessageAt, lang)}</span>
                  {conversation.unread > 0 ? (
                    <span className="pill pill-pink" style={{ padding: '2px 8px', fontSize: 10 }}>
                      {conversation.unread}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t('message')}>
        <div className="stack">
          <div className="search">
            <Icon name="search" size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('search')}
              autoFocus
            />
          </div>
          <div className="list">
            {people.map((person) => (
              <div key={person.id} className="row" onClick={() => void openConversation(person.id)}>
                <Avatar user={{ ...person, online: online.has(person.id) || person.online }} />
                <div className="row-main">
                  <div className="row-title">{person.displayName}</div>
                  <div className="row-sub">#{person.username}</div>
                </div>
                <Icon name="chat" size={18} />
              </div>
            ))}
            {people.length === 0 ? <EmptyState icon="users" title={t('noResults')} /> : null}
          </div>
        </div>
      </Sheet>
    </AppShell>
  );
}
