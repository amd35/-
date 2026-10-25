import { useCallback, useEffect, useState } from 'react'
import Avatar from '../components/Avatar.jsx'
import PhotoIcon from '../components/PhotoIcon.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

export default function Friends() {
  const { user } = useAuth()
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
    <div>
      <h1 className="page-title">{t('friends')}</h1>

      <form className="card glass" onSubmit={search}>
        <div className="field">
          <label htmlFor="friend-search">{t('searchUsers')}</label>
          <div className="composer">
            <input
              id="friend-search"
              data-testid="friend-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchUsers')}
            />
            <button type="submit" className="btn btn-accent" data-testid="friend-search-submit">
              {t('search')}
            </button>
          </div>
        </div>
      </form>

      {results.length ? (
        <div className="card glass" data-testid="search-results">
          {results.map((result) => (
            <div className="list-item" key={result.id}>
              <Avatar user={result} size={36} />
              <div>
                <strong>{result.display_name || result.username}</strong>
                <div className="muted">
                  @{result.username} · {t('level')} {result.level} {result.online ? `· ${t('online')}` : ''}
                </div>
              </div>
              <div className="topbar-spacer" />
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
          ))}
        </div>
      ) : null}

      <h2 className="section-title">{t('requests')}</h2>
      <div className="card glass" data-testid="friend-requests">
        {requests.incoming.length === 0 && requests.outgoing.length === 0 ? <p className="muted">—</p> : null}
        {requests.incoming.map((request) => (
          <div className="list-item" key={request.id}>
            <Avatar user={request.user} size={36} />
            <span>{request.user.display_name || request.user.username}</span>
            <div className="topbar-spacer" />
            <button type="button" className="btn btn-primary" data-testid={`accept-${request.id}`} onClick={() => respond(request, 'accept')}>
              {t('accept')}
            </button>
            <button type="button" className="btn" onClick={() => respond(request, 'reject')}>
              {t('reject')}
            </button>
          </div>
        ))}
        {requests.outgoing.map((request) => (
          <div className="list-item" key={request.id}>
            <span className="muted">
              بانتظار رد {request.user.display_name || request.user.username}
            </span>
          </div>
        ))}
      </div>

      <h2 className="section-title">
        {t('friends')} ({friends.length})
      </h2>
      <div className="card glass" data-testid="friends-list">
        {friends.length === 0 ? <p className="muted">—</p> : null}
        {friends.map((friend) => (
          <div className="list-item" key={friend.id}>
            <Avatar user={friend} size={36} />
            <div>
              <strong>{friend.display_name || friend.username}</strong>
              <div className="muted">
                <PhotoIcon name={friend.online ? 'dotOn' : 'dotOff'} size={12} />{' '}
                {friend.online ? t('online') : t('offline')}
              </div>
            </div>
            <div className="topbar-spacer" />
            <button type="button" className="btn" onClick={() => openConversation(friend)}>
              {t('sendMessage')}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => api.del(`/api/friends/${friend.id}`).then(load)}
            >
              حذف
            </button>
          </div>
        ))}
      </div>

      {conversation ? (
        <div className="card glass" data-testid="conversation">
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
            <input data-testid="dm-input" value={text} onChange={(event) => setText(event.target.value)} placeholder={t('messagePlaceholder')} />
            <button type="submit" className="btn btn-primary" data-testid="dm-send">
              {t('send')}
            </button>
          </form>
        </div>
      ) : null}

      {notice ? <p className="success-text">{notice}</p> : null}
      {error ? <p className="error-text" data-testid="friends-error">{error}</p> : null}
      <p className="muted" style={{ marginTop: 14 }}>
        {user.username}
      </p>
    </div>
  )
}
