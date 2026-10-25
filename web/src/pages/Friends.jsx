import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AddFriendSheet from '../components/AddFriendSheet.jsx'
import Avatar from '../components/Avatar.jsx'
import PageNav from '../components/PageNav.jsx'
import PhotoIcon from '../components/PhotoIcon.jsx'
import { api } from '../lib/api.js'
import { useI18n } from '../lib/i18n.jsx'

/**
 * صفحة «المحادثات» بترتيب التصميم: هيدر الصفحة (زر إضافة صديق · العنوان والوصف ·
 * شعار)، شريط البحث، صف الدعم الفني، ثم المحتوى الحقيقي (نتائج البحث، طلبات
 * الصداقة، الأصدقاء، المحادثة الخاصة)، وشريط تنقل الصفحة في الأسفل.
 * كل الأرقام والأسماء من `/api/*` — لا بيانات وهمية ولا أزرار شكلية.
 */
export default function Friends() {
  const { t } = useI18n()
  const [friends, setFriends] = useState([])
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] })
  const [results, setResults] = useState([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [conversation, setConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    try {
      const [friendData, requestData] = await Promise.all([api.get('/api/friends'), api.get('/api/friends/requests')])
      setFriends(friendData.friends)
      setRequests(requestData)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const search = async (event) => {
    event.preventDefault()
    if (!query.trim()) return
    try {
      const data = await api.get(`/api/users/search?q=${encodeURIComponent(query.trim())}`)
      setResults(data.users)
    } catch (err) {
      setError(err.message)
    }
  }

  const openConversation = async (other) => {
    try {
      const data = await api.get(`/api/messages/${other.id}`)
      setConversation(data.user)
      setMessages(data.messages)
    } catch (err) {
      setError(err.message)
    }
  }

  const sendMessage = async (event) => {
    event.preventDefault()
    if (!text.trim() || !conversation) return
    try {
      const message = await api.post(`/api/messages/${conversation.id}`, { text: text.trim() })
      setMessages((previous) => [...previous, { ...message, mine: true }])
      setText('')
    } catch (err) {
      setError(err.message)
    }
  }

  const addFriend = async (username) => {
    setError('')
    try {
      await api.post('/api/friends/requests', { username })
      setNotice(`تم إرسال طلب صداقة إلى ${username}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  // متابعة/إلغاء متابعة عضو من نتائج البحث — الحالة تأتي من الخادم (result.following).
  const toggleFollow = async (target) => {
    setError('')
    try {
      if (target.following) await api.del(`/api/follows/${target.id}`)
      else await api.post(`/api/follows/${target.id}`)
      setResults((rows) => rows.map((row) => (row.id === target.id ? { ...row, following: !row.following } : row)))
    } catch (err) {
      setError(err.message)
    }
  }

  const respond = async (request, action) => {
    try {
      await api.post(`/api/friends/requests/${request.id}/${action}`)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="chats-screen" data-testid="friends-page">
      <header className="chats-head">
        <button type="button" className="chats-add" onClick={() => setShowAdd(true)} data-testid="open-add-friend">
          <span className="chats-add-plus" aria-hidden="true">
            +
          </span>
          {t('addFriend')}
        </button>
        <div className="chats-head-text">
          <h1 className="chats-title" data-testid="chats-title">
            {t('chats')}
          </h1>
          <p className="chats-subtitle">{t('chatsSubtitle')}</p>
        </div>
        <span className="chats-logo" aria-hidden="true">
          T
        </span>
      </header>

      <form className="chats-search" onSubmit={search}>
        <button type="submit" className="chats-search-btn" aria-label={t('search')} data-testid="friend-search-submit">
          <PhotoIcon name="search" size={20} />
        </button>
        <input
          id="friend-search"
          data-testid="friend-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('searchByName')}
          aria-label={t('searchByName')}
        />
      </form>

      <Link className="chats-support" to="/contact" data-testid="chats-support">
        <span className="chats-support-icon">
          <PhotoIcon name="support" size={22} />
        </span>
        <span className="chats-support-text">
          <strong>{t('technicalSupport')}</strong>
          <span>{t('supportHint')}</span>
        </span>
        <span className="topbar-spacer" />
        <span className="chats-support-chevron">‹</span>
      </Link>

      {results.length ? (
        <div className="chats-card" data-testid="search-results">
          <h2 className="section-title">{t('search')}</h2>
          {results.map((result) => (
            <div className="chats-row" key={result.id}>
              <Avatar user={result} size={40} />
              <div className="chats-row-text">
                <strong className="chats-row-name">{result.display_name || result.username}</strong>
                <span className="chats-row-meta">
                  @{result.username} · {t('level')} {result.level} {result.online ? `· ${t('online')}` : ''}
                </span>
              </div>
              <span className="topbar-spacer" />
              <div className="chats-row-actions">
                <button
                  type="button"
                  className={result.following ? 'btn' : 'btn btn-accent'}
                  data-testid={`follow-${result.id}`}
                  onClick={() => toggleFollow(result)}
                >
                  {result.following ? t('unfollow') : t('follow')}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => addFriend(result.username)}>
                  {t('addFriend')}
                </button>
                <button type="button" className="btn" onClick={() => openConversation(result)}>
                  {t('sendMessage')}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <h2 className="section-title">{t('requests')}</h2>
      <div className="chats-card" data-testid="friend-requests">
        {requests.incoming.length === 0 && requests.outgoing.length === 0 ? <p className="muted">—</p> : null}
        {requests.incoming.map((request) => (
          <div className="chats-row" key={request.id}>
            <Avatar user={request.user} size={40} />
            <span className="chats-row-name">{request.user.display_name || request.user.username}</span>
            <span className="topbar-spacer" />
            <div className="chats-row-actions">
              <button
                type="button"
                className="btn btn-primary"
                data-testid={`accept-${request.id}`}
                onClick={() => respond(request, 'accept')}
              >
                {t('accept')}
              </button>
              <button type="button" className="btn" onClick={() => respond(request, 'reject')}>
                {t('reject')}
              </button>
            </div>
          </div>
        ))}
        {requests.outgoing.map((request) => (
          <div className="chats-row" key={request.id}>
            <span className="chats-row-meta">بانتظار رد {request.user.display_name || request.user.username}</span>
          </div>
        ))}
      </div>

      <h2 className="section-title">
        {t('friends')} ({friends.length})
      </h2>
      <div className="chats-card" data-testid="friends-list">
        {friends.length === 0 ? <p className="muted">—</p> : null}
        {friends.map((friend) => (
          <div className="chats-row" key={friend.id}>
            <Avatar user={friend} size={40} />
            <div className="chats-row-text">
              <strong className="chats-row-name">{friend.display_name || friend.username}</strong>
              <span className="chats-row-meta">
                <PhotoIcon name={friend.online ? 'dotOn' : 'dotOff'} size={12} />{' '}
                {friend.online ? t('online') : t('offline')}
              </span>
            </div>
            <span className="topbar-spacer" />
            <div className="chats-row-actions">
              <button type="button" className="btn" onClick={() => openConversation(friend)}>
                {t('sendMessage')}
              </button>
              <button type="button" className="btn btn-danger" onClick={() => api.del(`/api/friends/${friend.id}`).then(load)}>
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>

      {conversation ? (
        <div className="chats-card" data-testid="conversation">
          <div className="row-between">
            <strong>{conversation.display_name || conversation.username}</strong>
            <button type="button" className="btn" onClick={() => setConversation(null)}>
              إغلاق
            </button>
          </div>
          <div className="chat-log">
            {messages.map((message) => (
              <div className="chat-item" key={message.id}>
                <div className={`chat-bubble${message.mine ? ' chat-bubble-mine' : ''}`}>{message.text}</div>
              </div>
            ))}
          </div>
          <form className="composer" onSubmit={sendMessage}>
            <input
              data-testid="dm-input"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t('messagePlaceholder')}
            />
            <button type="submit" className="btn btn-primary" data-testid="dm-send">
              {t('send')}
            </button>
          </form>
        </div>
      ) : null}

      {notice ? <p className="success-text">{notice}</p> : null}
      {error ? (
        <p className="error-text" data-testid="friends-error">
          {error}
        </p>
      ) : null}

      <PageNav testIdPrefix="chats-nav" />

      {showAdd ? <AddFriendSheet onClose={() => setShowAdd(false)} onRequestSent={load} /> : null}
    </div>
  )
}
