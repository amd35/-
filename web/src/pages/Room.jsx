import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import SeatGrid from '../components/SeatGrid.jsx'
import ChatPanel from '../components/ChatPanel.jsx'
import GiftSheet from '../components/GiftSheet.jsx'
import MemberSheet from '../components/MemberSheet.jsx'
import RoomBanPanel from '../components/RoomBanPanel.jsx'
import RoomBackgroundSheet from '../components/RoomBackgroundSheet.jsx'
import RoomToolsSheet from '../components/RoomToolsSheet.jsx'
import PhotoIcon, { giftIconName } from '../components/PhotoIcon.jsx'
import { api } from '../lib/api.js'
import { useAuth, useSocketEvent } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'
import { useVoiceRoom } from '../lib/voice.js'

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
  const { lang, t } = useI18n()
  const [room, setRoom] = useState(null)
  const [ban, setBan] = useState(null)
  const [messages, setMessages] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showGift, setShowGift] = useState(false)
  const [memberSheet, setMemberSheet] = useState(null)
  const [giftTarget, setGiftTarget] = useState(null)
  const [showBans, setShowBans] = useState(false)
  const [showBackgrounds, setShowBackgrounds] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [compact, setCompact] = useState(false)
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

  // تغيير الخلفية: المالك فقط يرى الزر، والخادم يحفظها ويبثّها لكل من في الغرفة.
  const applyBackground = async (background) => {
    const data = await api.post(`/api/rooms/${roomNumber}/background`, { background })
    setRoom(data.room)
    setShowBackgrounds(false)
    setNotice(t('backgroundApplied'))
  }

  // مشاركة الغرفة: مشاركة النظام إن توفّرت، وإلا نسخ الرابط إلى الحافظة.
  const shareRoom = async () => {
    const url = `${window.location.origin}/rooms/${roomNumber}`
    try {
      if (navigator.share) {
        await navigator.share({ title: room?.name || '', url })
        return
      }
      await navigator.clipboard.writeText(url)
      setNotice(t('roomLinkCopied'))
    } catch {
      setNotice(t('roomLinkCopyFailed'))
    }
  }

  // «دردشة» في الشريط السفلي: ينزل إلى حقل الكتابة ويضع المؤشر فيه.
  const focusChat = () => {
    document.querySelector('.room-chat')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    document.querySelector('[data-testid="chat-input"]')?.focus()
  }

  if (!room) {
    return (
      <div>
        <h1 className="page-title">{t('rooms')}</h1>
        {error ? <p className="error-text" data-testid="room-error">{error}</p> : <p className="muted">…</p>}
      </div>
    )
  }

  const seated = room.members.filter((member) => member.seat_index !== null)
  const micCount = seated.filter((member) => member.mic_on).length
  const connectedPeers = Object.values(peerStates).filter((state) => state === 'connected').length
  const canBan = myRole === 'owner' || (myRole === 'moderator' && Boolean(myMember?.can_ban))
  const backgroundName = (lang === 'en' ? room.background_name_en : room.background_name_ar) || room.background
  const levelPercent = user.next_level_xp ? Math.round(((user.xp_into_level || 0) / user.next_level_xp) * 100) : null
  const voiceLive = Boolean(micOn) || connectedPeers > 0

  return (
    <div className="room-screen">
      <div
        className={`room-background${room.background_url ? ' room-background-photo' : ` bg-${room.background}`}`}
        data-testid="room-background"
        data-background={room.background}
        style={room.background_url ? { '--room-photo': `url(${room.background_url})` } : undefined}
      >
        <header className="room-header">
          <div className="room-head-side">
            <button type="button" className="room-round" data-testid="room-leave" onClick={leave} title={t('leave')}>
              <span className="room-round-text">{t('leave')}</span>
            </button>
            <button
              type="button"
              className="room-round"
              data-testid="room-minimize"
              onClick={() => setCompact((value) => !value)}
              title={t('minimizeRoom')}
              aria-label={t('minimizeRoom')}
            >
              <span className="room-round-glyph">{compact ? '+' : '−'}</span>
            </button>
            <Link className="room-me" to="/profile" data-testid="room-me" title={t('profile')}>
              <Avatar user={user} size={32} />
              {myMember?.seat_index !== null && myMember?.seat_index !== undefined ? (
                <span className="room-me-seat">{myMember.seat_index + 1}</span>
              ) : null}
            </Link>
          </div>

          <div className="room-title">
            <strong>{room.name}</strong>
            <span className="muted">
              {t('owner')}: {room.owner.display_name || room.owner.username}
            </span>
            <span className="muted">ID {room.number}</span>
          </div>

          <div className="room-head-side">
            <button
              type="button"
              className="room-round"
              data-testid="room-members"
              onClick={() => setShowTools(true)}
              title={t('members')}
            >
              <PhotoIcon name="friends" size={18} />
              <span className="room-round-count" data-testid="room-members-count">
                {room.member_count}
              </span>
            </button>
            <button type="button" className="room-round" data-testid="room-share" onClick={shareRoom} title={t('shareRoom')}>
              <PhotoIcon name="party" size={18} />
            </button>
          </div>
        </header>

        {compact ? null : (
          <>
            <div className="room-welcome" data-testid="room-welcome">
              <span className="room-welcome-text">
                {t('welcomePrefix')} {room.name}. {t('welcomeSuffix')}
              </span>
              <span className={`room-voice-chip${voiceLive ? ' room-voice-chip-on' : ''}`} data-testid="room-voice-state">
                {voiceLive ? t('voiceConnected') : t('voiceIdle')}
              </span>
            </div>

            <div className="room-stats">
              <span className="room-stat" data-testid="room-level">
                <PhotoIcon name="crown" size={14} /> {t('levelShort')} {user.level}
                {levelPercent === null ? null : <b data-testid="room-level-percent">{levelPercent}%</b>}
              </span>
              <button
                type="button"
                className={`room-stat room-stat-like${room.liked_by_me ? ' room-stat-on' : ''}`}
                data-testid="room-like"
                onClick={toggleLike}
                disabled={!myMember}
                title={t('likeRoom')}
              >
                <PhotoIcon name="trophy" size={16} /> <span data-testid="room-like-count">{room.like_count}</span>
              </button>
              <span className="room-stat" data-testid="room-seated">
                <PhotoIcon name="mic" size={14} /> {micCount}/{room.seat_count}
              </span>
            </div>
          </>
        )}

        <SeatGrid
          room={room}
          me={user}
          speaking={speaking}
          onSeatClick={takeSeat}
          onMemberClick={setMemberSheet}
          onUnseat={releaseSeat}
        />

        {!myMember ? (
          <div className="room-join-row">
            <button type="button" className="btn btn-primary" data-testid="room-join" onClick={() => join()} disabled={Boolean(ban)}>
              {t('joinNow')}
            </button>
          </div>
        ) : null}

        {myMember && myMember.seat_index === null ? (
          <p className="muted room-hint" data-testid="seat-hint">
            اختر مقعداً فارغاً للصعود — المايك يبقى مكتوماً حتى تفتحه
          </p>
        ) : null}

        {myMember ? (
          <p className="muted room-hint" data-testid="room-role">
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
      </div>

      {room.chat_enabled ? (
        <div className="room-chat">
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
        </div>
      ) : (
        <p className="notice">الدردشة معطلة في هذه الغرفة.</p>
      )}

      <nav className="room-toolbar" aria-label={t('roomToolsTitle')}>
        <button type="button" className="room-tool" data-testid="room-tools" onClick={() => setShowTools(true)}>
          <PhotoIcon name="palette" size={22} />
          <span>{t('roomTools')}</span>
        </button>
        <button
          type="button"
          className={`room-tool room-speak${micOn ? ' room-speak-on' : ''}`}
          data-testid="room-mic"
          onClick={toggleMic}
          disabled={!myMember || myMember.seat_index === null || myMember.muted_by_mod}
          title={micOn ? t('micOff') : t('micOn')}
        >
          <span className="room-speak-circle">
            <PhotoIcon name="mic" size={26} />
          </span>
          <span>{t('speakTab')}</span>
        </button>
        <button type="button" className="room-tool" data-testid="room-chat-tab" onClick={focusChat}>
          <PhotoIcon name="megaphone" size={22} />
          <span>{t('chatTab')}</span>
        </button>
        <button
          type="button"
          className="room-tool"
          data-testid="room-gift"
          onClick={() => setShowGift(true)}
          disabled={!room.gifts_enabled || !myMember}
        >
          <PhotoIcon name="gift" size={22} />
          <span>{t('giftTab')}</span>
        </button>
      </nav>

      {showTools ? (
        <RoomToolsSheet
          room={room}
          me={user}
          isOwner={myRole === 'owner'}
          canBan={canBan}
          backgroundName={backgroundName}
          onClose={() => setShowTools(false)}
          onSelectMember={(member) => {
            setShowTools(false)
            setMemberSheet(member)
          }}
          onOpenBackgrounds={() => {
            setShowTools(false)
            setShowBackgrounds(true)
          }}
          onOpenBans={() => {
            setShowTools(false)
            setShowBans(true)
          }}
          onShare={shareRoom}
        />
      ) : null}

      {showBackgrounds && myRole === 'owner' ? (
        <RoomBackgroundSheet room={room} onClose={() => setShowBackgrounds(false)} onApply={applyBackground} />
      ) : null}

      {showBans && canBan ? <RoomBanPanel room={room} onUnban={unban} canUnban={myRole === 'owner'} /> : null}

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
