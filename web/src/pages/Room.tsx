import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, assetUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useRealtime } from '../lib/realtime';
import { Icon, Spinner, useToast } from '../lib/ui';
import {
  RoomGiftSheet,
  type RoomGiftInfo,
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
import type { RoomData } from '../components/room/types';
import { useRoomVoice } from '../lib/roomVoice';
import { playGiftSound } from '../lib/giftSound';
import { RoomGiftFlash } from '../components/room/RoomGiftFlash';

type Panel = 'chat' | 'members' | 'invite' | 'settings' | 'music' | null;

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
  const [playing, setPlaying] = useState<{ gift: RoomGiftInfo; name: string } | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [forcedMute, setForcedMute] = useState(0);
  const [musicMuted, setMusicMuted] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const entryShown = useRef(false);
  const [showEntry, setShowEntry] = useState(false);

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

  // Play the equipped room-entry animation once per visit.
  useEffect(() => {
    if (!room || entryShown.current) return;
    if (!entryCosmetic && !me?.vip) return;
    entryShown.current = true;
    setShowEntry(true);
    const timer = setTimeout(() => setShowEntry(false), 3400);
    return () => clearTimeout(timer);
  }, [room, entryCosmetic, me?.vip]);

  const append = useCallback((message: RoomMessageData) => {
    setMessages((current) =>
      current.some((item) => item.id === message.id) ? current : [...current, message].slice(-80)
    );
  }, []);

  const flash = useCallback((message: RoomMessageData) => {
    if (!message.gift) return;
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setPlaying({ gift: message.gift, name: message.displayName });
    playGiftSound(message.gift);
    flashTimer.current = setTimeout(() => setPlaying(null), 6000);
  }, []);

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
      if (message.userId !== me?.user.id) flash(message);
    });
    const offDelete = on('room_message_deleted', (data) => {
      if (data.roomId !== id) return;
      setMessages((current) => current.filter((item) => item.id !== data.messageId));
    });
    return () => {
      offMessage();
      offDelete();
    };
  }, [on, id, append, flash, me?.user.id]);

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

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

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
    } catch (error) {
      toast.push((error as Error).message, 'error');
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
            country={room.country}
            language={room.language}
            canManage={room.canManage}
            onBack={leaveRoom}
            onSettings={() => setPanel('settings')}
          />

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
          onMic={micButton}
          micOn={Boolean(myMic)}
          micMuted={Boolean(myMic?.muted)}
          chatOpen={panel === 'chat'}
        />
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

      {playing ? <RoomGiftFlash gift={playing.gift} sender={playing.name} /> : null}

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
            users={presence}
            roles={room.roles}
            meId={me?.user.id ?? null}
            canManage={room.canManage}
            onSetRole={(userId, role) => void setRole(userId, role)}
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
  );
}
