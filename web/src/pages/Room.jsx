import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import SeatGrid from '../components/SeatGrid.jsx'
import ChatPanel from '../components/ChatPanel.jsx'
import GiftSheet from '../components/GiftSheet.jsx'
import MemberSheet from '../components/MemberSheet.jsx'
import RoomBanPanel from '../components/RoomBanPanel.jsx'
import RoomMemberList from '../components/RoomMemberList.jsx'
import PhotoIcon, { giftIconName } from '../components/PhotoIcon.jsx'
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
  const [ban, setBan] = useState(null)
  const [messages, setMessages] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showGift, setShowGift] = useState(false)
  const [memberSheet, setMemberSheet] = useState(null)
  const [giftTarget, setGiftTarget] = useState(null)
  const [showBans, setShowBans] = useState(false)
  const [floats, setFloats] = useState([])
  const joining = useRef(false)

  const roomNumber = Number(roomId)
  const myMember = room?.members?.find((member) => member.user.id === user?.id) || null
  const myRole = myMember?.role || null

  const { micOn, error: voiceError, peerStates, remoteStreams, speaking, enableMic, disableMic, leaveVoice } = useVoiceRoom({
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
      setBan(data.ban || null)
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

  const join = useCallback(
    async (password) => {
      setError('')
      try {
        const data = await api.post(`/api/rooms/${roomNumber}/join`, { password: password || null })
        setRoom(data.room)
        setBan(null)
        await load()
      } catch (err) {
        setError(err.message)
      }
    },
    [load, roomNumber],
  )

  // الانضمام تلقائي: من يدخل الغرفة يصبح عضواً ومستمعاً فوراً (بلا رفع يد أو موافقة).
  useEffect(() => {
    if (!room || !user || myMember || joining.current) return
    if (ban || room.password_required) return
    joining.current = true
    join().finally(() => {
      joining.current = false
    })
  }, [room, user, myMember, ban, join])

  useEffect(() => {
    if (myMember) send({ type: 'join_room', room_id: roomNumber })
  }, [myMember, roomNumber, send])

  useSocketEvent('room_state', (payload) => {
    if (payload.room?.id === roomNumber) setRoom(payload.room)
  })
  useSocketEvent('room_like', (payload) => {
    if (payload.room_id !== roomNumber) return
    setRoom((previous) => (previous ? { ...previous, like_count: payload.like_count } : previous))
  })
  useSocketEvent('chat', (payload) => {
    if (payload.room_id !== roomNumber) return
    setMessages((previous) => [...previous, { ...payload.message, mine: payload.message.sender_id === user.id }])
  })
  useSocketEvent('gift', (payload) => {
    if (payload.room_id !== roomNumber) return
    const label = `${payload.sender.display_name || payload.sender.username} أرسل ${payload.gift.name}`
    setMessages((previous) => [...previous, { id: `gift-${Date.now()}`, kind: 'system', text: label }])
    setFloats((previous) => [...previous, { id: `${Date.now()}-${Math.random()}`, emoji: payload.gift.emoji }])
  })
  useSocketEvent('muted', (payload) => {
    if (payload.value) {
      disableMic()
      setNotice('تم كتم المايك من قبل الإدارة')
    }
    load()
  })
  useSocketEvent('unseated', () => {
    disableMic()
    leaveVoice()
    setNotice('تم إنزالك من المقعد — أنت الآن مستمع')
    load()
  })
  useSocketEvent('voice_leave', () => {
    disableMic()
  })
  useSocketEvent('kicked', () => {
    leaveVoice()
    navigate('/rooms')
  })
  useSocketEvent('banned', (payload) => {
    leaveVoice()
    setNotice(
      payload?.expires_at
        ? `تم طردك من الغرفة حتى ${new Date(payload.expires_at).toLocaleString('ar')}`
        : 'تم طردك من الغرفة',
    )
    navigate('/rooms')
  })
  useSocketEvent('room_deleted', () => {
    leaveVoice()
    navigate('/rooms')
  })

  useEffect(() => {
    if (floats.length === 0) return undefined
    const timer = setTimeout(() => setFloats((previous) => previous.slice(1)), 2400)
    return () => clearTimeout(timer)
  }, [floats])

  const leave = async () => {
    leaveVoice()
    try {
      await api.post(`/api/rooms/${roomNumber}/leave`)
    } catch {
      /* مغادرة المالك لا تحذف الغرفة، والخطأ هنا غير مؤثر */
    }
    send({ type: 'leave_room', room_id: roomNumber })
    navigate('/rooms')
  }

  const takeSeat = async (seat) => {
    setError('')
    try {
      const data = await api.post(`/api/rooms/${roomNumber}/seats/${seat}/take`)
      setRoom(data.room)
      setNotice('صعدت إلى المقعد — المايك مكتوم، افتحه عندما تريد التحدث')
    } catch (err) {
      setError(err.message === 'جميع المقاعد مشغولة' ? t('allSeatsBusy') : err.message)
    }
  }

  const releaseSeat = async (seat) => {
    setError('')
    try {
      const data = await api.post(`/api/rooms/${roomNumber}/seats/${seat}/release`)
      setRoom(data.room)
      setNotice(t('listener'))
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleMic = async () => {
    setError('')
    if (micOn) {
      await disableMic()
      api.post(`/api/rooms/${roomNumber}/members/${user.id}/mic`, { value: false }).then((data) => setRoom(data.room)).catch(() => {})
      send({ type: 'mic', room_id: roomNumber, value: false })
      return
    }
    // التحقق على الخادم أولاً، والمايك لا يُفتح إلا بعد الموافقة.
    try {
      const data = await api.post(`/api/rooms/${roomNumber}/members/${user.id}/mic`, { value: true })
      setRoom(data.room)
    } catch (err) {
      setError(err.message)
      return
    }
    const started = await enableMic()
    if (!started) {
      api.post(`/api/rooms/${roomNumber}/members/${user.id}/mic`, { value: false }).catch(() => {})
      return
    }
    send({ type: 'mic', room_id: roomNumber, value: true })
  }

  const toggleLike = async () => {
    setError('')
    try {
      const data = await api.post(`/api/rooms/${roomNumber}/like`)
      setRoom(data.room)
    } catch (err) {
      setError(err.message)
    }
  }

  const moderate = async (action, member, body) => {
    setError('')
    const path = `/api/rooms/${roomNumber}/members/${member.user.id}/${action}`
    const data = body ? await api.post(path, body) : await api.post(path)
    if (data?.room) setRoom(data.room)
    await load()
    return data
  }

  const unseat = async (member) => {
    try {
      await moderate('unseat', member)
    } catch (err) {
      setError(err.message)
    }
  }

  const unban = async (userId) => {
    try {
      await api.del(`/api/rooms/${roomNumber}/bans/${userId}`)
    } catch (err) {
      setError(err.message)
    }
  }

  const deleteRoom = async () => {
    try {
      await api.del(`/api/rooms/${roomNumber}`)
      navigate('/rooms')
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
        {error ? <p className="error-text" data-testid="room-error">{error}</p> : <p className="muted">…</p>}
      </div>
    )
  }

  const myRank = { owner: 3, moderator: 2, assistant: 1, member: 0 }[myRole] ?? -1
  const seated = room.members.filter((member) => member.seat_index !== null)
  const micCount = seated.filter((member) => member.mic_on).length
  const connectedPeers = Object.values(peerStates).filter((state) => state === 'connected').length
  const canBan = myRole === 'owner' || (myRole === 'moderator' && Boolean(myMember?.can_ban))

  return (
    <div className="room-screen">
      <div className={`room-background bg-${room.background}`}>
        <div className="room-header">
          <span className="room-mark">
            <PhotoIcon name="mic" size={22} />
          </span>
          <div className="room-title">
            <strong>{room.name}</strong>
            <div className="muted">
              {t('roomNumber')}: {room.number} · {t('owner')}: {room.owner.display_name || room.owner.username}
            </div>
          </div>
          <div className="topbar-spacer" />
          <button
            type="button"
            className={`like-btn${room.liked_by_me ? ' like-btn-on' : ''}`}
            data-testid="room-like"
            onClick={toggleLike}
            disabled={!myMember}
            title={t('likeRoom')}
          >
            <PhotoIcon name="heart" size={16} />
            <span data-testid="room-like-count">{room.like_count}</span>
          </button>
        </div>

        <div className="room-stats">
          <span data-testid="room-members">
            <PhotoIcon name="friends" size={14} /> {room.member_count}
          </span>
          <span data-testid="room-seated">
            <PhotoIcon name="mic" size={14} /> {micCount}/{room.seat_count}
          </span>
          <span data-testid="room-free-seats">{room.free_seats} {t('seatFree')}</span>
        </div>

        <SeatGrid
          room={room}
          me={user}
          speaking={speaking}
          onSeatClick={takeSeat}
          onMemberClick={setMemberSheet}
          onUnseat={releaseSeat}
        />

        <div className="notice" style={{ marginTop: 12 }}>
          {room.rules ? room.rules.split('\n')[0] : `مرحباً بكم في ${room.name}`}
        </div>

        <div className="room-actions" style={{ marginTop: 12 }}>
          {!myMember ? (
            <button type="button" className="btn btn-primary" data-testid="room-join" onClick={() => join()} disabled={Boolean(ban)}>
              {t('joinNow')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`btn ${micOn ? 'btn-danger' : 'btn-primary'}`}
                data-testid="room-mic"
                onClick={toggleMic}
                disabled={myMember.seat_index === null || myMember.muted_by_mod}
              >
                {micOn ? t('micOff') : t('micOn')}
              </button>
              {myMember.seat_index === null ? (
                <span className="muted" data-testid="seat-hint">
                  اختر مقعداً فارغاً للصعود — المايك يبقى مكتوماً حتى تفتحه
                </span>
              ) : null}
              <button
                type="button"
                className="btn"
                data-testid="room-gift"
                onClick={() => setShowGift(true)}
                disabled={!room.gifts_enabled}
              >
                <PhotoIcon name="gift" size={16} /> {t('gift')}
              </button>
              <button type="button" className="btn" data-testid="room-leave" onClick={leave}>
                {t('leave')}
              </button>
            </>
          )}
        </div>

        {myMember ? (
          <p className="muted" style={{ marginTop: 10 }} data-testid="room-role">
            {ROLE_LABEL[myMember.role]} ·{' '}
            {myMember.seat_index === null ? t('listener') : `مقعد ${myMember.seat_index + 1}`} ·{' '}
            {micOn ? 'مايكك مفتوح' : 'مايكك مكتوم'}
            {canBan ? ` · ${t('canBanPermission')}` : ''}
            {connectedPeers > 0 ? ` · ${t('connected')} (${connectedPeers})` : ''}
          </p>
        ) : null}

        {ban ? (
          <p className="error-text" data-testid="room-ban-notice">
            {t('youAreBanned')} — {t('bannedUntil')}: {new Date(ban.expires_at).toLocaleString('ar')}
            {ban.reason ? ` · ${t('banReason')}: ${ban.reason}` : ''}
          </p>
        ) : null}

        {voiceError ? (
          <p className="error-text" data-testid="voice-error">
            {voiceError}
          </p>
        ) : null}
        {notice ? (
          <p className="muted" data-testid="room-notice">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="error-text" data-testid="room-error">
            {error}
          </p>
        ) : null}

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

        {canBan ? (
          <button type="button" className="btn room-bans-toggle" data-testid="toggle-bans" onClick={() => setShowBans((value) => !value)}>
            <PhotoIcon name="lock" size={16} /> {t('banList')}
          </button>
        ) : null}
      </div>

      {showBans && canBan ? <RoomBanPanel room={room} onUnban={unban} canUnban={myRole === 'owner'} /> : null}

      <RoomMemberList room={room} me={user} onSelect={setMemberSheet} />

      {room.rules ? (
        <div className="card glass">
          <h3 className="section-title room-section-title" style={{ marginTop: 0 }}>
            {t('rules')}
          </h3>
          <ul className="rules-list">
            {room.rules.split('\n').map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {room.chat_enabled ? (
        <ChatPanel
          messages={messages}
          chatEnabled={room.chat_enabled}
          onSend={async (text) => {
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
          initialReceiverId={giftTarget?.user.id || memberSheet?.user.id || null}
          onClose={() => {
            setShowGift(false)
            setGiftTarget(null)
          }}
        />
      ) : null}

      {memberSheet ? (
        <MemberSheet
          room={room}
          me={user}
          member={memberSheet}
          myRole={myRole}
          canBan={canBan}
          onClose={() => setMemberSheet(null)}
          onAction={moderate}
          onUnseat={unseat}
          onGift={(member) => {
            setGiftTarget(member)
            setShowGift(true)
          }}
          onDelete={deleteRoom}
        />
      ) : null}

      {Object.entries(remoteStreams).map(([id, stream]) => (
        <RemoteAudio key={id} stream={stream} />
      ))}

      {floats.map((float) => (
        <span key={float.id} className="gift-float" style={{ insetInlineStart: `${20 + Math.random() * 60}%`, bottom: '18%' }}>
          <PhotoIcon name={giftIconName(float.emoji)} size={46} alt="" />
        </span>
      ))}
    </div>
  )
}
