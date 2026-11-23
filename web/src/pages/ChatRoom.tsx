import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, assetUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCall } from '../lib/call';
import { useI18n } from '../lib/i18n';
import { useRealtime } from '../lib/realtime';
import { Avatar, EmptyState, formatClock, formatCoins, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { GiftReveal, GiftAnimation, type GiftVisual } from '../components/GiftAnimation';
import { RankBadge, type RankInfo } from '../components/RankBadge';
import { ADMIN_BADGE_BY_RANK, AdminBubbleDecor } from '../components/AdminRoyal';
import { LevelBadge, VipBadge, type VipInfo } from '../components/ProgressionBadges';
import { GiftShop, type GiftItem, type GiftMessage } from '../components/GiftShop';

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  type: 'text' | 'image' | 'file' | 'video' | 'audio' | 'gift';
  attachmentUrl: string | null;
  attachmentName?: string | null;
  createdAt: string;
  deliveredAt?: string | null;
  readAt: string | null;
  mine: boolean;
  gift?: GiftMessage['gift'];
}

interface Peer {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  online?: boolean;
  lastSeenAt?: string | null;
  frame?: { id: string; design: string | null; kind: string; imageUrl: string | null; rarity: string } | null;
  rank?: RankInfo | null;
  level?: number;
  vip?: VipInfo | null;
  isSupport?: boolean;
}

export default function ChatRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { me, refresh } = useAuth();
  const { on, send, online } = useRealtime();
  const { startCall } = useCall();
  const toast = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [peerTyping, setPeerTyping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [reveal, setReveal] = useState<{ gift: GiftVisual; senderName: string; recipientName?: string } | null>(
    null
  );

  const listRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingAt = useRef(0);

  const appendMessage = (message: Message) => {
    setMessages((current) =>
      current.some((item) => item.id === message.id) ? current : [...current, message]
    );
  };

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    api<{ messages: Message[]; peer: Peer | null }>(`/chat/conversations/${id}/messages`)
      .then((response) => {
        if (!alive) return;
        setMessages(response.messages);
        setPeer(response.peer);
      })
      .catch((error: Error) => toast.push(error.message, 'error'))
      .finally(() => {
        if (alive) setLoading(false);
      });
    void api(`/chat/conversations/${id}/read`, { method: 'POST' })
      .then(() => refresh())
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id, refresh, toast]);

  useEffect(() => {
    const element = listRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages.length, peerTyping, loading]);

  useEffect(() => {
    if (!id) return;
    const offNew = on('message:new', (data) => {
      if (String(data.conversationId) !== id) return;
      const incoming = data as unknown as Message;
      appendMessage({ ...incoming, mine: incoming.senderId === me?.user.id });
      if (incoming.senderId !== me?.user.id) {
        setPeerTyping(false);
        if (incoming.type === 'gift' && incoming.gift) {
          setReveal({ gift: incoming.gift, senderName: peer?.displayName ?? '' });
        }
        void api(`/chat/conversations/${id}/read`, { method: 'POST' })
          .then(() => refresh())
          .catch(() => undefined);
      }
    });
    const offRead = on('message:read', (data) => {
      if (String(data.conversationId) !== id) return;
      setMessages((current) =>
        current.map((message) =>
          message.mine && !message.readAt ? { ...message, readAt: new Date().toISOString() } : message
        )
      );
    });
    const offDelivered = on('message:delivered', (data) => {
      if (String(data.conversationId) !== id) return;
      setMessages((current) =>
        current.map((message) =>
          message.mine && !message.deliveredAt
            ? { ...message, deliveredAt: new Date().toISOString() }
            : message
        )
      );
    });
    const offTyping = on('chat:typing', (data) => {
      if (String(data.conversationId) !== id) return;
      setPeerTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setPeerTyping(false), 2600);
    });
    return () => {
      offNew();
      offRead();
      offDelivered();
      offTyping();
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, id, me?.user.id]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = text.trim();
    if (!body || !id || sending) return;
    setSending(true);
    setText('');
    try {
      const response = await api<{ message: Message }>(`/chat/conversations/${id}/messages`, {
        method: 'POST',
        body: { body, type: 'text' },
      });
      appendMessage({ ...response.message, mine: true });
    } catch (error) {
      toast.push((error as Error).message, 'error');
      setText(body);
    } finally {
      setSending(false);
    }
  };

  const sendAttachment = async (file: File) => {
    if (!id) return;
    const form = new FormData();
    form.append('file', file);
    const upload = await api<{ url: string; name: string; mime: string }>('/uploads', {
      method: 'POST',
      form,
    });
    const mime = upload.mime || file.type || '';
    const type = mime.startsWith('image/')
      ? 'image'
      : mime.startsWith('video/')
        ? 'video'
        : mime.startsWith('audio/')
          ? 'audio'
          : 'file';
    const response = await api<{ message: Message }>(`/chat/conversations/${id}/messages`, {
      method: 'POST',
      body: { body: '', type, attachmentUrl: upload.url, attachmentName: upload.name },
    });
    appendMessage({ ...response.message, mine: true });
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !id) return;
    try {
      await sendAttachment(file);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      event.target.value = '';
    }
  };

  const toggleRecord = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 500) return;
        const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `voice-${Date.now()}.${extension}`, {
          type: blob.type || 'audio/webm',
        });
        void sendAttachment(file).catch((error: Error) => toast.push(error.message, 'error'));
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.push('تعذر الوصول إلى الميكروفون', 'error');
    }
  };

  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
        recorder.stream.getTracks().forEach((track) => track.stop());
      }
    },
    []
  );

  const onChangeText = (value: string) => {
    setText(value);
    if (!id) return;
    const now = Date.now();
    if (now - lastTypingAt.current > 1500) {
      lastTypingAt.current = now;
      send('chat:typing', { conversationId: id });
    }
  };

  const callPeer = (kind: 'voice' | 'video') => {
    if (!peer) return;
    void startCall({ id: peer.id, displayName: peer.displayName, avatarUrl: peer.avatarUrl }, kind);
  };

  const deleteConversation = async () => {
    if (!id) return;
    try {
      await api(`/chat/conversations/${id}`, { method: 'DELETE' });
      navigate('/chats');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const blockPeer = async () => {
    if (!peer) return;
    try {
      await api(`/users/${peer.id}/block`, { method: 'POST' });
      toast.push(t('blocked'), 'success');
      setMenuOpen(false);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const reportPeer = async () => {
    if (!peer) return;
    try {
      await api(`/users/${peer.id}/report`, {
        method: 'POST',
        body: { reason: 'abuse', details: 'Reported from chat' },
      });
      toast.push(t('report'), 'success');
      setMenuOpen(false);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const isOnline = peer ? online.has(peer.id) || peer.online : false;

  return (
    <div className="chat-screen" style={{ height: '100dvh' }}>
      <header className="chat-head">
        <button className="icon-btn plain" onClick={() => navigate('/chats')} aria-label="back">
          <Icon name="arrowRight" size={20} />
        </button>
        <Avatar user={{ ...peer, online: isOnline }} size={40} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row-title name-with-rank">
            {peer?.rank ? <RankBadge rank={peer.rank} size={15} /> : null}
            <LevelBadge level={peer?.level ?? 1} size={14} />
            <VipBadge vip={peer?.vip} size={13} />
            <span>{peer?.displayName ?? t('loading')}</span>
            {peer?.isSupport ? <span className="official-badge">{t('officialBadge')}</span> : null}
          </div>
          <div className="row-sub">
            {peerTyping ? '…' : isOnline ? t('onlineNow') : t('offline')}
          </div>
        </div>
        {!peer?.isSupport ? (
          <>
            <button
              className="icon-btn"
              onClick={() => callPeer('voice')}
              aria-label="voice call"
              disabled={!peer}
            >
              <Icon name="phone" size={18} />
            </button>
            <button
              className="icon-btn"
              onClick={() => callPeer('video')}
              aria-label="video call"
              disabled={!peer}
            >
              <Icon name="video" size={18} />
            </button>
          </>
        ) : null}
        <button className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="menu">
          <Icon name="settings" size={18} />
        </button>
      </header>

      <div className="messages" ref={listRef} style={{ overflowY: 'auto' }}>
        {loading ? <Spinner label={t('loading')} /> : null}
        {!loading && messages.length === 0 ? (
          <EmptyState icon="chat" title={t('noChats')} hint={t('typeMessage')} />
        ) : null}
        {messages.map((message) => {
          const adminSender = message.mine
            ? me?.adminLook
              ? { label: me.adminLook.label, effects: me.adminLook.effectsEnabled }
              : null
            : peer?.rank && ADMIN_BADGE_BY_RANK[peer.rank.key]
              ? { label: peer.rank.nameAr, effects: true }
              : null;
          return (
          <div key={message.id} className={`msg ${message.mine ? 'msg-mine' : ''}`}>
            {message.type === 'gift' && message.gift ? (
              <button
                className={`msg-gift rarity-${message.gift.rarity}`}
                onClick={() =>
                  setReveal({
                    gift: message.gift!,
                    senderName: message.mine ? me?.user.displayName ?? '' : peer?.displayName ?? '',
                    recipientName: message.mine ? peer?.displayName : me?.user.displayName,
                  })
                }
              >
                <GiftAnimation gift={message.gift} className="msg-gift-art" />
                <span className="msg-gift-copy">
                  <b>{message.gift.name}</b>
                  <span className="tiny">
                    <Icon name="coins" size={12} /> {formatCoins(message.gift.price)}
                  </span>
                </span>
                <span className="msg-gift-play">
                  <Icon name="play" size={14} />
                </span>
              </button>
            ) : (
            <div
              className={`msg-bubble ${adminSender ? 'bubble-admin' : ''}${
                !adminSender && message.mine && me?.cosmetics?.bubble?.design
                  ? ` bubble-${me.cosmetics.bubble.design}`
                  : ''
              }${
                !adminSender &&
                message.mine &&
                ((me?.cosmetics?.bubble?.kind === 'image' && me.cosmetics.bubble.imageUrl) ||
                  me?.vip?.bubbleImageUrl)
                  ? ' bubble-image'
                  : ''
              }`}
              style={
                message.mine
                  ? me?.cosmetics?.bubble?.kind === 'image' && me.cosmetics.bubble.imageUrl
                    ? { backgroundImage: `url(${assetUrl(me.cosmetics.bubble.imageUrl)})` }
                    : me?.vip?.bubbleImageUrl
                      ? { backgroundImage: `url(${assetUrl(me.vip.bubbleImageUrl)})` }
                      : undefined
                  : undefined
              }
            >
              {adminSender ? (
                <AdminBubbleDecor label={adminSender.label} effects={adminSender.effects} />
              ) : null}
              {message.type === 'image' && message.attachmentUrl ? (
                <img src={assetUrl(message.attachmentUrl)} alt={message.attachmentName || 'image'} />
              ) : null}
              {message.type === 'video' && message.attachmentUrl ? (
                <video className="msg-media" src={assetUrl(message.attachmentUrl)} controls playsInline />
              ) : null}
              {message.type === 'audio' && message.attachmentUrl ? (
                <audio className="msg-audio" src={assetUrl(message.attachmentUrl)} controls />
              ) : null}
              {message.type === 'file' && message.attachmentUrl ? (
                <a href={assetUrl(message.attachmentUrl)} target="_blank" rel="noreferrer" className="inline">
                  <Icon name="package" size={16} /> {message.attachmentName || t('file')}
                </a>
              ) : null}
              {message.body ? <div>{message.body}</div> : null}
              <div className="msg-meta">
                <span>{formatClock(message.createdAt)}</span>
                {message.mine ? (
                  <Icon
                    name={message.readAt || message.deliveredAt ? 'checkCheck' : 'check'}
                    size={13}
                    className={
                      message.readAt ? 'tick tick-read' : message.deliveredAt ? 'tick tick-delivered' : 'tick tick-sent'
                    }
                  />
                ) : null}
              </div>
            </div>
            )}
          </div>
          );
        })}
        {peerTyping ? (
          <div className="msg">
            <div className="msg-bubble tiny muted">{t('typeMessage')}</div>
          </div>
        ) : null}
      </div>

      {recording ? <div className="rec-hint">{t('recording')}</div> : null}
      <form className="composer" onSubmit={submit}>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
          onChange={(event) => void onFile(event)}
        />
        <button
          type="button"
          className="icon-btn gift-btn"
          onClick={() => setGiftOpen(true)}
          aria-label={t('giftShop')}
          disabled={!peer}
        >
          <Icon name="gift" size={20} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => fileRef.current?.click()}
          aria-label="attach"
        >
          <Icon name="image" size={19} />
        </button>
        <textarea
          value={text}
          onChange={(event) => onChangeText(event.target.value)}
          placeholder={t('typeMessage')}
          rows={1}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit(event);
            }
          }}
        />
        <button
          type="button"
          className={`icon-btn ${recording ? 'rec-btn active' : ''}`}
          onClick={() => void toggleRecord()}
          aria-label={t('recordVoice')}
          title={recording ? t('recording') : t('recordVoice')}
          disabled={!peer}
        >
          <Icon name={recording ? 'micOff' : 'mic'} size={19} />
        </button>
        <button className="send-btn" disabled={!text.trim() || sending} aria-label="send">
          <Icon name="send" size={19} />
        </button>
      </form>

      {id && peer ? (
        <GiftShop
          open={giftOpen}
          onClose={() => setGiftOpen(false)}
          conversationId={id}
          peerName={peer.displayName}
          onSent={(message: GiftMessage, gift: GiftItem) => {
            appendMessage({ ...message, mine: true });
            setReveal({
              gift: { ...gift, price: gift.price },
              senderName: me?.user.displayName ?? '',
              recipientName: peer.displayName,
            });
          }}
        />
      ) : null}

      {reveal ? (
        <GiftReveal
          gift={reveal.gift}
          senderName={reveal.senderName}
          recipientName={reveal.recipientName}
          onClose={() => setReveal(null)}
        />
      ) : null}

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title={peer?.displayName}>
        <div className="stack">
          {peer?.isSupport ? (
            <div className="tiny muted center" style={{ padding: '10px 4px' }}>
              هذه محادثة الدعم الفني الرسمية — تُحفظ تلقائياً ولا يمكن حذفها.
            </div>
          ) : (
            <>
              <button className="btn btn-ghost btn-block" onClick={() => void blockPeer()}>
                <Icon name="ban" size={17} /> {t('block')}
              </button>
              <button className="btn btn-ghost btn-block" onClick={() => void reportPeer()}>
                <Icon name="alert" size={17} /> {t('report')}
              </button>
              <button className="btn btn-danger btn-block" onClick={() => void deleteConversation()}>
                <Icon name="trash" size={17} /> {t('deleteChat')}
              </button>
            </>
          )}
        </div>
      </Sheet>
    </div>
  );
}
