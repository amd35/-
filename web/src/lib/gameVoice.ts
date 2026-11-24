import { useCallback, useEffect, useRef, useState } from 'react';

type Listener = (data: Record<string, unknown>) => void;

interface Options {
  matchId: string | null;
  opponentId: string | null;
  on: (event: string, handler: Listener) => () => void;
  send: (event: string, data?: Record<string, unknown>) => void;
}

interface SignalPayload {
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

/**
 * Live voice between the two players of a match. The server only relays the
 * WebRTC signals over the existing websocket (`game:signal`); the audio itself
 * is peer-to-peer. The microphone is requested only when the player taps the
 * mic button, and it is released when the match screen closes.
 */
export function useGameVoice({ matchId, opponentId, on, send }: Options) {
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const [incoming, setIncoming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const localAnalyser = useRef<AnalyserNode | null>(null);
  const remoteAnalyser = useRef<AnalyserNode | null>(null);
  const meterRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ensurePeer = useCallback(() => {
    if (peerRef.current) return peerRef.current;
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    peer.onicecandidate = (event) => {
      if (event.candidate && matchId && opponentId) {
        send('game:signal', { matchId, to: opponentId, payload: { candidate: event.candidate.toJSON() } });
      }
    };
    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.autoplay = true;
      }
      audioRef.current.srcObject = stream;
      audioRef.current.muted = remoteMuted;
      void audioRef.current.play().catch(() => undefined);
      const context = contextRef.current ?? new AudioContext();
      contextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      remoteAnalyser.current = analyser;
    };
    peerRef.current = peer;
    return peer;
  }, [matchId, opponentId, send, remoteMuted]);

  const startMeters = useCallback(() => {
    if (meterRef.current) return;
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    if (localRef.current && !localAnalyser.current) {
      const source = context.createMediaStreamSource(localRef.current);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      localAnalyser.current = analyser;
    }
    const read = (analyser: AnalyserNode | null) => {
      if (!analyser) return 0;
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) {
        const centred = (value - 128) / 128;
        sum += centred * centred;
      }
      return Math.sqrt(sum / data.length);
    };
    meterRef.current = setInterval(() => {
      setSpeaking(read(localAnalyser.current) > 0.045 && !muted);
      setRemoteSpeaking(read(remoteAnalyser.current) > 0.045 && !remoteMuted);
    }, 220);
  }, [muted, remoteMuted]);

  const start = useCallback(async () => {
    if (!matchId || !opponentId || localRef.current) return;
    setStarting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localRef.current = stream;
      setActive(true);
      const peer = ensurePeer();
      for (const track of stream.getTracks()) peer.addTrack(track, stream);
      startMeters();
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      send('game:signal', { matchId, to: opponentId, payload: { offer } });
    } catch (err) {
      const name = (err as DOMException)?.name;
      setError(
        name === 'NotAllowedError'
          ? 'لم يتم منح إذن المايك — اسمح بالوصول من إعدادات المتصفح'
          : 'تعذر تشغيل المايك على هذا الجهاز'
      );
    } finally {
      setStarting(false);
    }
  }, [matchId, opponentId, ensurePeer, startMeters, send]);

  const stop = useCallback(() => {
    for (const track of localRef.current?.getTracks() ?? []) track.stop();
    localRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    if (meterRef.current) clearInterval(meterRef.current);
    meterRef.current = null;
    localAnalyser.current = null;
    remoteAnalyser.current = null;
    setActive(false);
    setSpeaking(false);
    setRemoteSpeaking(false);
    setIncoming(false);
  }, []);

  const toggleMute = useCallback(() => {
    const stream = localRef.current;
    if (!stream) return;
    const next = !muted;
    for (const track of stream.getAudioTracks()) track.enabled = !next;
    setMuted(next);
  }, [muted]);

  const toggleRemoteMute = useCallback(() => {
    const next = !remoteMuted;
    if (audioRef.current) audioRef.current.muted = next;
    setRemoteMuted(next);
  }, [remoteMuted]);

  useEffect(() => {
    if (!matchId || !opponentId) return;
    const off = on('game:signal', (data) => {
      if (data.matchId !== matchId || data.from !== opponentId) return;
      const payload = (data.payload ?? null) as SignalPayload | null;
      if (!payload) return;
      void (async () => {
        try {
          if (payload.offer) {
            if (!localRef.current) {
              setIncoming(true);
              return;
            }
            const peer = ensurePeer();
            await peer.setRemoteDescription(payload.offer);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            send('game:signal', { matchId, to: opponentId, payload: { answer } });
          } else if (payload.answer) {
            await peerRef.current?.setRemoteDescription(payload.answer);
          } else if (payload.candidate) {
            await peerRef.current?.addIceCandidate(payload.candidate).catch(() => undefined);
          }
        } catch {
          // A late signal for a closed connection is harmless.
        }
      })();
    });
    return off;
  }, [matchId, opponentId, on, send, ensurePeer]);

  useEffect(() => () => stop(), [stop]);

  return {
    active,
    starting,
    muted,
    remoteMuted,
    speaking,
    remoteSpeaking,
    incoming,
    error,
    start,
    stop,
    toggleMute,
    toggleRemoteMute,
  };
}
