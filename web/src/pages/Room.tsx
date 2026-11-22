import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useRealtime } from '../lib/realtime';
import { Avatar, Icon, Spinner, useToast } from '../lib/ui';
import { AppShell } from '../components/AppShell';
import { GiftAnimation } from '../components/GiftAnimation';
import {
  RoomGiftSheet,
  type RoomGiftInfo,
  type RoomMessageData,
} from '../components/RoomGiftSheet';
import type { FrameInfo } from '../components/AvatarFrame';
import { EntryBanner } from '../components/Cosmetics';
import { RankBadge, type RankInfo } from '../components/RankBadge';
import { LevelBadge, VipBadge, VipEntryBanner, type VipInfo } from '../components/ProgressionBadges';

interface SeatUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  online: boolean;
  frame: FrameInfo | null;
  rank?: RankInfo | null;
  level?: number;
  vip?: VipInfo | null;
}

interface Mic {
  id: string;
  position: number;
  label: string;
  kind: string;
  isLocked: boolean;
  mine: boolean;
  user: SeatUser | null;
}

interface RoomData {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  rules: string;
  mics: Mic[];
}

export default function Room() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const { me } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { on } = useRealtime();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyMic, setBusyMic] = useState<string | null>(null);
  const [messages, setMessages] = useState<RoomMessageData[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [playing, setPlaying] = useState<{ gift: RoomGiftInfo; name: string } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entryCosmetic = me?.cosmetics?.entry ?? null;
  const entryShown = useRef(false);
  const [showEntry, setShowEntry] = useState(false);

  // Play the equipped room-entry animation once per visit.
  useEffect(() => {
    if (!room || entryShown.current || !entryCosmetic) return;
    entryShown.current = true;
    setShowEntry(true);
    const timer = setTimeout(() => setShowEntry(false), 3400);
    return () => clearTimeout(timer);
  }, [room, entryCosmetic]);

  const load = useCallback(async () => {
    try {
      const response = await api<{ room: RoomData }>(`/rooms/${id}`);
      setRoom(response.room);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<{ messages: RoomMessageData[] }>(`/rooms/${id}/messages`)
      .then((response) => setMessages(response.messages))
      .catch((error: Error) => toast.push(error.message, 'error'));
  }, [id, toast]);

  const append = useCallback((message: RoomMessageData) => {
    setMessages((current) =>
      current.some((item) => item.id === message.id) ? current : [...current, message].slice(-80)
    );
  }, []);

  const flash = useCallback((message: RoomMessageData) => {
    if (!message.gift) return;
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setPlaying({ gift: message.gift, name: message.displayName });
    flashTimer.current = setTimeout(() => setPlaying(null), 4500);
  }, []);

  // Seats move when anyone takes or leaves one, and when the admin edits the room.
  useEffect(() => {
    const off = on('room', (data) => {
      if (data.roomId === id) void load();
    });
    return off;
  }, [on, id, load]);

  // Live room chat and gifts.
  useEffect(() => {
    const off = on('room_message', (data) => {
      if (data.roomId !== id) return;
      const message = data.message as RoomMessageData | null;
      if (!message) return;
      append(message);
      if (message.userId !== me?.user.id) flash(message);
    });
    return off;
  }, [on, id, append, flash, me?.user.id]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  const act = async (mic: Mic) => {
    if (busyMic) return;
    if (mic.user && !mic.mine) {
      toast.push(t('micBusy'), 'error');
      return;
    }
    if (!mic.user && mic.isLocked) {
      toast.push(t('micLocked'), 'error');
      return;
    }
    setBusyMic(mic.id);
    try {
      const action = mic.mine ? 'leave' : 'take';
      const response = await api<{ room: RoomData }>(`/rooms/${id}/mics/${mic.id}/${action}`, {
        method: 'POST',
      });
      setRoom(response.room);
      toast.push(mic.mine ? t('micLeft') : t('micJoined'), 'success');
    } catch (error) {
      const code = (error as { code?: string }).code;
      toast.push(
        code === 'mic_locked' ? t('micLocked') : code === 'mic_taken' ? t('micBusy') : (error as Error).message,
        'error'
      );
      void load();
    } finally {
      setBusyMic(null);
    }
  };

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const response = await api<{ message: RoomMessageData }>(`/rooms/${id}/messages`, {
        method: 'POST',
        body: { body },
      });
      append(response.message);
      setDraft('');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const occupied = room?.mics.filter((mic) => mic.user).length ?? 0;
  const speakers =
    room?.mics
      .filter((mic) => mic.user && mic.user.id !== me?.user.id)
      .map((mic) => ({
        id: mic.user!.id,
        displayName: mic.user!.displayName,
        avatarUrl: mic.user!.avatarUrl,
      })) ?? [];

  return (
    <AppShell title={room?.name ?? t('roomsTitle')} subtitle={room?.description || t('roomsSub')} active="home">
      <div className="page">
        {showEntry && entryCosmetic ? (
          <EntryBanner cosmetic={entryCosmetic} name={me?.user.displayName ?? ''} />
        ) : showEntry && me?.vip ? (
          <VipEntryBanner vip={me.vip} name={me.user.displayName} />
        ) : null}
        {loading ? (
          <Spinner label={t('loading')} />
        ) : room ? (
          <>
            <div className="room-top">
              <span className="room-counter">
                <Icon name="mic" size={16} />
                {occupied} / {room.mics.length}
              </span>
              <button className="btn btn-ghost room-exit" onClick={() => navigate('/rooms')}>
                <Icon name="logout" size={16} /> {t('exitRoom')}
              </button>
            </div>

            <section className="card">
              <div className="section-head">
                <h2 style={{ fontSize: 16 }}>{t('roomMics')}</h2>
              </div>

              {room.mics.length === 0 ? (
                <p className="tiny muted center">{t('roomNoMics')}</p>
              ) : (
                <div className="mic-grid">
                  {room.mics.map((mic) => (
                    <button
                      key={mic.id}
                      type="button"
                      className={`mic-seat ${mic.user ? 'taken' : ''} ${mic.mine ? 'mine' : ''}`}
                      onClick={() => void act(mic)}
                      disabled={busyMic === mic.id}
                    >
                      <span className="mic-slot">
                        {mic.user ? (
                          <Avatar
                            user={{
                              displayName: mic.user.displayName,
                              avatarUrl: mic.user.avatarUrl,
                              online: mic.user.online,
                              frame: mic.user.frame,
                            }}
                            size={62}
                          />
                        ) : (
                          <span className="mic-empty">
                            <Icon name={mic.isLocked ? 'lock' : 'mic'} size={22} />
                          </span>
                        )}
                        {mic.kind === 'host' ? <span className="mic-crown">👑</span> : null}
                      </span>
                      <span className="mic-name name-with-rank">
                        {mic.user?.rank ? <RankBadge rank={mic.user.rank} size={13} /> : null}
                        {mic.user ? <LevelBadge level={mic.user.level ?? 1} size={13} /> : null}
                        <VipBadge vip={mic.user?.vip} size={12} />
                        <span>{mic.user ? mic.user.displayName : mic.isLocked ? t('micLocked') : t('micFree')}</span>
                      </span>
                      <span className="mic-label">
                        {mic.mine ? t('leaveMic') : mic.label || `${t('mic')} ${mic.position}`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {room.rules ? (
              <section className="card">
                <div className="section-head">
                  <h2 style={{ fontSize: 15 }}>{t('roomRules')}</h2>
                </div>
                <p className="muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {room.rules}
                </p>
              </section>
            ) : null}

            <section className="card room-chat">
              <div className="section-head">
                <h2 style={{ fontSize: 16 }}>{t('roomMessages')}</h2>
              </div>

              <div className="room-msgs" ref={listRef}>
                {messages.length === 0 ? (
                  <p className="tiny muted center">{t('roomMessagesEmpty')}</p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`room-msg ${message.userId === me?.user.id ? 'mine' : ''}`}
                    >
                      <Avatar
                        user={{ displayName: message.displayName, avatarUrl: message.avatarUrl }}
                        size={30}
                      />
                      <div className="room-msg-body">
                        <span className="room-msg-name">{message.displayName}</span>
                        <span className={`room-msg-text ${message.gift ? 'gift' : ''}`}>
                          {message.gift ? <Icon name="gift" size={13} /> : null}
                          {message.body}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="room-compose">
                <input
                  className="room-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void sendMessage();
                  }}
                  placeholder={t('roomMessagePlaceholder')}
                  maxLength={500}
                />
                <button
                  className="icon-btn plain"
                  onClick={() => void sendMessage()}
                  disabled={!draft.trim() || sending}
                  aria-label={t('send')}
                >
                  <Icon name="send" size={18} />
                </button>
                <button
                  className="icon-btn plain room-gift-btn"
                  onClick={() => setGiftOpen(true)}
                  aria-label={t('giftShop')}
                >
                  <Icon name="gift" size={18} />
                </button>
              </div>
            </section>

            {playing ? (
              <div className="room-gift-flash">
                <GiftAnimation gift={playing.gift} className="room-gift-flash-art" />
                <span className="room-gift-flash-label">
                  {playing.name} 🎁 {playing.gift.name}
                </span>
              </div>
            ) : null}

            <RoomGiftSheet
              open={giftOpen}
              onClose={() => setGiftOpen(false)}
              roomId={id}
              speakers={speakers}
              onSent={(message) => {
                append(message);
                flash(message);
              }}
            />
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
