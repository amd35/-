import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtime } from './realtime';

/**
 * Real-time voice for a room: a small WebRTC mesh between everyone sitting on a
 * mic. The server only relays SDP/ICE through the existing websocket, so the
 * audio itself is peer-to-peer and costs the API nothing.
 *
 * - A user who takes a mic publishes their microphone to every other speaker.
 * - Visitors (no mic) only receive audio.
 * - Mute is a local track flag; the server also persists it and can force it.
 */

interface Options {
  roomId: string;
  meId: string | null;
  /** The caller is seated on a mic. */
  micOn: boolean;
  /** Everyone seated on a mic (including me when `micOn`). */
  speakerIds: string[];
  /** Server told us a moderator muted us. */
  forcedMute?: number;
}

interface SignalPayload {
  type?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useRoomVoice({ roomId, meId, micOn, speakerIds, forcedMute = 0 }: Options) {
  const { send, on } = useRealtime();
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [micError, setMicError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(false);
  const [meshEpoch, setMeshEpoch] = useState(0);

  const localStreamRef = useRef<MediaStream | null>(null);
  const builtEpoch = useRef(0);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIce = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const makingOffer = useRef<Map<string, boolean>>(new Map());
  const analysers = useRef<
    Map<string, { ctx: AudioContext; node: AnalyserNode; data: Uint8Array<ArrayBuffer> }>
  >(new Map());
  const ctxRef = useRef<AudioContext | null>(null);
  const mutedRef = useRef(false);

  const speakerKey = [...speakerIds].sort().join(',');

  /** Applies the mute flag to the live track and remembers it for new tracks. */
  const applyMute = useCallback((value: boolean) => {
    mutedRef.current = value;
    setMutedState(value);
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !value;
    });
  }, []);

  // Acquire the microphone only while the user is seated on a mic.
  useEffect(() => {
    if (!micOn) {
      const hadStream = Boolean(localStreamRef.current);
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setMicError(null);
      if (hadStream) setMeshEpoch((value) => value + 1);
      return;
    }
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        applyMute(mutedRef.current);
        setMicError(null);
        // Force a mesh rebuild so the new tracks are published.
        setMeshEpoch((value) => value + 1);
      })
      .catch((error: Error) => {
        setMicError(error.name === 'NotAllowedError' ? 'mic_permission' : error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [micOn, applyMute]);

  /** Creates one peer connection; the "polite" side yields on offer collisions. */
  const createPeer = useCallback(
    (peerId: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peersRef.current.set(peerId, pc);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send('room:signal', { roomId, to: peerId, payload: { type: 'ice', candidate: event.candidate } });
        }
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        setStreams((current) => ({ ...current, [peerId]: stream }));
      };

      pc.onnegotiationneeded = async () => {
        try {
          makingOffer.current.set(peerId, true);
          await pc.setLocalDescription();
          if (pc.localDescription) {
            send('room:signal', { roomId, to: peerId, payload: { type: 'offer', sdp: pc.localDescription } });
          }
        } catch {
          /* retried on the next seat change */
        } finally {
          makingOffer.current.set(peerId, false);
        }
      };

      const local = localStreamRef.current;
      if (local) {
        for (const track of local.getAudioTracks()) pc.addTrack(track, local);
      } else {
        pc.addTransceiver('audio', { direction: 'recvonly' });
      }
      return pc;
    },
    [meId, roomId, send]
  );

  // Build/tear down the mesh as the seats change or the local stream appears.
  useEffect(() => {
    if (!meId) return;
    const wanted = new Set(speakerIds.filter((id) => id && id !== meId));
    for (const [id, pc] of peersRef.current) {
      if (!wanted.has(id)) {
        pc.close();
        peersRef.current.delete(id);
        pendingIce.current.delete(id);
      }
    }
    // A fresh local stream invalidates every sender; rebuild cleanly.
    if (builtEpoch.current !== meshEpoch) {
      builtEpoch.current = meshEpoch;
      for (const pc of peersRef.current.values()) pc.close();
      peersRef.current.clear();
      setStreams({});
    }
    for (const id of wanted) {
      if (!peersRef.current.has(id)) createPeer(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakerKey, meId, createPeer, meshEpoch]);

  // Incoming offers/answers/ICE from the room mesh.
  useEffect(() => {
    const off = on('room:signal', (data) => {
      if (data.roomId !== roomId) return;
      const from = String(data.from || '');
      const payload = (data.payload || {}) as SignalPayload;
      if (!from || !payload.type) return;

      void (async () => {
        let pc = peersRef.current.get(from);
        if (!pc) pc = createPeer(from);
        const polite = Boolean(meId && meId > from);

        try {
          if (payload.type === 'offer' && payload.sdp) {
            const collision = makingOffer.current.get(from) || pc.signalingState !== 'stable';
            if (collision && !polite) return;
            if (collision) await pc.setLocalDescription({ type: 'rollback' });
            await pc.setRemoteDescription(payload.sdp);
            await pc.setLocalDescription();
            if (pc.localDescription) {
              send('room:signal', { roomId, to: from, payload: { type: 'answer', sdp: pc.localDescription } });
            }
            const queued = pendingIce.current.get(from) ?? [];
            pendingIce.current.delete(from);
            for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => undefined);
          } else if (payload.type === 'answer' && payload.sdp) {
            if (pc.signalingState === 'have-local-offer') await pc.setRemoteDescription(payload.sdp);
            const queued = pendingIce.current.get(from) ?? [];
            pendingIce.current.delete(from);
            for (const candidate of queued) await pc.addIceCandidate(candidate).catch(() => undefined);
          } else if (payload.type === 'ice' && payload.candidate) {
            if (pc.remoteDescription) await pc.addIceCandidate(payload.candidate).catch(() => undefined);
            else {
              const queue = pendingIce.current.get(from) ?? [];
              queue.push(payload.candidate);
              pendingIce.current.set(from, queue);
            }
          }
        } catch {
          /* a dropped candidate or a stale offer is safe to ignore */
        }
      })();
    });
    return off;
  }, [on, roomId, meId, send, createPeer]);

  // Audio levels drive the "speaking" glow on each seat.
  useEffect(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    void ctx.resume();
    const created: Array<{ ctx: AudioContext; node: AnalyserNode; data: Uint8Array<ArrayBuffer> }> = [];
    const attach = (id: string, stream: MediaStream) => {
      if (analysers.current.has(id)) return;
      try {
        const source = ctx.createMediaStreamSource(stream);
        const node = ctx.createAnalyser();
        node.fftSize = 512;
        source.connect(node);
        const entry = { ctx, node, data: new Uint8Array(node.frequencyBinCount) };
        analysers.current.set(id, entry);
        created.push(entry);
      } catch {
        /* silent stream */
      }
    };
    for (const [id, stream] of Object.entries(streams)) attach(id, stream);
    if (localStreamRef.current && meId) attach(meId, localStreamRef.current);

    const timer = setInterval(() => {
      const next: Record<string, number> = {};
      for (const [id, entry] of analysers.current) {
        entry.node.getByteFrequencyData(entry.data);
        let sum = 0;
        for (const value of entry.data) sum += value;
        next[id] = Math.min(1, sum / entry.data.length / 90);
      }
      setLevels(next);
    }, 220);

    return () => {
      clearInterval(timer);
      analysers.current.clear();
      for (const entry of created) {
        try {
          entry.node.disconnect();
        } catch {
          /* already gone */
        }
      }
    };
  }, [streams, meId, meshEpoch]);

  // A moderator muted us: kill the track immediately.
  useEffect(() => {
    if (forcedMute > 0) applyMute(true);
  }, [forcedMute, applyMute]);

  useEffect(
    () => () => {
      for (const pc of peersRef.current.values()) pc.close();
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
    },
    []
  );

  const setMuted = useCallback(
    (value: boolean) => {
      applyMute(value);
    },
    [applyMute]
  );

  return { streams, levels, muted, setMuted, micError };
}
