import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, assetUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useRealtime } from '../lib/realtime';
import { Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { giftBarsHidden, useGiftBarsHidden } from '../lib/giftBars';
import {
  RoomGiftSheet,
  type RepeatGiftInfo,
  type RoomMessageData,
} from '../components/RoomGiftSheet';
import { GiftRepeatBar } from '../components/GiftRepeatBar';
import { LuckyGiftOverlay, type LuckyGiftSpin } from '../components/room/LuckyGiftOverlay';
import { DailyGiftFab } from '../components/room/DailyGiftFab';
import { EntryBanner } from '../components/Cosmetics';
import { VipEntryBanner } from '../components/ProgressionBadges';
import { ADMIN_BADGE_BY_RANK, isAdminDesign } from '../components/AdminRoyal';
import { RoomBackdrop } from '../components/room/RoomBackdrop';
import { RoomHeader } from '../components/room/RoomHeader';
import { RoomBottomBar } from '../components/room/RoomBottomBar';
import { MicSeat, type RoomMic } from '../components/room/MicSeat';
import { RoomMembersPanel, type PresenceUser } from '../components/room/RoomMembersPanel';
import { RoomInvitePanel } from '../components/room/RoomInvitePanel';
import { RoomSettingsPanel, type RoomSettingsPatch } from '../components/room/RoomSettingsPanel';
import { RoomIdentitySheet, type RoomIdentityPatch } from '../components/room/RoomIdentitySheet';
import { RoomMusicPanel } from '../components/room/RoomMusicPanel';
import { RoomChatPanel } from '../components/room/RoomChatPanel';
import { RoomCup } from '../components/room/RoomCup';
import { RoomFramesSheet, type WornFrame } from '../components/room/RoomFramesSheet';
import { RoomStoreSheet } from '../components/room/RoomStoreSheet';
import { MicSlotsSheet } from '../components/room/MicSlotsSheet';
import { RoomSeatsUnlock } from '../components/room/RoomSeatsUnlock';
import type {
  RoomCapacity,
  RoomData,
  RoomMemberEntry,
  RoomStaff,
  RoomStoreData,
} from '../components/room/types';
import { useRoomVoice } from '../lib/roomVoice';
import { useVoiceModeration, voiceModerationSupported } from '../lib/voiceModeration';
import {
  RoomGiftAnnouncement,
  type GiftAnnouncement,
} from '../components/room/RoomGiftAnnouncement';
import { RoomGiftMarquee } from '../components/room/RoomGiftMarquee';
import { UserProfileCard } from '../components/profile/UserProfileCard';
import { UserProfileScreen } from '../components/profile/UserProfileScreen';

type Panel = 'chat' | 'members' | 'invite' | 'settings' | 'music' | 'identity' | null;

/** A worn frame plus the local moment it disappears (server time converted once). */
type LiveFrame = WornFrame & { endsAt: number };

export default function Room() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const { me } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { on, send, connected } = useRealtime();
  // «المزيد» → إعلانات الهدايا: this member's own switch for the gift strips.
  const giftBarsOff = useGiftBarsHidden();

  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyMic, setBusyMic] = useState<string | null>(null);
  const [micPrompt, setMicPrompt] = useState<{
    kind: 'take' | 'leave' | 'switch' | 'unlock';
    mic: RoomMic;
    from?: number;
  } | null>(null);
  const [joinPrompt, setJoinPrompt] = useState<RoomMic | null>(null);
  const [messages, setMessages] = useState<RoomMessageData[]>([]);
  const [sending, setSending] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [giftTab, setGiftTab] = useState<'gifts' | 'daily'>('gifts');
  const [giftTarget, setGiftTarget] = useState<string | null>(null);
  const [framesOpen, setFramesOpen] = useState(false);
  const [frames, setFrames] = useState<Record<string, LiveFrame>>({});
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [fullProfileId, setFullProfileId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<GiftAnnouncement | null>(null);
  const [repeatGift, setRepeatGift] = useState<RepeatGiftInfo | null>(null);
  const [luckySpin, setLuckySpin] = useState<LuckyGiftSpin | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [members, setMembers] = useState<RoomMemberEntry[]>([]);
  const [memberBusy, setMemberBusy] = useState(false);
  const [micsOpen, setMicsOpen] = useState(false);
  const [seatsUnlock, setSeatsUnlock] = useState<{ slots: number; level: number } | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const [storeData, setStoreData] = useState<RoomStoreData | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [forcedMute, setForcedMute] = useState(0);
  const [musicMuted, setMusicMuted] = useState(false);
  /** Pressing the top back arrow asks first: leave the room or stay in it. */
  const [leaveAsk, setLeaveAsk] = useState(false);
  const announcementRef = useRef<GiftAnnouncement | null>(null);
  const announcementQueue = useRef<GiftAnnouncement[]>([]);
  const luckyQueue = useRef<LuckyGiftSpin[]>([]);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const entryShown = useRef(false);
  const [showEntry, setShowEntry] = useState(false);
  const [safetyMonitor, setSafetyMonitor] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const entryCosmetic = me?.cosmetics?.entry ?? null;
  const myMic = room?.mics.find((mic) => mic.mine) ?? null;
  /** Seat of the profile currently open, so every mic member can be sent a frame. */
  const profileMic = profileUserId
    ? (room?.mics.find((mic) => mic.user?.id === profileUserId) ?? null)
    : null;
  /** Staff powers on someone else's seat live in that member's profile card. */
  const seatStaffActions =
    Boolean(profileMic?.user) && profileUserId !== me?.user.id && Boolean(room?.canModerate);
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

  // Play the equipped room-entry animation once per visit. The official admin
  // emblem is not shown inside rooms.
  useEffect(() => {
    if (!room || entryShown.current) return;
    if (isAdminDesign(entryCosmetic?.design)) {
      entryShown.current = true;
      return;
    }
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

  /** One lucky bubble at a time; spins that arrive together wait their turn. */
  const showLucky = useCallback((spin: LuckyGiftSpin) => {
    setLuckySpin((current) => {
      if (!current) return spin;
      if (luckyQueue.current.some((queued) => queued.id === spin.id)) return current;
      luckyQueue.current.push(spin);
      return current;
    });
  }, []);

  const finishLucky = useCallback(() => {
    setLuckySpin(luckyQueue.current.shift() ?? null);
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
    });
    const offDelete = on('room_message_deleted', (data) => {
      if (data.roomId !== id) return;
      setMessages((current) => current.filter((item) => item.id !== data.messageId));
    });
    const offClear = on('room_messages_cleared', (data) => {
      if (data.roomId !== id) return;
      setMessages([]);
    });
    return () => {
      offMessage();
      offDelete();
      offClear();
    };
  }, [on, id, append]);

  // Gift announcements, pushed to every member of the room at the same moment.
  useEffect(() => {
    const off = on('room_gift_announcement', (data) => {
      if (data.roomId !== id) return;
      const item = data.announcement as GiftAnnouncement | null;
      if (item && !giftBarsHidden()) enqueueAnnouncement(item);
    });
    return off;
  }, [on, id, enqueueAnnouncement]);

  // «هدايا الحظ»: the bubble reveal reaches every member at the same moment.
  useEffect(() => {
    const off = on('room_lucky_gift', (data) => {
      if (data.roomId !== id) return;
      const spin = data.spin as LuckyGiftSpin | null;
      if (spin) showLucky(spin);
    });
    return off;
  }, [on, id, showLucky]);

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
    const offBanned = on('room:banned', (data) => {
      if (data.roomId !== id) return;
      toast.push(
        Number(data.hours) > 2 ? 'تم حظرك من الغرفة لمدة سنة' : 'تم حظرك من الغرفة لمدة ساعتين',
        'error'
      );
      send('room:leave', { roomId: id });
      navigate('/rooms');
    });
    return () => {
      offPresence();
      offMute();
      offKick();
      offBanned();
    };
  }, [on, id, load, toast]);

  // The member list is fetched when the panel opens and whenever membership changes.
  useEffect(() => {
    if (panel === 'members' || panel === 'settings' || panel === 'identity') void loadMembers();
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
    // «هدية المليون»: the crowd that walked into this room.
    const offBigGift = on('room_big_gift', (data) => {
      if (data.roomId !== id) return;
      const entrants = (data as unknown as { entrants?: unknown[] }).entrants;
      if (entrants?.length) toast.push(`دخل ${entrants.length} أعضاء الغرفة 🎉`, 'success');
    });
    return () => {
      off();
      offRemoved();
      offBigGift();
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
    luckyQueue.current = [];
    setLuckySpin(null);
    setRepeatGift(null);
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

  // A level-up opens more seats: celebrate it once, when `micSlots` grows.
  const knownSlots = useRef<number | null>(null);
  useEffect(() => {
    if (!room) return;
    const previous = knownSlots.current;
    knownSlots.current = room.micSlots;
    if (previous !== null && room.micSlots > previous) {
      setSeatsUnlock({ slots: room.micSlots, level: room.level });
    }
  }, [room]);

  /** Tapping a free seat asks first: «اصعد الآن» or «إلغاء». */
  const requestMic = (mic: RoomMic) => {
    if (mic.user && !mic.mine) {
      toast.push(t('micBusy'), 'error');
      return;
    }
    if (mic.isLocked) {
      // Staff unlock it right from the seat; everyone else is told it is closed.
      if (room?.canManage) setMicPrompt({ kind: 'unlock', mic });
      else toast.push('هذا المايك مقفل — لا يمكنك الجلوس عليه', 'error');
      return;
    }
    // Non-members join the room first; the sheet offers «انضم الآن» once.
    if (!room?.member && !room?.canManage) {
      setJoinPrompt(mic);
      return;
    }
    // Already seated: moving to another seat is a switch, confirmed first.
    if (myMic && myMic.id !== mic.id) {
      setMicPrompt({ kind: 'switch', mic, from: myMic.position });
      return;
    }
    setMicPrompt({ kind: 'take', mic });
  };

  /** Tapping your own avatar on a seat asks before stepping down: «نزول» or «إلغاء». */
  const requestLeaveMic = (mic: RoomMic) => {
    setMicPrompt({ kind: 'leave', mic });
  };

  const confirmMicPrompt = async () => {
    const prompt = micPrompt;
    setMicPrompt(null);
    if (!prompt) return;
    if (prompt.kind === 'unlock') await lockMic(prompt.mic);
    else await act(prompt.mic);
  };

  /** From the seat sheet: staff close the seat instead of sitting on it. */
  const lockFromPrompt = async () => {
    const prompt = micPrompt;
    setMicPrompt(null);
    if (prompt) await lockMic(prompt.mic);
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

  /** Staff ban: 2 hours for supervisors, up to a year for the owner / vice-owner. */
  const banUser = async (userId: string, hours: number) => {
    try {
      const response = await api<{ room: RoomData }>(`/rooms/${id}/bans`, {
        method: 'POST',
        body: { userId, hours },
      });
      setRoom(response.room);
      void loadMembers();
      toast.push(hours > 2 ? 'تم حظر المستخدم سنة' : 'تم حظر المستخدم ساعتين', 'success');
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

  /** Owner or vice-owner wipes the whole room chat. */
  const clearMessages = async () => {
    try {
      await api(`/rooms/${id}/messages/clear`, { method: 'POST' });
      setMessages([]);
      toast.push('تم مسح رسائل الغرفة', 'success');
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

  const saveIdentity = async (patch: RoomIdentityPatch) => {
    const response = await api<{ room: RoomData }>(`/rooms/${id}/settings`, {
      method: 'POST',
      body: patch,
    });
    setRoom(response.room);
    toast.push('تم تحديث هوية الغرفة', 'success');
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
    const response = await api<{ room: RoomData }>(`/rooms/${id}/roles`, {
      method: 'POST',
      body: { userId, role },
    });
    setRoom(response.room);
    void loadMembers();
  };

  type MembershipSnapshot = {
    members: RoomMemberEntry[];
    capacity: RoomCapacity;
    staff: RoomStaff;
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
            staff: snapshot.staff,
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

  const joinMembership = async (): Promise<boolean> => {
    if (memberBusy) return false;
    setMemberBusy(true);
    try {
      applyMembership(await api<MembershipSnapshot>(`/rooms/${id}/members/join`, { method: 'POST' }));
      toast.push('أصبحت عضواً في الغرفة', 'success');
      return true;
    } catch (error) {
      const code = (error as { code?: string }).code;
      toast.push(
        code === 'room_full'
          ? 'الغرفة ممتلئة — رقّي الغرفة أو أزل بعض الأعضاء'
          : (error as Error).message,
        'error'
      );
      return false;
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

  /** «حفظ الغرفة»: pins the room so it keeps floating with the account. */
  const toggleSave = async () => {
    if (saveBusy) return;
    setSaveBusy(true);
    try {
      const state = await api<{ saved: boolean }>(`/rooms/${id}/save`, { method: 'POST' });
      setRoom((current) => (current ? { ...current, saved: state.saved } : current));
      window.dispatchEvent(new Event('rooms:saved'));
      toast.push(state.saved ? 'تم حفظ الغرفة — تبقى معك' : 'تم إزالة الغرفة المحفوظة', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSaveBusy(false);
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
    if (free) requestMic(free);
    else toast.push('لا يوجد مايك متاح الآن', 'error');
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

  // Seats taken on stage — the same number the seat grid shows.
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
            avatar={room.avatarUrl}
            level={room.level}
            levelXp={room.levelXp}
            levelXpFloor={room.levelXpFloor}
            levelXpNext={room.levelXpNext}
            micSlots={room.micSlots}
            owner={room.owner}
            occupied={occupied}
            total={room.mics.length}
            members={room.capacity.count}
            capacity={room.capacity.limit}
            country={room.country}
            language={room.language}
            canManage={room.canManage}
            onBack={() => setLeaveAsk(true)}
            onSettings={() => setPanel('settings')}
            onIdentity={() => setPanel('identity')}
            onMembers={() => setPanel('members')}
            onStore={() => void openStore()}
            saveButton={
              <button
                type="button"
                className={`room-back room-head-save${room.saved ? ' on' : ''}`}
                onClick={() => void toggleSave()}
                aria-pressed={room.saved}
                aria-label={room.saved ? 'الغرفة محفوظة' : 'حفظ الغرفة'}
                title={room.saved ? 'الغرفة محفوظة' : 'حفظ الغرفة'}
              >
                {room.avatarUrl ?? room.coverUrl ? (
                  <img
                    className="room-head-save-img"
                    src={assetUrl((room.avatarUrl ?? room.coverUrl) as string)}
                    alt=""
                  />
                ) : (
                  <Icon name="heart" size={13} fill="currentColor" />
                )}
                {room.saved ? (
                  <span className="room-head-save-check" aria-hidden="true">
                    ✓
                  </span>
                ) : null}
              </button>
            }
          />

          {announcement && !giftBarsOff ? (
            <RoomGiftAnnouncement
              key={announcement.id}
              item={announcement}
              onDone={finishAnnouncement}
            />
          ) : null}

          {luckySpin ? (
            <LuckyGiftOverlay key={luckySpin.id} spin={luckySpin} onDone={finishLucky} />
          ) : null}

          {seatsUnlock ? (
            <RoomSeatsUnlock
              slots={seatsUnlock.slots}
              level={seatsUnlock.level}
              onDone={() => setSeatsUnlock(null)}
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
                onTake={() => requestMic(mic)}
                onOpenProfile={() => mic.user && setProfileUserId(mic.user.id)}
                giftFrame={mic.user ? frames[mic.user.id] ?? null : null}
              />
            ))}
          </section>

          <RoomGiftMarquee initial={room.lastGift ?? null} />
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
          onChat={() => setPanel('chat')}
          onGifts={() => {
            setGiftTab('gifts');
            setGiftOpen(true);
          }}
          onUpgrade={() => void openStore()}
          onMics={() => setMicsOpen(true)}
          onMusic={() => setPanel('music')}
          onMic={micButton}
          micOn={Boolean(myMic)}
          micMuted={Boolean(myMic?.muted)}
          chatOpen={panel === 'chat'}
          musicPlaying={Boolean(room.musicUrl) && !musicMuted}
        />
      ) : null}

      {myMic && voiceModerationSupported() ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          title="بموافقتك يُحوَّل كلامك إلى نص لفحص المخالفات فقط"
          style={{ position: 'fixed', insetInlineEnd: 12, bottom: 92, zIndex: 40, fontSize: 11 }}
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
            canClear={room.canManage}
            onSend={sendMessage}
            onDelete={(messageId) => void deleteMessage(messageId)}
            onClear={() => void clearMessages()}
          />
          <RoomMembersPanel
            open={panel === 'members'}
            onClose={() => setPanel(null)}
            members={members}
            visitors={presence.filter((user) => !members.some((member) => member.id === user.id))}
            capacity={room.capacity}
            staff={room.staff}
            liked={room.liked}
            likes={room.likes}
            isMember={room.member}
            meId={me?.user.id ?? null}
            canManage={room.canManage}
            busy={memberBusy}
            onJoin={() => void joinMembership()}
            onLeave={() => void leaveMembership()}
            onToggleLike={() => void toggleLike()}
            onSetRole={(userId, role) => {
              setRole(userId, role).catch((error: Error) => toast.push(error.message, 'error'));
            }}
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
          <MicSlotsSheet
            open={micsOpen}
            onClose={() => setMicsOpen(false)}
            room={room}
            onPick={(mic) => {
              setMicsOpen(false);
              requestMic(mic);
            }}
          />
          <RoomInvitePanel open={panel === 'invite'} onClose={() => setPanel(null)} roomId={id} />
          <RoomIdentitySheet
            open={panel === 'identity'}
            onClose={() => setPanel(null)}
            room={room}
            members={members}
            canManage={room.canManage}
            onSave={saveIdentity}
          />
          <RoomSettingsPanel
            open={panel === 'settings'}
            onClose={() => setPanel(null)}
            room={room}
            members={members}
            staff={room.staff}
            onSave={saveSettings}
            onSetRole={setRole}
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
            initialTab={giftTab}
            onSent={(message, repeat) => {
              append(message);
              if (repeat) setRepeatGift(repeat);
            }}
          />

          {/* «هدايا اليوم»: a small looping ad in the corner, it never covers a control. */}
          <DailyGiftFab
            onOpen={() => {
              setGiftTarget(null);
              setGiftTab('daily');
              setGiftOpen(true);
            }}
          />

          {repeatGift ? (
            <GiftRepeatBar
              key={`${repeatGift.gift.id}-${repeatGift.recipient.id}-${repeatGift.quantity}`}
              roomId={id}
              info={repeatGift}
              onSent={append}
              onClose={() => setRepeatGift(null)}
            />
          ) : null}
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

      {/* Not a member yet: «انضم الآن» joins the room, then the mic sheet opens. */}
      <Sheet
        open={Boolean(joinPrompt)}
        onClose={() => setJoinPrompt(null)}
        title="الانضمام إلى الغرفة"
        center
      >
        <p className="room-mic-confirm-text">
          {room?.name
            ? `يجب أن تكون عضواً في غرفة «${room.name}» للصعود على المايك.`
            : 'يجب أن تكون عضواً في الغرفة للصعود على المايك.'}
        </p>
        <div className="room-mic-confirm-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={memberBusy}
            onClick={() => {
              const mic = joinPrompt;
              setJoinPrompt(null);
              void (async () => {
                if (await joinMembership() && mic) setMicPrompt({ kind: 'take', mic });
              })();
            }}
          >
            انضم الآن
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setJoinPrompt(null)}>
            إلغاء
          </button>
        </div>
      </Sheet>

      {/* Pressing a seat: «اصعد الآن» (staff also get «اقفل المايك»), «مغادرة», «تبديل». */}
      <Sheet
        open={Boolean(micPrompt)}
        onClose={() => setMicPrompt(null)}
        title={
          micPrompt?.kind === 'leave'
            ? 'مغادرة المايك'
            : micPrompt?.kind === 'switch'
              ? 'تبديل المايك'
              : micPrompt?.kind === 'unlock'
                ? 'فتح المايك'
                : 'الصعود إلى المايك'
        }
        center
      >
        <p className="room-mic-confirm-text">
          {micPrompt?.kind === 'leave'
            ? 'هل تريد مغادرة المايك؟'
            : micPrompt?.kind === 'switch'
              ? `هل تريد الانتقال من المايك ${micPrompt.from ?? ''} إلى المايك ${micPrompt.mic.position}؟`
              : micPrompt?.kind === 'unlock'
                ? `المايك ${micPrompt.mic.position} مقفل — هل تريد فتحه؟`
                : `المايك ${micPrompt?.mic.position ?? ''} — هل تريد الصعود الآن؟`}
        </p>
        <div className="room-mic-confirm-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void confirmMicPrompt()}
            disabled={Boolean(busyMic)}
          >
            {micPrompt?.kind === 'leave'
              ? 'مغادرة'
              : micPrompt?.kind === 'switch'
                ? 'تبديل'
                : micPrompt?.kind === 'unlock'
                  ? 'افتح المايك'
                  : 'اصعد الآن'}
          </button>
          {micPrompt?.kind === 'take' && room?.canManage ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void lockFromPrompt()}
              disabled={Boolean(busyMic)}
            >
              اقفل المايك
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={() => setMicPrompt(null)}>
            إلغاء
          </button>
        </div>
      </Sheet>

      {/* The top back arrow asks before leaving the room. */}
      <Sheet open={leaveAsk} onClose={() => setLeaveAsk(false)} title="مغادرة الغرفة" center>
        <p className="room-mic-confirm-text">هل تريد مغادرة الغرفة أم البقاء فيها؟</p>
        <div className="room-mic-confirm-actions">
          <button type="button" className="btn btn-primary" onClick={leaveRoom}>
            مغادرة الغرفة
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setLeaveAsk(false)}>
            البقاء في الغرفة
          </button>
        </div>
      </Sheet>

      {profileUserId ? (
        <UserProfileCard
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
          onSendGift={(userId) => {
            setProfileUserId(null);
            setGiftTarget(userId);
            setGiftTab('gifts');
            setGiftOpen(true);
          }}
          onOpenFull={(userId) => {
            setProfileUserId(null);
            setFullProfileId(userId);
          }}
          seatActions={
            profileMic
              ? {
                  onLeaveMic:
                    myMic && profileUserId === me?.user.id
                      ? () => {
                          setProfileUserId(null);
                          requestLeaveMic(myMic);
                        }
                      : undefined,
                  onFrames: () => {
                    setProfileUserId(null);
                    setFramesOpen(true);
                  },
                  muted: profileMic.muted,
                  onMute: seatStaffActions
                    ? () => {
                        setProfileUserId(null);
                        void toggleMute(profileMic);
                      }
                    : undefined,
                  onKick: seatStaffActions
                    ? () => {
                        setProfileUserId(null);
                        void kickMic(profileMic);
                      }
                    : undefined,
                  onBan2h: seatStaffActions
                    ? () => {
                        setProfileUserId(null);
                        void banUser(profileMic.user!.id, 2);
                      }
                    : undefined,
                  onBanYear:
                    seatStaffActions && room?.canManage
                      ? () => {
                          setProfileUserId(null);
                          void banUser(profileMic.user!.id, 24 * 365);
                        }
                      : undefined,
                }
              : null
          }
        />
      ) : null}

      {fullProfileId ? (
        <UserProfileScreen userId={fullProfileId} onClose={() => setFullProfileId(null)} />
      ) : null}
    </div>
  );
}
