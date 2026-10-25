import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Real WebRTC mesh for a room: one RTCPeerConnection per speaking member.
 *
 * Signalling goes through the application socket (webrtc_offer / webrtc_answer /
 * webrtc_ice). The member with the higher user id is the one that opens the
 * offer, so both sides agree without extra coordination.
 *
 * A mesh is fine for small rooms; large rooms need an SFU (see README).
 */
export function useVoiceRoom({ room, me, send, subscribe, iceServers }) {
  const [micOn, setMicOn] = useState(false)
  const [error, setError] = useState('')
  const [peerStates, setPeerStates] = useState({})
  const [remoteStreams, setRemoteStreams] = useState({})
  const peers = useRef(new Map())
  const localStream = useRef(null)
  const pendingIce = useRef(new Map())
  const roomRef = useRef(room)
  roomRef.current = room

  const closePeer = useCallback((userId) => {
    const entry = peers.current.get(userId)
    if (entry) {
      entry.pc.onicecandidate = null
      entry.pc.ontrack = null
      entry.pc.close()
      peers.current.delete(userId)
    }
    setRemoteStreams((previous) => {
      if (!(userId in previous)) return previous
      const next = { ...previous }
      delete next[userId]
      return next
    })
  }, [])

  const createPeer = useCallback(
    (userId) => {
      const pc = new RTCPeerConnection({ iceServers: iceServers || [] })
      peers.current.set(userId, { pc })
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({ type: 'webrtc_ice', to: userId, payload: event.candidate.toJSON() })
        }
      }
      pc.ontrack = (event) => {
        const [stream] = event.streams
        if (stream) setRemoteStreams((previous) => ({ ...previous, [userId]: stream }))
      }
      pc.onconnectionstatechange = () => {
        setPeerStates((previous) => ({ ...previous, [userId]: pc.connectionState }))
        if (pc.connectionState === 'failed') closePeer(userId)
      }
      if (localStream.current) {
        localStream.current.getTracks().forEach((track) => pc.addTrack(track, localStream.current))
      }
      return pc
    },
    [closePeer, iceServers, send],
  )

  const negotiate = useCallback(
    async (userId) => {
      const entry = peers.current.get(userId)
      if (!entry) return
      const offer = await entry.pc.createOffer()
      await entry.pc.setLocalDescription(offer)
      send({
        type: 'webrtc_offer',
        to: userId,
        payload: { type: 'offer', sdp: entry.pc.localDescription.sdp },
      })
    },
    [send],
  )

  // Signalling handlers.
  useEffect(() => {
    const unsubscribe = subscribe((payload) => {
      if (payload.type === 'webrtc_offer') {
        const userId = payload.from
        const pc = peers.current.get(userId)?.pc || createPeer(userId)
        ;(async () => {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.payload))
          const queued = pendingIce.current.get(userId) || []
          for (const candidate of queued) await pc.addIceCandidate(candidate)
          pendingIce.current.delete(userId)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          send({
            type: 'webrtc_answer',
            to: userId,
            payload: { type: 'answer', sdp: pc.localDescription.sdp },
          })
        })().catch((err) => setError(err.message))
      } else if (payload.type === 'webrtc_answer') {
        const entry = peers.current.get(payload.from)
        if (entry) {
          entry.pc
            .setRemoteDescription(new RTCSessionDescription(payload.payload))
            .then(async () => {
              const queued = pendingIce.current.get(payload.from) || []
              for (const candidate of queued) await entry.pc.addIceCandidate(candidate)
              pendingIce.current.delete(payload.from)
            })
            .catch((err) => setError(err.message))
        }
      } else if (payload.type === 'webrtc_ice') {
        const entry = peers.current.get(payload.from)
        const candidate = new RTCIceCandidate(payload.payload)
        if (entry && entry.pc.remoteDescription) {
          entry.pc.addIceCandidate(candidate).catch(() => {})
        } else {
          const queued = pendingIce.current.get(payload.from) || []
          queued.push(candidate)
          pendingIce.current.set(payload.from, queued)
        }
      }
    })
    return unsubscribe
  }, [createPeer, send, subscribe])

  // Keep one connection per member who has a live microphone.
  useEffect(() => {
    if (!room || !me) return
    const speaking = new Map(
      (room.members || [])
        .filter((member) => member.seat_index !== null && member.mic_on && member.user.id !== me.id)
        .map((member) => [member.user.id, member]),
    )

    for (const userId of Array.from(peers.current.keys())) {
      if (!speaking.has(userId)) closePeer(userId)
    }
    for (const userId of speaking.keys()) {
      if (peers.current.has(userId)) continue
      if (me.id > userId) negotiate(userId).catch((err) => setError(err.message))
      else createPeer(userId)
    }
  }, [room, me, closePeer, createPeer, negotiate])

  const enableMic = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('هذا المتصفح لا يدعم التقاط الصوت')
      return false
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      localStream.current = stream
      setMicOn(true)
      setError('')
      peers.current.forEach((entry) => {
        stream.getTracks().forEach((track) => entry.pc.addTrack(track, stream))
      })
      for (const userId of peers.current.keys()) {
        if (me && me.id > userId) await negotiate(userId)
      }
      return true
    } catch (err) {
      setError(`تعذر الوصول إلى المايك: ${err.message}`)
      return false
    }
  }, [me, negotiate])

  const disableMic = useCallback(async () => {
    localStream.current?.getTracks().forEach((track) => track.stop())
    localStream.current = null
    peers.current.forEach((entry) => {
      entry.pc.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === 'audio') entry.pc.removeTrack(sender)
      })
    })
    setMicOn(false)
  }, [])

  const leaveVoice = useCallback(() => {
    localStream.current?.getTracks().forEach((track) => track.stop())
    localStream.current = null
    Array.from(peers.current.keys()).forEach(closePeer)
    setMicOn(false)
  }, [closePeer])

  useEffect(() => leaveVoice, [leaveVoice])

  return { micOn, error, peerStates, remoteStreams, enableMic, disableMic, leaveVoice }
}
