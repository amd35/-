import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Real WebRTC mesh for a room: one RTCPeerConnection per member who is actually
 * speaking (microphone on and seated).
 *
 * Signalling goes through the application socket (webrtc_offer / webrtc_answer /
 * webrtc_ice) and is only relayed between members of the same voice room. The
 * member with the higher user id opens the offer, so both sides agree without
 * extra coordination.
 *
 * While muted nothing is transmitted at all: the local track is stopped and the
 * sender is removed, so a muted user sends no audio. Taking a seat connects the
 * audio path; leaving the seat goes back to listener-only.
 *
 * A mesh is fine for small rooms (12 seats); larger rooms need an SFU (see README).
 */

// مستوى الصوت الذي يُعتبر كلاماً فعلياً (طاقة الإشارة بعد حساب الجذر التربيعي).
const SPEAKING_LEVEL = 0.04

export function useVoiceRoom({ room, me, send, subscribe, iceServers }) {
  const [micOn, setMicOn] = useState(false)
  const [error, setError] = useState('')
  const [peerStates, setPeerStates] = useState({})
  const [remoteStreams, setRemoteStreams] = useState({})
  const [speaking, setSpeaking] = useState({})
  const peers = useRef(new Map())
  const localStream = useRef(null)
  const localAnalyser = useRef(null)
  const pendingIce = useRef(new Map())
  const levelTimers = useRef(new Map())
  const roomRef = useRef(room)
  roomRef.current = room

  const stopLevelWatch = useCallback((userId) => {
    const timer = levelTimers.current.get(userId)
    if (timer) clearInterval(timer)
    levelTimers.current.delete(userId)
    setSpeaking((previous) => {
      if (!(userId in previous)) return previous
      const next = { ...previous }
      delete next[userId]
      return next
    })
  }, [])

  /** قياس مستوى الصوت الحقيقي من المسار: المؤشر يظهر عند الكلام فعلاً لا عند فتح المايك. */
  const watchLevel = useCallback(
    (userId, stream) => {
      if (!stream || stream.getAudioTracks().length === 0) return
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) return
      stopLevelWatch(userId)
      const context = new AudioContextClass()
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const buffer = new Uint8Array(analyser.fftSize)
      if (userId === me?.id) localAnalyser.current = context
      const timer = setInterval(() => {
        analyser.getByteTimeDomainData(buffer)
        let peak = 0
        for (let index = 0; index < buffer.length; index += 1) {
          peak = Math.max(peak, Math.abs(buffer[index] - 128) / 128)
        }
        setSpeaking((previous) => {
          const active = peak >= SPEAKING_LEVEL
          if (Boolean(previous[userId]) === active) return previous
          return { ...previous, [userId]: active }
        })
      }, 220)
      levelTimers.current.set(userId, timer)
    },
    [me?.id, stopLevelWatch],
  )

  const closePeer = useCallback(
    (userId) => {
      const entry = peers.current.get(userId)
      if (entry) {
        entry.pc.onicecandidate = null
        entry.pc.ontrack = null
        entry.pc.onconnectionstatechange = null
        entry.pc.close()
        peers.current.delete(userId)
      }
      stopLevelWatch(userId)
      setRemoteStreams((previous) => {
        if (!(userId in previous)) return previous
        const next = { ...previous }
        delete next[userId]
        return next
      })
    },
    [stopLevelWatch],
  )

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
        if (stream) {
          setRemoteStreams((previous) => ({ ...previous, [userId]: stream }))
          watchLevel(userId, stream)
        }
      }
      pc.onconnectionstatechange = () => {
        setPeerStates((previous) => ({ ...previous, [userId]: pc.connectionState }))
        if (pc.connectionState === 'failed') {
          closePeer(userId)
        } else if (pc.connectionState === 'disconnected') {
          // انقطاع الشبكة: المحاولة تستمر تلقائياً عبر ICE، ولو فشلت يُعاد الاتصال.
          setError('انقطع الاتصال ببعض المتحدثين — تتم إعادة المحاولة')
          setTimeout(() => {
            if (peers.current.get(userId)?.pc === pc && pc.connectionState === 'disconnected') {
              closePeer(userId)
            }
          }, 8000)
        }
      }
      if (localStream.current) {
        localStream.current.getTracks().forEach((track) => pc.addTrack(track, localStream.current))
      }
      return pc
    },
    [closePeer, iceServers, send, watchLevel],
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
  }, [room, me, closePeer, createPeer, negotiate, micOn])

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
      watchLevel(me?.id, stream)
      peers.current.forEach((entry) => {
        stream.getTracks().forEach((track) => entry.pc.addTrack(track, stream))
      })
      for (const userId of peers.current.keys()) {
        if (me && me.id > userId) await negotiate(userId)
      }
      return true
    } catch (err) {
      setError(
        err?.name === 'NotAllowedError'
          ? 'لم يُسمح باستخدام المايك — اسمح بالوصول من إعدادات المتصفح ثم حاول مرة أخرى'
          : `تعذر الوصول إلى المايك: ${err.message}`,
      )
      return false
    }
  }, [me, negotiate, watchLevel])

  const disableMic = useCallback(async () => {
    localStream.current?.getTracks().forEach((track) => track.stop())
    localStream.current = null
    peers.current.forEach((entry) => {
      entry.pc.getSenders().forEach((sender) => {
        if (sender.track && sender.track.kind === 'audio') entry.pc.removeTrack(sender)
      })
    })
    if (localAnalyser.current) {
      localAnalyser.current.close().catch(() => {})
      localAnalyser.current = null
    }
    if (me?.id) stopLevelWatch(me.id)
    setMicOn(false)
  }, [me?.id, stopLevelWatch])

  const leaveVoice = useCallback(() => {
    localStream.current?.getTracks().forEach((track) => track.stop())
    localStream.current = null
    if (localAnalyser.current) {
      localAnalyser.current.close().catch(() => {})
      localAnalyser.current = null
    }
    Array.from(peers.current.keys()).forEach(closePeer)
    setMicOn(false)
  }, [closePeer])

  useEffect(() => {
    return () => {
      Array.from(levelTimers.current.keys()).forEach(stopLevelWatch)
      leaveVoice()
    }
  }, [leaveVoice, stopLevelWatch])

  return { micOn, error, peerStates, remoteStreams, speaking, enableMic, disableMic, leaveVoice }
}
