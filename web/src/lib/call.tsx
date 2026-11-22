import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { useRealtime } from './realtime';
import { useToast } from './ui';

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

export type CallKind = 'voice' | 'video';
export type CallPhase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

export interface CallPeer {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  online?: boolean;
}

export interface CallInfo {
  callId: string;
  kind: CallKind;
  peer: CallPeer;
  isFree: boolean;
  ratePerMinute: number;
}

export interface CallSummary {
  callId: string;
  status: string;
  durationSeconds: number;
  coinsCharged: number;
  coinsRefunded: number;
  isFree: boolean;
  ratePerMinute: number;
  endReason: string;
  balance: number | null;
  earnings: number;
}

interface CallValue {
  phase: CallPhase;
  call: CallInfo | null;
  incoming: CallInfo | null;
  elapsed: number;
  cost: number;
  balance: number;
  summary: CallSummary | null;
  muted: boolean;
  speaker: boolean;
  cameraOn: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  mediaError: string | null;
  startCall: (peer: CallPeer, kind: CallKind) => Promise<void>;
  accept: () => Promise<void>;
  reject: () => Promise<void>;
  cancel: () => Promise<void>;
  end: () => Promise<void>;
  dismiss: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  toggleCamera: () => void;
  switchCamera: () => Promise<void>;
}

const CallContext = createContext<CallValue | null>(null);

export function CallProvider({ children }: { children: ReactNode }) {
  const { refresh, me } = useAuth();
  const { send, on } = useRealtime();
  const toast = useToast();

  const [phase, setPhaseState] = useState<CallPhase>('idle');
  const [call, setCallState] = useState<CallInfo | null>(null);
  const [incoming, setIncomingState] = useState<CallInfo | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [cost, setCost] = useState(0);
  const [balance, setBalance] = useState(0);
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const phaseRef = useRef<CallPhase>('idle');
  const callRef = useRef<CallInfo | null>(null);
  const incomingRef = useRef<CallInfo | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const isCallerRef = useRef(false);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const facingRef = useRef<'user' | 'environment'>('user');

  const setPhase = useCallback((next: CallPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const setCall = useCallback((next: CallInfo | null) => {
    callRef.current = next;
    setCallState(next);
  }, []);
  const setIncoming = useCallback((next: CallInfo | null) => {
    incomingRef.current = next;
    setIncomingState(next);
  }, []);

  const stopMedia = useCallback(() => {
    try {
      pcRef.current?.getSenders().forEach((sender) => sender.track?.stop());
      pcRef.current?.close();
    } catch {
      /* already closed */
    }
    pcRef.current = null;
    localRef.current?.getTracks().forEach((track) => track.stop());
    localRef.current = null;
    pendingCandidates.current = [];
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const ensureLocalMedia = useCallback(async (kind: CallKind): Promise<MediaStream | null> => {
    if (localRef.current) return localRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError('This browser does not expose microphone or camera access');
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === 'video' ? { facingMode: facingRef.current } : false,
      });
      localRef.current = stream;
      setLocalStream(stream);
      setMediaError(null);
      return stream;
    } catch (error) {
      setMediaError((error as Error).message || 'Microphone / camera permission denied');
      return null;
    }
  }, []);

  const ensurePeer = useCallback((): RTCPeerConnection => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection(ICE_CONFIG);
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        send('webrtc:signal', {
          callId: callRef.current?.callId,
          payload: { type: 'candidate', candidate: event.candidate.toJSON() },
        });
      }
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      setRemoteStream(stream);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected' && phaseRef.current === 'connecting') {
        setPhase('active');
      }
    };
    if (localRef.current) {
      const stream = localRef.current;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }
    pcRef.current = pc;
    return pc;
  }, [send, setPhase]);

  const startAsCaller = useCallback(
    async (kind: CallKind) => {
      const stream = await ensureLocalMedia(kind);
      const pc = ensurePeer();
      if (!stream) {
        setPhase('active');
        return;
      }
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send('webrtc:signal', {
          callId: callRef.current?.callId,
          payload: { type: 'offer', sdp: pc.localDescription },
        });
      } catch (error) {
        console.error('[call] offer failed', error);
      }
    },
    [ensureLocalMedia, ensurePeer, send, setPhase]
  );

  const handleOffer = useCallback(
    async (payload: { sdp: RTCSessionDescriptionInit }) => {
      await ensureLocalMedia(callRef.current?.kind ?? 'voice');
      const pc = ensurePeer();
      try {
        await pc.setRemoteDescription(payload.sdp);
        for (const candidate of pendingCandidates.current) {
          try {
            await pc.addIceCandidate(candidate);
          } catch {
            /* stale candidate */
          }
        }
        pendingCandidates.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send('webrtc:signal', {
          callId: callRef.current?.callId,
          payload: { type: 'answer', sdp: pc.localDescription },
        });
        setPhase('active');
      } catch (error) {
        console.error('[call] answer failed', error);
      }
    },
    [ensureLocalMedia, ensurePeer, send, setPhase]
  );

  const handleSignal = useCallback(
    async (data: Record<string, unknown>) => {
      const callId = String(data.callId || '');
      if (callRef.current?.callId !== callId) return;
      const payload = data.payload as
        | { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
        | null;
      if (!payload) return;
      const pc = pcRef.current;

      if (payload.type === 'offer' && payload.sdp) {
        await handleOffer({ sdp: payload.sdp });
        return;
      }
      if (!pc) return;
      if (payload.type === 'answer' && payload.sdp) {
        try {
          await pc.setRemoteDescription(payload.sdp);
          setPhase('active');
        } catch (error) {
          console.error('[call] set answer failed', error);
        }
        return;
      }
      if (payload.type === 'candidate' && payload.candidate) {
        if (pc.remoteDescription) {
          try {
            await pc.addIceCandidate(payload.candidate);
          } catch {
            /* ignore */
          }
        } else {
          pendingCandidates.current.push(payload.candidate);
        }
      }
    },
    [handleOffer, setPhase]
  );

  const reset = useCallback(() => {
    stopMedia();
    setPhase('idle');
    setCall(null);
    setIncoming(null);
    setSummary(null);
    setElapsed(0);
    setCost(0);
    setMuted(false);
    setCameraOn(true);
    setSpeaker(true);
    isCallerRef.current = false;
  }, [setCall, setIncoming, setPhase, stopMedia]);

  const scheduleReset = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(reset, 4200);
  }, [reset]);

  /* --------------------------------------------------------- realtime wiring */
  useEffect(() => {
    const offs = [
      on('call:incoming', (data) => {
        if (phaseRef.current !== 'idle') return;
        const info: CallInfo = {
          callId: String(data.callId),
          kind: (data.kind === 'video' ? 'video' : 'voice') as CallKind,
          peer: (data.from as CallPeer) ?? { id: '', displayName: 'Unknown' },
          isFree: Boolean(data.freeAvailable),
          ratePerMinute: Number(data.ratePerMinute || 100),
        };
        isCallerRef.current = false;
        setIncoming(info);
        setSummary(null);
        setPhase('incoming');
      }),
      on('call:accepted', (data) => {
        const current = callRef.current;
        if (!current || current.callId !== String(data.callId)) return;
        const updated: CallInfo = {
          ...current,
          isFree: Boolean(data.isFree),
          ratePerMinute: Number(data.ratePerMinute || current.ratePerMinute),
          peer: (data.peer as CallPeer) ?? current.peer,
        };
        setCall(updated);
        setBalance(Number(data.balance || 0));
        setPhase('connecting');
        if (isCallerRef.current) void startAsCaller(updated.kind);
        else void ensureLocalMedia(updated.kind);
      }),
      on('webrtc:signal', (data) => {
        void handleSignal(data);
      }),
      on('call:tick', (data) => {
        if (callRef.current?.callId !== String(data.callId)) return;
        setElapsed(Number(data.elapsedSeconds || 0));
        setCost(Number(data.cost || 0));
        setBalance(Number(data.balance || 0));
      }),
      on('call:ended', (data) => {
        const current = callRef.current;
        const inc = incomingRef.current;
        const callId = String(data.callId || '');
        if (current?.callId !== callId && inc?.callId !== callId) return;
        setSummary(data as unknown as CallSummary);
        setPhase('ended');
        stopMedia();
        void refresh();
        scheduleReset();
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [
    on,
    startAsCaller,
    ensureLocalMedia,
    handleSignal,
    stopMedia,
    refresh,
    scheduleReset,
    setCall,
    setIncoming,
    setPhase,
  ]);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
      stopMedia();
    },
    [stopMedia]
  );

  /**
   * A call that rings while the socket is still connecting (or after a reconnect)
   * would otherwise be invisible. Recover it from the server when we come online.
   */
  useEffect(() => {
    if (!me) return;
    let alive = true;
    const checkActive = async () => {
      if (phaseRef.current !== 'idle') return;
      try {
        const response = await api<{ call: Record<string, any> | null }>('/calls/active');
        const active = response.call;
        if (!alive || !active) return;
        if (active.status !== 'ringing' || active.callee_id !== me.user.id) return;
        setIncoming({
          callId: String(active.id),
          kind: active.kind === 'video' ? 'video' : 'voice',
          peer: {
            id: String(active.caller_id),
            displayName: String(active.peer_name || 'Unknown'),
            avatarUrl: (active.peer_avatar as string | null) ?? null,
          },
          isFree: false,
          ratePerMinute: Number(active.rate_per_minute || 100),
        });
        setSummary(null);
        setPhase('incoming');
      } catch {
        /* ignore — the socket event will handle it */
      }
    };
    void checkActive();
    const off = on('ready', () => {
      void checkActive();
    });
    return () => {
      alive = false;
      off();
    };
  }, [me, on, setIncoming, setPhase]);

  /* --------------------------------------------------------------- actions */
  const startCall = useCallback(
    async (peer: CallPeer, kind: CallKind) => {
      if (phaseRef.current !== 'idle') {
        toast.push('You are already in a call', 'error');
        return;
      }
      try {
        const response = await api<{ callId: string; ratePerMinute: number; freeAvailable: boolean }>(
          '/calls',
          { method: 'POST', body: { calleeId: peer.id, kind } }
        );
        isCallerRef.current = true;
        setElapsed(0);
        setCost(0);
        setBalance(me?.wallet.balance ?? 0);
        setSummary(null);
        setMuted(false);
        setCameraOn(true);
        setSpeaker(true);
        setCall({
          callId: response.callId,
          kind,
          peer,
          isFree: false,
          ratePerMinute: response.ratePerMinute,
        });
        setPhase('outgoing');
      } catch (error) {
        toast.push((error as Error).message, 'error');
      }
    },
    [me?.wallet.balance, setCall, setPhase, toast]
  );

  const accept = useCallback(async () => {
    const current = incomingRef.current;
    if (!current) return;
    try {
      const response = await api<{ isFree: boolean; ratePerMinute: number; balance: number }>(
        `/calls/${current.callId}/accept`,
        { method: 'POST' }
      );
      isCallerRef.current = false;
      setElapsed(0);
      setCost(0);
      setCall({
        ...current,
        isFree: response.isFree,
        ratePerMinute: response.ratePerMinute,
      });
      setIncoming(null);
      setPhase('connecting');
      setBalance(response.balance);
    } catch (error) {
      toast.push((error as Error).message, 'error');
      reset();
    }
  }, [reset, setCall, setIncoming, setPhase, toast]);

  const reject = useCallback(async () => {
    const current = incomingRef.current;
    setIncoming(null);
    setPhase('idle');
    if (!current) return;
    try {
      await api(`/calls/${current.callId}/reject`, { method: 'POST' });
    } catch {
      /* call already gone */
    }
  }, [setIncoming, setPhase]);

  const cancel = useCallback(async () => {
    const current = callRef.current;
    reset();
    if (!current) return;
    try {
      await api(`/calls/${current.callId}/cancel`, { method: 'POST' });
    } catch {
      /* already ended */
    }
  }, [reset]);

  const end = useCallback(async () => {
    const current = callRef.current;
    if (!current) {
      reset();
      return;
    }
    try {
      const response = await api<{ call: CallSummary }>(`/calls/${current.callId}/end`, {
        method: 'POST',
      });
      setSummary(response.call);
      setPhase('ended');
      stopMedia();
      void refresh();
      scheduleReset();
    } catch (error) {
      toast.push((error as Error).message, 'error');
      reset();
    }
  }, [refresh, reset, scheduleReset, setPhase, stopMedia, toast]);

  const dismiss = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    reset();
  }, [reset]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      localRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      return next;
    });
  }, []);

  const toggleSpeaker = useCallback(() => setSpeaker((value) => !value), []);

  const toggleCamera = useCallback(() => {
    setCameraOn((current) => {
      const next = !current;
      localRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = next;
      });
      return next;
    });
  }, []);

  const switchCamera = useCallback(async () => {
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: next } });
      const track = stream.getVideoTracks()[0];
      const sender = pcRef.current?.getSenders().find((item) => item.track?.kind === 'video');
      if (sender) await sender.replaceTrack(track);
      const audio = localRef.current?.getAudioTracks() ?? [];
      localRef.current?.getVideoTracks().forEach((old) => old.stop());
      const combined = new MediaStream([...audio, track]);
      localRef.current = combined;
      setLocalStream(combined);
      facingRef.current = next;
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  }, [toast]);

  const value = useMemo<CallValue>(
    () => ({
      phase,
      call,
      incoming,
      elapsed,
      cost,
      balance,
      summary,
      muted,
      speaker,
      cameraOn,
      localStream,
      remoteStream,
      mediaError,
      startCall,
      accept,
      reject,
      cancel,
      end,
      dismiss,
      toggleMute,
      toggleSpeaker,
      toggleCamera,
      switchCamera,
    }),
    [
      phase,
      call,
      incoming,
      elapsed,
      cost,
      balance,
      summary,
      muted,
      speaker,
      cameraOn,
      localStream,
      remoteStream,
      mediaError,
      startCall,
      accept,
      reject,
      cancel,
      end,
      dismiss,
      toggleMute,
      toggleSpeaker,
      toggleCamera,
      switchCamera,
    ]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallValue {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used inside CallProvider');
  return context;
}
