import { useEffect, useState } from 'react'
import Avatar from './Avatar.jsx'
import PhotoIcon from './PhotoIcon.jsx'
import { api } from '../lib/api.js'
import { useI18n } from '../lib/i18n.jsx'

/**
 * لوحة «إضافة صديق» بنفس ترتيب التصميم: عنوان + إغلاق، بحث بالاسم أو رقم
 * المستخدم، ثم تبويبان حقيقيان — «مقترحون لك» من `/api/friends/suggestions`
 * و«مقترحات أخرى» من نتائج البحث — وبطاقة لكل عضو فيها طلب صداقة ومتابعة/إلغاؤها.
 */
export default function AddFriendSheet({ onClose, onRequestSent }) {
  const { t } = useI18n()
  const [tab, setTab] = useState('suggested')
  const [query, setQuery] = useState('')
  const [suggested, setSuggested] = useState([])
  const [results, setResults] = useState([])
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .get('/api/friends/suggestions')
      .then((data) => setSuggested(data.users))
      .catch((err) => setError(err.message))
  }, [])

  const search = async (event) => {
    event.preventDefault()
    if (!query.trim()) return
    try {
      const data = await api.get(`/api/users/search?q=${encodeURIComponent(query.trim())}`)
      setResults(data.users)
      setTab('results')
    } catch (err) {
      setError(err.message)
    }
  }

  // حالة المتابعة تُقلب في القائمتين معًا حتى يبقى الزر صادقًا في أي تبويب.
  const toggleFollow = async (target) => {
    setError('')
    const flip = (rows) => rows.map((row) => (row.id === target.id ? { ...row, following: !row.following } : row))
    try {
      if (target.following) await api.del(`/api/follows/${target.id}`)
      else await api.post(`/api/follows/${target.id}`)
      setSuggested(flip)
      setResults(flip)
    } catch (err) {
      setError(err.message)
    }
  }

  const request = async (target) => {
    setError('')
    setNotice('')
    try {
      await api.post('/api/friends/requests', { username: target.username })
      setNotice(`تم إرسال طلب صداقة إلى ${target.display_name || target.username}`)
      onRequestSent()
    } catch (err) {
      setError(err.message)
    }
  }

  const rows = tab === 'results' ? results : suggested

  return (
    <div className="overlay" onClick={onClose} data-testid="add-friend-sheet">
      <div className="sheet add-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="add-head" data-testid="add-friend-head">
          <button type="button" className="add-close" onClick={onClose} aria-label={t('close')} data-testid="add-friend-close">
            ✕
          </button>
          <div className="add-head-text">
            <h3 className="add-title">{t('addFriend')}</h3>
            <p className="add-subtitle">{t('addFriendSubtitle')}</p>
          </div>
        </div>

        <form className="chats-search add-search" onSubmit={search}>
          <button type="submit" className="chats-search-btn" aria-label={t('search')} data-testid="add-friend-search-submit">
            <PhotoIcon name="search" size={20} />
          </button>
          <input
            data-testid="add-friend-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchNameOrId')}
            aria-label={t('searchNameOrId')}
          />
        </form>

        <div className="add-tabs">
          <button
            type="button"
            className={`add-tab${tab === 'suggested' ? ' is-active' : ''}`}
            onClick={() => setTab('suggested')}
            data-testid="add-tab-suggested"
          >
            {t('suggestedForYou')}
          </button>
          <button
            type="button"
            className={`add-tab${tab === 'results' ? ' is-active' : ''}`}
            onClick={() => setTab('results')}
            data-testid="add-tab-other"
          >
            {t('otherSuggestions')}
          </button>
        </div>

        <div className="add-list" data-testid="add-friend-list">
          {rows.length === 0 ? <p className="muted">{tab === 'results' ? t('searchForMore') : t('notYet')}</p> : null}
          {rows.map((person) => (
            <div className="add-card" key={person.id}>
              <Avatar user={person} size={44} />
              <div className="add-card-text">
                <strong>{person.display_name || person.username}</strong>
                <span className="add-card-id">{person.id}</span>
              </div>
              <span className="topbar-spacer" />
              <div className="add-actions">
                <button
                  type="button"
                  className="add-btn add-btn-primary"
                  onClick={() => request(person)}
                  data-testid={`request-${person.id}`}
                >
                  {t('friendRequest')}
                </button>
                <button
                  type="button"
                  className="add-btn"
                  onClick={() => toggleFollow(person)}
                  data-testid={`sheet-follow-${person.id}`}
                >
                  {person.following ? t('unfollow') : t('follow')}
                </button>
              </div>
            </div>
          ))}
        </div>

        {notice ? <p className="success-text">{notice}</p> : null}
        {error ? (
          <p className="error-text" data-testid="add-friend-error">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
