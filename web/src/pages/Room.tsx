import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, assetUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useRealtime } from '../lib/realtime';
import { Icon, Spinner, useToast } from '../lib/ui';
import {
  RoomGiftSheet,
  type RoomMessageData,
} from '../components/RoomGiftSheet';
import { EntryBanner } from '../components/Cosmetics';
import { VipEntryBanner } from '../components/ProgressionBadges';
import { ADMIN_BADGE_BY_RANK } from '../components/AdminRoyal';
import { RoomBackdrop } from '../components/room/RoomBackdrop';
import { RoomHeader } from '../components/room/RoomHeader';
import { RoomBottomBar } from '../components/room/RoomBottomBar';
import { MicSeat, type RoomMic } from '../components/room/MicSeat';
import { RoomMembersPanel, type PresenceUser } from '../components/room/RoomMembersPanel';
import { RoomInvitePanel } from '../components/room/RoomInvitePanel';
import { RoomSettingsPanel, type RoomSettingsPatch } from '../components/room/RoomSettingsPanel';
import { RoomMusicPanel } from '../components/room/RoomMusicPanel';
import { RoomChatPanel } from '../components/room/RoomChatPanel';
import { RoomCup } from '../components/room/RoomCup';
import { RoomFramesSheet, type WornFrame } from '../components/room/RoomFramesSheet';
import { RoomStoreSheet } from '../components/room/RoomStoreSheet';
import type { RoomCapacity, RoomData, RoomMemberEntry, RoomStoreData } from '../components/room/types';
import { useRoomVoice } from '../lib/roomVoice';
import { useVoiceModeration, voiceModerationSupported } from '../lib/voiceModeration';
import {
  RoomGiftAnnouncement,
  type GiftAnnouncement,
} from '../components/room/RoomGiftAnnouncement';
import { UserProfileCard } from '../components/profile/UserProfileCard';
import { UserProfileScreen } from '../components/profile/UserProfileScreen';

type Panel = 'chat' | 'members' | 'invite' | 'settings' | 'music' | null;

/** A worn frame plus the local moment it disappears (server time converted once). */
type LiveFrame = WornFrame & { endsAt: number };

export default function Room() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const { me } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { on, send, connected } = useRealtime();

  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyMic, setBusyMic] = useState<string | null>(null);
  const [messages, setMessages] = useState<RoomMessageData[]>([]);
  const [sending, setSending] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTarget, setGiftTarget] = useState<string | null>(null);
  const [framesOpen, setFramesOpen] = useState(false);
  const [frames, setFrames] = useState<Record<string, LiveFrame>>({});
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [fullProfileId, setFullProfileId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<GiftAnnouncement | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [members, setMembers] = useState<RoomMemberEntry[]>([]);
  const [memberBusy, setMemberBusy] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeData, setStoreData] = useState<RoomStoreData | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [forcedMute, setForcedMute] = useState(0);
  const [musicMuted, setMusicMuted] = useState(false);
  const announcementRef = useRef<GiftAnnouncement | null>(null);
  const announcementQueue = useRef<GiftAnnouncement[]>([]);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const entryShown = useRef(false);
  const [showEntry, setShowEntry] = useState(false);
  const [safetyMonitor, setSafetyMonitor] = useState(false);

  const entryCosmetic = me?.cosmetics?.entry ?? null;
  const myMic = room?.mics.find((mic) => mic.mine) ?? null;
  const speakerIds = useMemo(
    () => room?.mics.filter((mic) => mic.user).map((mic) => mic.user!.id) ?? [],
    [room]
  );
  const voice = useRoomVoice({
    roomId: id,
    meId: me?.user.id ?? null,
    micOn: Boolean(myMic),
    speakerIds,
    forcedMute,
  });

  // Opt-in voice safety monitor: transcribes only while the user enables it.
  useVoiceModeration({
    roomId: id,
    enabled: safetyMonitor && Boolean(myMic) && !myMic?.muted,
    onFlagged: (reason) => {
      setSafetyMonitor(false);
      toast.push(reason || 'تم كتم المايك بواسطة نظام الحماية', 'error');
    },
  });

  const load = useCallback(async () => {
    try {
      const response = await api<{ room: RoomData }>(`/rooms/${id}`);
      setRoom(response.room);
      // The server sends the real time left, so a rejoin never shows a dead frame.
      const now = Date.now();
      const live: Record<string, LiveFrame> = {};
      for (const frame of response.room.frames ?? []) {
        const remaining = Number(frame.remainingMs);
        if (remaining > 0) live[frame.userId] = { ...frame, endsAt: now + remaining };
      }
      setFrames(live);
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

  // Play the equipped room-entry animation once per visit.
  useEffect(() => {
    if (!room || entryShown.current) return;
    if (!entryCosmetic && !me?.vip) return;
    entryShown.current = true;
    setShowEntry(true);
    const timer = setTimeout(() => setShowEntry(false), 3400);
    return () => clearTimeout(timer);
  }, [room, entryCosmetic, me?.vip]);

  /** Puts a freshly gifted frame around its recipient's avatar. */
  const applyFrame = useCallback((frame: WornFrame) => {
    const remaining = Number(frame.remainingMs);
    if (!(remaining > 0)) return;
    setFrames((current) => ({ ...current, [frame.userId]: { ...frame, endsAt: Date.now() + remaining } }));
  }, []);

  // A gifted frame removes itself the moment the server's minute is over.
  useEffect(() => {
    const timer = setInterval(() => {
      setFrames((current) => {
        const now = Date.now();
        const entries = Object.entries(current);
        const live = entries.filter(([, frame]) => frame.endsAt > now);
        return live.length === entries.length ? current : Object.fromEntries(live);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const append = useCallback((message: RoomMessageData) => {
    setMessages((current) =>
      current.some((item) => item.id === message.id) ? current : [...current, message].slice(-80)
    );
  }, []);

  const setActiveAnnouncement = useCallback((item: GiftAnnouncement | null) => {
    announcementRef.current = item;
    setAnnouncement(item);
  }, []);

  /** One bar at a time: gifts sent together wait their turn instead of overlapping. */
  const enqueueAnnouncement = useCallback(
    (item: GiftAnnouncement) => {
      if (!item || item.roomId !== id) return;
      if (announcementRef.current?.id === item.id) return;
      if (announcementQueue.current.some((queued) => queued.id === item.id)) return;
      if (announcementRef.current) {
        announcementQueue.current.push(item);
        return;
      }
      setActiveAnnouncement(item);
    },
    [id, setActiveAnnouncement]
  );

  // The reveal closes itself (a clip when it ends, other gifts after their time).
  const finishAnnouncement = useCallback(() => {
    setActiveAnnouncement(announcementQueue.current.shift() ?? null);
  }, [setActiveAnnouncement]);

  // Seats, roles, background and music change: refresh the stage.
  useEffect(() => {
    const off = on('room', (data) => {
      if (data.roomId === id) void load();
    });
    return off;
  }, [on, id, load]);

  // Live room chat, gifts and deletions.
  useEffect(() => {
    const offMessage = on('room_message', (data) => {
      if (data.roomId !== id) return;
      const message = data.message as RoomMessageData | null;
      if (!message) return;
      append(message);
    });
    const offDelete = on('room_message_deleted', (data) => {
      if (data.roomId !== id) return;
      setMessages((current) => current.filter((item) => item.id !== data.messageId));
    });
    return () => {
      offMessage();
      offDelete();
    };
  }, [on, id, append]);

  // Gift announcements, pushed to every member of the room at the same moment.
  useEffect(() => {
    const off = on('room_gift_announcement', (data) => {
      if (data.roomId !== id) return;
      const item = data.announcement as GiftAnnouncement | null;
      if (item) enqueueAnnouncement(item);
    });
    return off;
  }, [on, id, enqueueAnnouncement]);

  // Frames gifted in the room reach every member at the same moment.
  useEffect(() => {
    const off = on('room_frame', (data) => {
      if (data.roomId !== id) return;
      const frame = data.frame as WornFrame | null;
      if (frame) applyFrame(frame);
    });
    return off;
  }, [on, id, applyFrame]);

  // Live occupancy and moderation events.
  useEffect(() => {
    const offPresence = on('room:presence', (data) => {
      if (data.roomId !== id) return;
      setPresence((data.users as PresenceUser[]) ?? []);
    });
    const offMute = on('room:force_mute', (data) => {
      if (data.roomId !== id) return;
      if (data.muted) {
        setForcedMute((value) => value + 1);
        toast.push('تم كتم المايك من قبل إدارة الغرفة', 'info');
      }
    });
    const offKick = on('room:kicked', (data) => {
      if (data.roomId !== id) return;
      toast.push('تم إنزالك من المايك', 'info');
      void load();
    });
    return () => {
      offPresence();
      offMute();
      offKick();
    };
  }, [on, id, load, toast]);

  // The member list is fetched when the panel opens and whenever membership changes.
  useEffect(() => {
    if (panel === 'members') void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, id]);

  useEffect(() => {
    const off = on('room_members', (data) => {
      if (data.roomId !== id) return;
      void loadMembers();
    });
    const offRemoved = on('room:removed', (data) => {
      if (data.roomId !== id) return;
      toast.push('تمت إزالتك من الغرفة', 'info');
      send('room:leave', { roomId: id });
      navigate('/rooms');
    });
    return () => {
      off();
      offRemoved();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, id, send, navigate, toast]);

  // Announce presence while the room is open.
  useEffect(() => {
    if (!connected || !id) return;
    send('room:join', { roomId: id });
    return () => send('room:leave', { roomId: id });
  }, [connected, id, send]);

  // Keep the local track in sync with the seat's persisted mute state.
  useEffect(() => {
    voice.setMuted(myMic ? myMic.muted : false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myMic?.id, myMic?.muted]);

  useEffect(() => {
    if (voice.micError === 'mic_permission') {
      toast.push('اسمح بالوصول إلى المايك من إعدادات الهاتف', 'error');
    }
  }, [voice.micError, toast]);

  useEffect(() => {
    const audio = musicRef.current;
    if (!audio) return;
    audio.volume = 0.7;
    audio.muted = musicMuted;
    void audio.play().catch(() => undefined);
  }, [room?.musicUrl, musicMuted]);

  // A different room starts with a clean announcement queue.
  useEffect(() => {
    announcementQueue.current = [];
    setActiveAnnouncement(null);
  }, [id, setActiveAnnouncement]);

  const act = async (mic: RoomMic) => {
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

  const toggleMute = async (mic: RoomMic) => {
    try {
      const response = await api<{ room: RoomData }>(`/rooms/${id}/mics/${mic.id}/mute`, {
        method: 'POST',
        body: { muted: !mic.muted },
      });
      setRoom(response.room);
      if (mic.mine) voice.setMuted(!mic.muted);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const lockMic = async (mic: RoomMic) => {
    try {
      const response = await api<{ room: RoomData }>(`/rooms/${id}/mics/${mic.id}/lock`, {
        method: 'POST',
        body: { locked: !mic.isLocked },
      });
      setRoom(response.room);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const kickMic = async (mic: RoomMic) => {
    try {
      const response = await api<{ room: RoomData }>(`/rooms/${id}/mics/${mic.id}/kick`, { method: 'POST' });
      setRoom(response.room);
      toast.push('تم إنزال المستخدم من المايك', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const isAdminUser = Boolean(me?.rank && ADMIN_BADGE_BY_RANK[me.rank.key]);

  const sendMessage = async (body: string, announcement = false): Promise<boolean> => {
    if (sending) return false;
    setSending(true);
    try {
      const response = await api<{ message: RoomMessageData }>(`/rooms/${id}/messages`, {
        method: 'POST',
        body: { body, announcement },
      });
      append(response.message);
      return true;
    } catch (error) {
      toast.push((error as Error).message, 'error');
      return false;
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      await api(`/rooms/${id}/messages/${messageId}/delete`, { method: 'POST' });
      setMessages((current) => current.filter((item) => item.id !== messageId));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const saveSettings = async (patch: RoomSettingsPatch) => {
    const response = await api<{ room: RoomData }>(`/rooms/${id}/settings`, {
      method: 'POST',
      body: patch,
    });
    setRoom(response.room);
    toast.push('تم تحديث إعدادات الغرفة', 'success');
  };

  const saveMusic = async (musicUrl: string) => {
    const response = await api<{ room: RoomData }>(`/rooms/${id}/settings`, {
      method: 'POST',
      body: { musicUrl },
    });
    setRoom(response.room);
    setMusicMuted(false);
    toast.push(musicUrl ? 'تم تشغيل الموسيقى للجميع' : 'تم إيقاف الموسيقى', 'success');
  };

  const setRole = async (userId: string, role: 'admin' | 'supervisor' | null) => {
    try {
      const response = await api<{ room: RoomData }>(`/rooms/${id}/roles`, {
        method: 'POST',
        body: { userId, role },
      });
      setRoom(response.room);
      void loadMembers();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  type MembershipSnapshot = {
    members: RoomMemberEntry[];
    capacity: RoomCapacity;
    liked: boolean;
    likes: number;
    member: boolean;
  };

  const applyMembership = (snapshot: MembershipSnapshot) => {
    setMembers(snapshot.members);
    setRoom((current) =>
      current
        ? {
            ...current,
            capacity: snapshot.capacity,
            liked: snapshot.liked,
            likes: snapshot.likes,
            member: snapshot.member,
          }
        : current
    );
  };

  const loadMembers = async () => {
    try {
      applyMembership(await api<MembershipSnapshot>(`/rooms/${id}/members`));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const joinMembership = async () => {
    if (memberBusy) return;
    setMemberBusy(true);
    try {
      applyMembership(await api<MembershipSnapshot>(`/rooms/${id}/members/join`, { method: 'POST' }));
      toast.push('أصبحت عضواً في الغرفة', 'success');
    } catch (error) {
      const code = (error as { code?: string }).code;
      toast.push(
        code === 'room_full'
          ? 'الغرفة ممتلئة — رقّي الغرفة أو أزل بعض الأعضاء'
          : (error as Error).message,
        'error'
      );
    } finally {
      setMemberBusy(false);
    }
  };

  const leaveMembership = async () => {
    if (memberBusy) return;
    setMemberBusy(true);
    try {
      applyMembership(await api<MembershipSnapshot>(`/rooms/${id}/members/leave`, { method: 'POST' }));
      toast.push('خرجت من قائمة أعضاء الغرفة', 'info');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setMemberBusy(false);
    }
  };

  const toggleLike = async () => {
    try {
      const state = await api<{ liked: boolean; likes: number }>(`/rooms/${id}/like`, { method: 'POST' });
      setRoom((current) => (current ? { ...current, ...state } : current));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const removeMember = async (userId: string) => {
    try {
      applyMembership(await api<MembershipSnapshot>(`/rooms/${id}/members/${userId}/remove`, { method: 'POST' }));
      toast.push('تمت إزالة العضو من الغرفة', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const openStore = async () => {
    setStoreOpen(true);
    setStoreLoading(true);
    try {
      setStoreData(await api<RoomStoreData>(`/rooms/${id}/store`));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setStoreLoading(false);
    }
  };

  const buyUpgrade = async (tierId: string) => {
    if (busyTier) return;
    setBusyTier(tierId);
    try {
      const response = await api<RoomStoreData & { purchased?: { id: string; name: string } }>(
        `/rooms/${id}/store/${tierId}/purchase`,
        { method: 'POST' }
      );
      setStoreData(response);
      setRoom((current) => (current ? { ...current, capacity: response.capacity } : current));
      toast.push(
        `تم تفعيل ${response.purchased?.name ?? 'الترقية'} — سعة الغرفة الآن ${response.capacity.limit} عضو`,
        'success'
      );
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusyTier(null);
    }
  };

  const leaveRoom = () => {
    send('room:leave', { roomId: id });
    navigate('/rooms');
  };

  const micButton = () => {
    if (myMic) {
      void toggleMute(myMic);
      return;
    }
    const free = room?.mics.find((mic) => !mic.user && !mic.isLocked);
    if (free) void act(free);
    else toast.push(t('micBusy'), 'error');
  };

  // Frame recipients: everyone sitting on a mic, since they are the ones with
  // an avatar on the stage.
  const frameMembers = useMemo(
    () =>
      room?.mics
        .filter((mic) => mic.user)
        .map((mic) => ({
          id: mic.user!.id,
          displayName: mic.user!.displayName,
          avatarUrl: mic.user!.avatarUrl,
        })) ?? [],
    [room]
  );

  const occupied = presence.length || room?.mics.filter((mic) => mic.user).length || 0;
  const speakers =
    room?.mics
      .filter((mic) => mic.user && mic.user.id !== me?.user.id)
      .map((mic) => ({
        id: mic.user!.id,
        displayName: mic.user!.displayName,
        avatarUrl: mic.user!.avatarUrl,
      })) ?? [];

  return (
    <div className="room-screen">
      <RoomBackdrop background={room?.background ?? 'fire'} />

      {showEntry && entryCosmetic ? (
        <EntryBanner
          cosmetic={entryCosmetic}
          name={me?.user.displayName ?? ''}
          label={me?.adminLook?.label ?? me?.rank?.nameAr}
          effects={me?.adminLook?.effectsEnabled ?? true}
        />
      ) : showEntry && me?.vip ? (
        <VipEntryBanner vip={me.vip} name={me.user.displayName} />
      ) : null}

      {loading ? (
        <div className="room-loading">
          <Spinner label={t('loading')} />
        </div>
      ) : room ? (
        <div className="room-stage">
          <RoomHeader
            name={room.name}
            code={room.code}
            owner={room.owner}
            occupied={occupied}
            total={room.mics.length}
            members={room.capacity.count}
            capacity={room.capacity.limit}
            country={room.country}
            language={room.language}
            canManage={room.canManage}
            onBack={leaveRoom}
            onSettings={() => setPanel('settings')}
            onMembers={() => setPanel('members')}
            onStore={() => void openStore()}
          />

          {announcement ? (
            <RoomGiftAnnouncement
              key={announcement.id}
              item={announcement}
              onDone={finishAnnouncement}
            />
          ) : null}

          <RoomCup roomId={id} />

          {room.rules ? <p className="room-rules-line">{room.rules}</p> : null}

          <section
            className="room-seats"
            data-mic-style={room.micStyle}
            style={{ '--mic-accent': room.micColor } as CSSProperties}
            aria-label="مقاعد المايكات"
          >
            {room.mics.map((mic) => (
              <MicSeat
                key={mic.id}
                mic={mic}
                level={voice.levels[mic.user?.id ?? ''] ?? 0}
                busy={busyMic === mic.id}
                canModerate={room.canModerate}
                onTake={() => void act(mic)}
                onLeave={() => void act(mic)}
                onMute={() => void toggleMute(mic)}
                onKick={() => void kickMic(mic)}
                onLock={() => void lockMic(mic)}
                onOpenProfile={() => mic.user && setProfileUserId(mic.user.id)}
                giftFrame={mic.user ? frames[mic.user.id] ?? null : null}
              />
            ))}
          </section>
        </div>
      ) : (
        <div className="room-loading">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/rooms')}>
            <Icon name="arrowLeft" size={15} /> {t('roomsTitle')}
          </button>
        </div>
      )}

      {room && !loading ? (
        <RoomBottomBar
          onLeave={leaveRoom}
          onInvite={() => setPanel('invite')}
          onMembers={() => setPanel('members')}
          onMusic={() => setPanel('music')}
          onChat={() => setPanel('chat')}
          onGifts={() => setGiftOpen(true)}
          onFrames={() => setFramesOpen(true)}
          onMic={micButton}
          micOn={Boolean(myMic)}
          micMuted={Boolean(myMic?.muted)}
          chatOpen={panel === 'chat'}
        />
      ) : null}

      {myMic && voiceModerationSupported() ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          title="بموافقتك يُحوَّل كلامك إلى نص لفحص المخالفات فقط"
          style={{ position: 'fixed', insetInlineStart: 12, bottom: 92, zIndex: 40, fontSize: 11 }}
          onClick={() => setSafetyMonitor((value) => !value)}
        >
          <Icon name="shield" size={14} /> {safetyMonitor ? 'إيقاف مراقبة السلامة' : 'مراقبة السلامة الصوتية'}
        </button>
      ) : null}

      {/* Remote voice streams (peer-to-peer, audio only). */}
      <div className="room-audio-sinks" aria-hidden="true">
        {Object.entries(voice.streams).map(([userId, stream]) => (
          <audio
            key={userId}
            autoPlay
            playsInline
            ref={(element) => {
              if (element && element.srcObject !== stream) element.srcObject = stream;
            }}
          />
        ))}
        {room?.musicUrl ? (
          <audio ref={musicRef} src={assetUrl(room.musicUrl)} loop playsInline muted={musicMuted} />
        ) : null}
      </div>

      {room ? (
        <>
          <RoomChatPanel
            open={panel === 'chat'}
            onClose={() => setPanel(null)}
            messages={messages}
            meId={me?.user.id ?? null}
            canModerate={room.canModerate}
            sending={sending}
            canAnnounce={isAdminUser}
            onSend={sendMessage}
            onDelete={(messageId) => void deleteMessage(messageId)}
          />
          <RoomMembersPanel
            open={panel === 'members'}
            onClose={() => setPanel(null)}
            members={members}
            visitors={presence.filter((user) => !members.some((member) => member.id === user.id))}
            capacity={room.capacity}
            liked={room.liked}
            likes={room.likes}
            isMember={room.member}
            meId={me?.user.id ?? null}
            canManage={room.canManage}
            busy={memberBusy}
            onJoin={() => void joinMembership()}
            onLeave={() => void leaveMembership()}
            onToggleLike={() => void toggleLike()}
            onSetRole={(userId, role) => void setRole(userId, role)}
            onRemove={(userId) => void removeMember(userId)}
            onOpenStore={() => {
              setPanel(null);
              void openStore();
            }}
          />
          <RoomStoreSheet
            open={storeOpen}
            onClose={() => setStoreOpen(false)}
            data={storeData}
            loading={storeLoading}
            busyTier={busyTier}
            onPurchase={(tierId) => void buyUpgrade(tierId)}
          />
          <RoomInvitePanel open={panel === 'invite'} onClose={() => setPanel(null)} roomId={id} />
          <RoomSettingsPanel
            open={panel === 'settings'}
            onClose={() => setPanel(null)}
            room={room}
            onSave={saveSettings}
          />
          <RoomMusicPanel
            open={panel === 'music'}
            onClose={() => setPanel(null)}
            room={room}
            canManage={room.canManage}
            onSave={saveMusic}
            localMuted={musicMuted}
            onToggleLocal={() => setMusicMuted((value) => !value)}
          />
          <RoomGiftSheet
            open={giftOpen}
            onClose={() => {
              setGiftOpen(false);
              setGiftTarget(null);
            }}
            roomId={id}
            speakers={speakers}
            initialRecipientId={giftTarget}
            onSent={(message) => append(message)}
          />
          <RoomFramesSheet
            open={framesOpen}
            onClose={() => setFramesOpen(false)}
            roomId={id}
            members={frameMembers}
            meId={me?.user.id ?? null}
            onSent={applyFrame}
          />
        </>
      ) : null}

      {profileUserId ? (
        <UserProfileCard
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
          onSendGift={(userId) => {
            setProfileUserId(null);
            setGiftTarget(userId);
            setGiftOpen(true);
          }}
          onOpenFull={(userId) => {
            setProfileUserId(null);
            setFullProfileId(userId);
          }}
        />
      ) : null}

      {fullProfileId ? (
        <UserProfileScreen userId={fullProfileId} onClose={() => setFullProfileId(null)} />
      ) : null}
    </div>
  );
}
