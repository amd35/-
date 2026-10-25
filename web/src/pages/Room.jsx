import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SeatGrid from '../components/SeatGrid.jsx'
import ChatPanel from '../components/ChatPanel.jsx'
import GiftSheet from '../components/GiftSheet.jsx'
import Avatar from '../components/Avatar.jsx'
import { api } from '../lib/api.js'
import { useAuth, useSocketEvent } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'
import { useVoiceRoom } from '../lib/voice.js'

const BACKGROUNDS = ['sunset', 'night', 'desert', 'sea', 'royal', 'aurora']
const ROLE_LABEL = { owner: 'مالك', moderator: 'مشرف', assistant: 'مساعد', member: 'عضو' }

function RemoteAudio({ stream }) {
  const ref = useRef(null)
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream
      ref.current.play().catch(() => {})
    }
  }, [stream])
  return <audio ref={ref} autoPlay playsInline className="remote-audio" />
}

export default function Room() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, send, subscribe, meta } = useAuth()
  const { t } = useI18n()
  const [room, setRoom] = useState(null)
  const [messages, setMessages] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showGift, setShowGift] = useState(false)
  const [memberSheet, setMemberSheet] = useState(null)
  const [floats, setFloats] = useState([])

  const roomNumber = Number(roomId)
  const myMember = room?.members?.find((member) => member.user.id === user.id) || null

  const { micOn, error: voiceError, peerStates, remoteStreams, enableMic, disableMic, leaveVoice } = useVoiceRoom({
    room,
    me: user,
    send,
    subscribe,
    iceServers: meta?.ice_servers,
  })

  const load = useCallback(async () => {
    try {
      const data = await api.get(`/api/rooms/${roomNumber}`)
      setRoom(data.room)
      if (data.room.members.some((member) => member.user.id === user.id)) {
        const history = await api.get(`/api/rooms/${roomNumber}/messages?limit=50`)
        setMessages(history.messages.map((message) => ({ ...message, mine: message.sender_id === user.id })))
      }
    } catch (err) {
      setError(err.message)
    }
  }, [roomNumber, user.id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (myMember) send({ type: 'join_room', room_id: roomNumber })
  }, [myMember, roomNumber, send])

  useSocketEvent('room_state', (payload) => {
    if (payload.room?.id === roomNumber) setRoom(payload.room)
  })
  useSocketEvent('chat', (payload) => {
    if (payload.room_id !== roomNumber) return
    setMessages((previous) => [...previous, { ...payload.message, mine: payload.message.sender_id === user.id }])
  })
  useSocketEvent('gift', (payload) => {
    if (payload.room_id !== roomNumber) return
    const label = `${payload.sender.display_name || payload.sender.username} أرسل ${payload.gift.emoji} ${payload.gift.name}`
    setMessages((previous) => [...previous, { id: `gift-${Date.now()}`, kind: 'system', text: label }])
    setFloats((previous) => [...previous, { id: `${Date.now()}-${Math.random()}`, emoji: payload.gift.emoji }])
  })
  useSocketEvent('mic_request', () => setNotice('هناك طلب صعود إلى المايك'))
  useSocketEvent('mic_granted', () => {
    setNotice('تمت الموافقة على المايك — يمكنك الجلوس على مقعد')
    load()
  })
  useSocketEvent('muted', (payload) => {
    if (payload.value) {
      disableMic()
      setNotice('تم كتم المايك من قبل الإدارة')
    }
    load()
  })
  useSocketEvent('kicked', () => navigate('/rooms'))
  useSocketEvent('banned', () => navigate('/rooms'))

  useEffect(() => {
    if (floats.length === 0) return undefined
    const timer = setTimeout(() => setFloats((previous) => previous.slice(1)), 2400)
    return () => clearTimeout(timer)
  }, [floats])

  const join = async () => {
    setError('')
    try {
      const data = await api.post(`/api/rooms/${roomNumber}/join`, {})
      setRoom(data.room)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const leave = async () => {
    leaveVoice()
    try {
      await api.post(`/api/rooms/${roomNumber}/leave`)
    } catch {
      /* leaving twice is harmless */
    }
    send({ type: 'leave_room', room_id: roomNumber })
    navigate('/rooms')
  }

  const takeSeat = async (seat) => {
    setError('')
    try {
      const data = await api.post(`/api/rooms/${roomNumber}/seats/${seat}/take`)
      setRoom(data.room)
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleHand = async () => {
    try {
      const data = await api.post(`/api/rooms/${roomNumber}/hand`, { value: !myMember?.hand_raised })
      setRoom(data.room)
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleMic = async () => {
    setError('')
    if (micOn) {
      await disableMic()
      try {
        await api.post(`/api/rooms/${roomNumber}/members/${user.id}/mic`, { value: false })
      } catch {
        /* state already broadcast */
      }
      send({ type: 'mic', room_id: roomNumber, value: false })
      return
    }
    const started = await enableMic()
    if (!started) return
    try {
      const data = await api.post(`/api/rooms/${roomNumber}/members/${user.id}/mic`, { value: true })
      setRoom(data.room)
      send({ type: 'mic', room_id: roomNumber, value: true })
    } catch (err) {
      setError(err.message)
      await disableMic()
    }
  }

  const moderate = async (action, member, body) => {
    setError('')
    try {
      const path = `/api/rooms/${roomNumber}/members/${member.user.id}/${action}`
      const data = body ? await api.post(path, body) : await api.post(path)
      if (data?.room) setRoom(data.room)
      setMemberSheet(null)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const approve = async (member) => {
    setError('')
    try {
      const data = await api.post(`/api/rooms/${roomNumber}/hands/${member.user.id}/approve`)
      setRoom(data.room)
      setMemberSheet(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const changeBackground = async (background) => {
    try {
      const data = await api.post(`/api/rooms/${roomNumber}/background`, { background })
      setRoom(data.room)
    } catch (err) {
      setError(err.message)
    }
  }

  if (!room) {
    return (
      <div>
        <h1 className="page-title">{t('rooms')}</h1>
        {error ? <p className="error-text">{error}</p> : <p className="muted">…</p>}
      </div>
    )
  }

  const myRank = { owner: 3, moderator: 2, assistant: 1, member: 0 }[myMember?.role] ?? -1
  const seated = room.members.filter((member) => member.seat_index !== null && member.member_index !== -1)
  const connectedPeers = Object.values(peerStates).filter((state) => state === 'connected').length

  return (
    <div className="room-screen">
      <div className={`room-background bg-${room.background}`}>
        <div className="room-header">
          <span className="seat-crown" style={{ position: 'static' }}>
            👑
          </span>
          <div>
            <strong>{room.name}</strong>
            <div className="muted">ID: {room.id} · {t('owner')}: {room.owner.display_name || room.owner.username}</div>
          </div>
          <div className="topbar-spacer" />
          <div className="room-stats">
            <span data-testid="room-members">👥 {room.member_count}</span>
            <span>🎤 {seated.filter((member) => member.mic_on).length}</span>
            <span>✋ {room.hand_requests?.length || 0}</span>
          </div>
        </div>

        <SeatGrid room={room} me={user} myMember={myMember} onSeatClick={takeSeat} onMemberClick={setMemberSheet} />

        <div className="notice" style={{ marginTop: 12 }}>
          {room.rules ? room.rules.split('\n')[0] : `مرحباً بكم في ${room.name}`}
        </div>

        <div className="room-actions" style={{ marginTop: 12 }}>
          {!myMember ? (
            <button type="button" className="btn btn-primary" data-testid="room-join" onClick={join}>
              {t('joinRoom')}
            </button>
          ) : (
            <>
              <button type="button" className="btn" data-testid="room-hand" onClick={toggleHand}>
                {myMember.hand_raised ? t('lowerHand') : t('raiseHand')}
              </button>
              <button
                type="button"
                className={`btn ${micOn ? 'btn-danger' : 'btn-primary'}`}
                data-testid="room-mic"
                onClick={toggleMic}
              >
                {micOn ? t('micOff') : t('micOn')}
              </button>
              <button type="button" className="btn" data-testid="room-gift" onClick={() => setShowGift(true)} disabled={!room.gifts_enabled}>
                🎁 {t('gift')}
              </button>
              <button type="button" className="btn btn-danger" data-testid="room-leave" onClick={leave}>
                {t('leave')}
              </button>
            </>
          )}
        </div>

        {myMember ? (
          <p className="muted" style={{ marginTop: 10 }} data-testid="room-role">
            {ROLE_LABEL[myMember.role]} · {myMember.seat_index === null ? 'بدون مقعد' : `مقعد ${myMember.seat_index + 1}`} ·{' '}
            {myMember.mic_granted ? 'مسموح بالمايك' : 'بانتظار الموافقة'}
            {connectedPeers > 0 ? ` · ${t('connected')} (${connectedPeers})` : ''}
          </p>
        ) : null}

        {micOn || connectedPeers > 0 ? (
          <p className="success-text">
            {connectedPeers > 0 ? t('connected') : t('connecting')} — {micOn ? 'مايكك مفتوح' : 'مايكك مغلق'}
          </p>
        ) : null}

        {voiceError ? <p className="error-text" data-testid="voice-error">{voiceError}</p> : null}
        {notice ? <p className="muted" data-testid="room-notice">{notice}</p> : null}
        {error ? <p className="error-text" data-testid="room-error">{error}</p> : null}

        {myRank >= 1 ? (
          <div className="row wrap" style={{ marginTop: 12 }}>
            <span className="muted">الخلفية:</span>
            {BACKGROUNDS.map((background) => (
              <button
                key={background}
                type="button"
                className={`auth-tab${room.background === background ? ' auth-tab-active' : ''}`}
                style={{ flex: '0 0 auto', padding: '6px 10px' }}
                onClick={() => changeBackground(background)}
              >
                {background}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {room.rules ? (
        <div className="card glass">
          <h3 className="section-title" style={{ marginTop: 0 }}>
            {t('rules')}
          </h3>
          <ul className="rules-list">
            {room.rules.split('\n').map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {room.hand_requests?.length && myRank >= 1 ? (
        <div className="card glass" data-testid="hand-requests">
          <h3 className="section-title" style={{ marginTop: 0 }}>
            طلبات المايك
          </h3>
          {room.hand_requests.map((request) => {
            const member = room.members.find((item) => item.user.id === request.user_id)
            if (!member) return null
            return (
              <div className="list-item" key={request.user_id}>
                <Avatar user={member.user} size={36} />
                <span>{member.user.display_name || member.user.username}</span>
                <div className="topbar-spacer" />
                <button type="button" className="btn btn-primary" onClick={() => approve(member)}>
                  {t('approve')}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    api.post(`/api/rooms/${roomNumber}/hands/${member.user.id}/reject`).then((data) => setRoom(data.room))
                  }
                >
                  {t('reject')}
                </button>
              </div>
            )
          })}
        </div>
      ) : null}

      {room.chat_enabled ? (
        <ChatPanel
          messages={messages}
          chatEnabled={room.chat_enabled}
          onSend={async (text) => {
            // Realtime first; the REST endpoint is the fallback when the socket
            // is still connecting, so a message is never lost silently.
            if (send({ type: 'chat', room_id: roomNumber, text })) return
            try {
              const message = await api.post(`/api/rooms/${roomNumber}/messages`, { text })
              setMessages((previous) => [...previous, { ...message, mine: true }])
            } catch (err) {
              setError(err.message)
            }
          }}
        />
      ) : (
        <p className="notice">الدردشة معطلة في هذه الغرفة.</p>
      )}

      {showGift ? (
        <GiftSheet
          room={room}
          members={room.members.filter((member) => member.user.id !== user.id)}
          initialReceiverId={memberSheet?.user.id || null}
          onClose={() => setShowGift(false)}
        />
      ) : null}

      {memberSheet ? (
        <div className="overlay" onClick={() => setMemberSheet(null)}>
          <div className="glass sheet stack" onClick={(event) => event.stopPropagation()} data-testid="member-sheet">
            <div className="row">
              <Avatar user={memberSheet.user} />
              <div>
                <strong>{memberSheet.user.display_name || memberSheet.user.username}</strong>
                <div className="muted">
                  {ROLE_LABEL[memberSheet.role]} · {t('level')} {memberSheet.user.level}
                </div>
              </div>
            </div>
            {myRank >= 1 && memberSheet.user.id !== user.id ? (
              <>
                <button type="button" className="btn" onClick={() => moderate('mute', memberSheet, { value: !memberSheet.muted_by_mod })}>
                  {memberSheet.muted_by_mod ? 'إلغاء الكتم' : t('mute')}
                </button>
                <button type="button" className="btn" onClick={() => approve(memberSheet)} disabled={!memberSheet.hand_raised}>
                  {t('approve')} المايك
                </button>
                <button type="button" className="btn" onClick={() => setShowGift(true)}>
                  🎁 {t('gift')}
                </button>
              </>
            ) : null}
            {myRank >= 2 && memberSheet.user.id !== user.id ? (
              <>
                <button type="button" className="btn btn-danger" onClick={() => moderate('kick', memberSheet)}>
                  {t('kick')}
                </button>
                <button type="button" className="btn btn-danger" onClick={() => moderate('ban', memberSheet)}>
                  {t('ban')}
                </button>
              </>
            ) : null}
            {myMember?.role === 'owner' && memberSheet.user.id !== user.id ? (
              <>
                <button type="button" className="btn" onClick={() => moderate('role', memberSheet, { role: 'moderator' })}>
                  تعيين مشرف
                </button>
                <button type="button" className="btn" onClick={() => moderate('role', memberSheet, { role: 'assistant' })}>
                  تعيين مساعد
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="btn"
              onClick={() =>
                api
                  .post('/api/reports', { target_type: 'user', target_id: memberSheet.user.id, reason: 'إساءة', details: '' })
                  .then(() => {
                    setNotice('تم إرسال بلاغ إلى الإدارة')
                    setMemberSheet(null)
                  })
              }
            >
              {t('report')}
            </button>
            <button type="button" className="btn" onClick={() => setMemberSheet(null)}>
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : null}

      {Object.entries(remoteStreams).map(([id, stream]) => (
        <RemoteAudio key={id} stream={stream} />
      ))}

      {floats.map((float) => (
        <span key={float.id} className="gift-float" style={{ insetInlineStart: `${20 + Math.random() * 60}%`, bottom: '18%' }}>
          {float.emoji}
        </span>
      ))}
    </div>
  )
}
