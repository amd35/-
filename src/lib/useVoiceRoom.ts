import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Room } from './api'

export type VoicePeer = { clientId: string; name: string; mic: boolean; hand: boolean }

type RawPeer = { client_id: string; name: string; mic: boolean; hand: boolean }

const toPeer = (raw: RawPeer): VoicePeer => ({
  clientId: raw.client_id,
  name: raw.name,
  mic: Boolean(raw.mic),
  hand: Boolean(raw.hand),
})
export type VoiceGift = { id: number; emoji: string; from: string }

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

/**
 * مكالمة صوتية حقيقية داخل الغرفة: يفتح قناة WebSocket للإشارات،
 * ويصل كل الأجهزة بشبكة WebRTC، ويبثّ حالة المايك ورفع اليد والهدايا.
 */
export function useVoiceRoom(room: Room) {
  const [peers, setPeers] = useState<VoicePeer[]>([])
  const [streams, setStreams] = useState<Record<string, MediaStream>>({})
  const [selfName, setSelfName] = useState('أنت')
  const [micOn, setMicOn] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [handRaised, setHandRaised] = useState(false)
  const [gift, setGift] = useState<VoiceGift | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const connections = useRef(new Map<string, RTCPeerConnection>())
  const streamRef = useRef<MediaStream | null>(null)
  const giftTimer = useRef<number | undefined>(undefined)
  const selfId = useRef(`guest-${Math.random().toString(36).slice(2, 10)}`)

  const send = useCallback((message: unknown) => {
    const socket = socketRef.current
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }, [])

  useEffect(() => {
    if (typeof WebSocket === 'undefined') return

    const supportsCalls = typeof RTCPeerConnection !== 'undefined'
    let active = true

    function connectionFor(peerId: string) {
      const existing = connections.current.get(peerId)
      if (existing) return existing
      const connection = new RTCPeerConnection(ICE_SERVERS)
      connections.current.set(peerId, connection)

      const local = streamRef.current
      if (local) local.getTracks().forEach((track) => connection.addTrack(track, local))

      connection.onicecandidate = (event) => {
        if (event.candidate)
          send({
            type: 'signal',
            target: peerId,
            data: { type: 'candidate', candidate: event.candidate.toJSON() },
          })
      }
      connection.ontrack = (event) => {
        const [remote] = event.streams
        if (remote && active) setStreams((prev) => ({ ...prev, [peerId]: remote }))
      }
      return connection
    }

    async function offerTo(peerId: string) {
      if (!supportsCalls) return
      const connection = connectionFor(peerId)
      const offer = await connection.createOffer()
      await connection.setLocalDescription(offer)
      send({ type: 'signal', target: peerId, data: offer })
    }

    async function handleSignal(from: string, data: RTCSessionDescriptionInit | { type: 'candidate'; candidate: RTCIceCandidateInit }) {
      if (!supportsCalls) return
      const connection = connectionFor(from)
      if (data.type === 'candidate') {
        await connection.addIceCandidate(data.candidate).catch(() => undefined)
        return
      }
      await connection.setRemoteDescription(data)
      if (data.type === 'offer') {
        const answer = await connection.createAnswer()
        await connection.setLocalDescription(answer)
        send({ type: 'signal', target: from, data: answer })
      }
    }

    async function connect() {
      const me = await api.me().catch(() => null)
      if (!active) return
      const name = me?.name || 'مستخدم'
      setSelfName(name)
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const url = `${scheme}://${window.location.host}/api/ws/rooms/${room.id}?client_id=${selfId.current}&name=${encodeURIComponent(name)}`
      const socket = new WebSocket(url)
      socketRef.current = socket

      socket.onmessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.type === 'welcome') {
          const others = (message.peers as RawPeer[]).map(toPeer)
          setPeers(others)
          others.forEach((peer) => void offerTo(peer.clientId))
        } else if (message.type === 'presence') {
          const everyone = (message.peers as RawPeer[]).map(toPeer)
          setPeers(everyone.filter((peer) => peer.clientId !== selfId.current))
          const present = new Set(everyone.map((peer) => peer.clientId))
          connections.current.forEach((connection, peerId) => {
            if (!present.has(peerId)) {
              connection.close()
              connections.current.delete(peerId)
            }
          })
        } else if (message.type === 'signal') {
          void handleSignal(message.from, message.data)
        } else if (message.type === 'gift') {
          window.clearTimeout(giftTimer.current)
          setGift({ id: Date.now(), emoji: message.emoji, from: message.from_name })
          giftTimer.current = window.setTimeout(() => setGift(null), 3200)
        }
      }
      socket.onerror = () => undefined
    }

    void connect()

    return () => {
      active = false
      window.clearTimeout(giftTimer.current)
      connections.current.forEach((connection) => connection.close())
      connections.current.clear()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [room.id, send])

  const toggleMic = useCallback(async () => {
    if (micOn) {
      streamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = false
      })
      setMicOn(false)
      send({ type: 'state', mic: false, hand: handRaised })
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('المتصفح لا يدعم المِيكروفون أو الصفحة لا تستخدم اتصالًا آمنًا')
      return
    }
    try {
      const stream =
        streamRef.current ??
        (await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        }))
      streamRef.current = stream
      connections.current.forEach((connection) => {
        stream.getAudioTracks().forEach((track) => {
          if (!connection.getSenders().some((sender) => sender.track === track))
            connection.addTrack(track, stream)
        })
      })
      stream.getAudioTracks().forEach((track) => {
        track.enabled = true
      })
      setMicError(null)
      setMicOn(true)
      send({ type: 'state', mic: true, hand: handRaised })
    } catch {
      setMicError('لم يُمنح إذن المِيكروفون — اسمح بالوصول ثم حاول مجددًا')
    }
  }, [micOn, handRaised, send])

  const toggleHand = useCallback(() => {
    setHandRaised((raised) => {
      send({ type: 'state', mic: micOn, hand: !raised })
      return !raised
    })
  }, [micOn, send])

  const sendGift = useCallback((emoji: string) => send({ type: 'gift', emoji }), [send])

  return {
    peers,
    streams,
    selfName,
    micOn,
    micError,
    toggleMic,
    handRaised,
    toggleHand,
    sendGift,
    gift,
  }
}
