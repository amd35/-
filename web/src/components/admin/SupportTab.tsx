import { useCallback, useEffect, useRef, useState } from 'react';
import { api, assetUrl, wsAdminUrl } from '../../lib/api';
import { Avatar, EmptyState, Icon, Spinner, formatTimeAgo, useToast } from '../../lib/ui';
import { AdminCard, Stat } from './shared';
import SupportMessaging, { SupportLog } from './SupportMessaging';

type Mode = 'inbox' | 'messages' | 'log';

interface TicketUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  banned: boolean;
}

interface TicketSummary {
  id: string;
  status: 'open' | 'closed';
  unread: number;
  lastMessageAt: string;
  createdAt: string;
  user: TicketUser;
  lastMessage: { body: string; type: string; mine: boolean; createdAt: string } | null;
}

interface Overview {
  stats: { open: number; closed: number; unread: number; today: number };
  tickets: TicketSummary[];
}

interface SupportMessage {
  id: string;
  body: string;
  type: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  mine: boolean;
}

interface TicketDetail {
  ticket: { id: string; status: 'open' | 'closed'; createdAt: string; closedAt: string | null; user: TicketUser };
  messages: SupportMessage[];
  events: { id: string; actor: string; action: string; detail: string | null; createdAt: string }[];
}

function previewOf(type: string, body: string): string {
  if (type === 'image') return '📷 صورة';
  if (type === 'video') return '🎬 فيديو';
  if (type === 'audio') return '🎙️ رسالة صوتية';
  if (type === 'file') return '📎 ملف';
  return body || '—';
}

/** Support inbox: every user's private conversation with the support account. */
export default function SupportTab() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('inbox');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [status, setStatus] = useState<'all' | 'open' | 'closed'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [attachment, setAttachment] = useState<{ url: string; name: string; type: string } | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const response = await api<Overview>(
        `/admin/support/overview?status=${status}&q=${encodeURIComponent(search.trim())}`,
        { admin: true }
      );
      setOverview(response);
      setSelectedId((current) => current ?? response.tickets[0]?.id ?? null);
    } catch {
      setOverview({ stats: { open: 0, closed: 0, unread: 0, today: 0 }, tickets: [] });
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  const loadDetail = useCallback(
    async (ticketId: string) => {
      setDetailLoading(true);
      try {
        const response = await api<TicketDetail>(`/admin/support/tickets/${ticketId}`, {
          admin: true,
        });
        setDetail(response);
      } catch (error) {
        toast.push((error as Error).message, 'error');
      } finally {
        setDetailLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [detail?.messages.length]);

  // Admin sockets receive a ping whenever a user writes to support.
  const refreshRef = useRef<() => void>(() => undefined);
  refreshRef.current = () => {
    void loadOverview();
    if (selectedId) void loadDetail(selectedId);
  };
  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    const connect = () => {
      if (closed) return;
      socket = new WebSocket(wsAdminUrl());
      socket.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as { event?: string };
          if (parsed.event === 'support:message') refreshRef.current();
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = () => {
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, []);

  const uploadAttachment = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await api<{ url: string; name: string; mediaType: string }>(
        '/admin/support/upload',
        { method: 'POST', admin: true, form }
      );
      setAttachment({ url: response.url, name: response.name, type: response.mediaType });
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const sendReply = async () => {
    if (!selectedId) return;
    const body = reply.trim();
    if (!body && !attachment) return;
    setSending(true);
    try {
      await api(`/admin/support/tickets/${selectedId}/reply`, {
        method: 'POST',
        admin: true,
        body: {
          body,
          type: attachment?.type ?? 'text',
          attachmentUrl: attachment?.url ?? null,
          attachmentName: attachment?.name ?? null,
        },
      });
      setReply('');
      setAttachment(null);
      await loadDetail(selectedId);
      await loadOverview();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (next: 'open' | 'closed') => {
    if (!selectedId) return;
    try {
      await api(`/admin/support/tickets/${selectedId}/status`, {
        method: 'POST',
        admin: true,
        body: { status: next },
      });
      toast.push(next === 'closed' ? 'تم إغلاق البلاغ' : 'تم إعادة فتح البلاغ', 'success');
      await loadDetail(selectedId);
      await loadOverview();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`chip ${mode === 'inbox' ? 'chip-on' : ''}`}
          onClick={() => setMode('inbox')}
        >
          المحادثات
        </button>
        <button
          type="button"
          className={`chip ${mode === 'messages' ? 'chip-on' : ''}`}
          onClick={() => setMode('messages')}
        >
          الرسائل والإعلانات
        </button>
        <button
          type="button"
          className={`chip ${mode === 'log' ? 'chip-on' : ''}`}
          onClick={() => setMode('log')}
        >
          السجل
        </button>
      </div>

      {mode === 'messages' ? <SupportMessaging /> : null}
      {mode === 'log' ? <SupportLog /> : null}

      {mode === 'inbox' ? (
        <>
          <div className="stat-grid">
            <Stat label="بلاغات جديدة" value={overview?.stats.unread ?? 0} accent="#ff5fa2" />
            <Stat label="مفتوحة" value={overview?.stats.open ?? 0} />
            <Stat label="مغلقة" value={overview?.stats.closed ?? 0} />
            <Stat label="بلاغات اليوم" value={overview?.stats.today ?? 0} />
          </div>

          <AdminCard
            title="صندوق الدعم الفني"
            subtitle="رسائل المستخدمين تصل هنا فوراً"
            actions={
              <button className="btn btn-ghost btn-sm" onClick={() => void loadOverview()}>
                <Icon name="refresh" size={15} /> تحديث
              </button>
            }
          >
            <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
              <div className="search" style={{ flex: 1, minWidth: 220 }}>
                <Icon name="search" size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ابحث بالاسم أو رقم الـ ID"
                />
              </div>
              {(['all', 'open', 'closed'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`chip ${status === item ? 'chip-on' : ''}`}
                  onClick={() => setStatus(item)}
                >
                  {item === 'all' ? 'الكل' : item === 'open' ? 'مفتوحة' : 'مغلقة'}
                </button>
              ))}
            </div>

            {loading ? (
              <Spinner label="جارٍ التحميل…" />
            ) : !overview || overview.tickets.length === 0 ? (
              <EmptyState icon="chat" title="لا توجد بلاغات" hint="ستظهر هنا أول رسالة يرسلها أي مستخدم للدعم" />
            ) : (
              <div className="support-layout">
                <div className="support-list">
                  {overview.tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      className={`support-item ${selectedId === ticket.id ? 'active' : ''}`}
                      onClick={() => {
                        if (selectedId !== ticket.id) {
                          setSelectedId(ticket.id);
                          setDetail(null);
                        }
                        setReply('');
                        setAttachment(null);
                      }}
                    >
                      <Avatar user={ticket.user} size={40} />
                      <span className="row-main">
                        <span className="row-title">
                          {ticket.user.displayName}
                          <span className="tiny muted">#{ticket.user.username}</span>
                        </span>
                        <span className="row-sub">
                          {ticket.lastMessage ? previewOf(ticket.lastMessage.type, ticket.lastMessage.body) : '—'}
                        </span>
                      </span>
                      <span className="row-meta">
                        <span className="tiny muted">
                          {formatTimeAgo(ticket.lastMessageAt, 'ar')}
                        </span>
                        {ticket.unread > 0 ? (
                          <span className="pill pill-pink" style={{ padding: '2px 8px', fontSize: 10 }}>
                            {ticket.unread}
                          </span>
                        ) : null}
                        <span className={`support-state ${ticket.status}`}>
                          {ticket.status === 'open' ? 'مفتوح' : 'مغلق'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="support-thread">
                  {!selectedId ? (
                    <EmptyState icon="chat" title="اختر محادثة" />
                  ) : detailLoading && !detail ? (
                    <Spinner label="جارٍ فتح المحادثة…" />
                  ) : detail ? (
                    <>
                      <div className="support-thread-head">
                        <Avatar user={detail.ticket.user} size={38} />
                        <div className="grow" style={{ minWidth: 0 }}>
                          <div className="row-title">{detail.ticket.user.displayName}</div>
                          <div className="row-sub tiny muted">
                            #{detail.ticket.user.username}
                            {detail.ticket.user.banned ? ' · محظور' : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`btn btn-sm ${detail.ticket.status === 'open' ? 'btn-ghost' : 'btn-primary'}`}
                          onClick={() => void changeStatus(detail.ticket.status === 'open' ? 'closed' : 'open')}
                        >
                          {detail.ticket.status === 'open' ? 'إغلاق البلاغ' : 'إعادة الفتح'}
                        </button>
                      </div>

                      <div className="support-messages" ref={threadRef}>
                        {detail.messages.map((message) => (
                          <div key={message.id} className={`msg ${message.mine ? 'msg-mine' : ''}`}>
                            <div className="msg-bubble">
                              {message.type === 'image' && message.attachmentUrl ? (
                                <img src={assetUrl(message.attachmentUrl)} alt={message.attachmentName || ''} />
                              ) : null}
                              {message.type === 'video' && message.attachmentUrl ? (
                                <video className="msg-media" src={assetUrl(message.attachmentUrl)} controls playsInline />
                              ) : null}
                              {message.type === 'audio' && message.attachmentUrl ? (
                                <audio className="msg-audio" src={assetUrl(message.attachmentUrl)} controls />
                              ) : null}
                              {message.type === 'file' && message.attachmentUrl ? (
                                <a href={assetUrl(message.attachmentUrl)} target="_blank" rel="noreferrer">
                                  <Icon name="package" size={15} /> {message.attachmentName || 'ملف'}
                                </a>
                              ) : null}
                              {message.body ? <div>{message.body}</div> : null}
                              <div className="msg-meta">
                                <span>{new Date(message.createdAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}</span>
                                {message.mine ? (
                                  <Icon
                                    name={message.readAt || message.deliveredAt ? 'checkCheck' : 'check'}
                                    size={13}
                                    className={message.readAt ? 'tick tick-read' : message.deliveredAt ? 'tick tick-delivered' : 'tick tick-sent'}
                                  />
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="support-composer">
                        <input
                          ref={fileRef}
                          type="file"
                          hidden
                          accept="image/*,video/*,audio/*"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void uploadAttachment(file);
                            event.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => fileRef.current?.click()}
                          aria-label="attach"
                        >
                          <Icon name="image" size={18} />
                        </button>
                        {attachment ? (
                          <span className="pill" style={{ maxWidth: 160, overflow: 'hidden' }}>
                            {attachment.name}
                            <button type="button" className="icon-btn plain" onClick={() => setAttachment(null)}>
                              ×
                            </button>
                          </span>
                        ) : null}
                        <textarea
                          className="textarea"
                          value={reply}
                          onChange={(event) => setReply(event.target.value)}
                          placeholder="اكتب رد الدعم الفني…"
                          rows={1}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => void sendReply()}
                          disabled={sending || (!reply.trim() && !attachment)}
                        >
                          {sending ? <span className="spinner" /> : <Icon name="send" size={16} />}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            )}
          </AdminCard>
        </>
      ) : null}
    </div>
  );
}
