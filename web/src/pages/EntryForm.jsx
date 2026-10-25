import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageBar from '../components/PageBar.jsx'
import { api } from '../lib/api.js'
import { useRemote } from '../lib/hooks.js'
import { useAuth } from '../lib/store.jsx'
import { BACKGROUND_LABELS, usePageText } from '../lib/pageText.js'
import { useI18n } from '../lib/i18n.jsx'

// قائمة احتياطية فقط حتى تصل مكتبة الخادم (`/api/rooms/backgrounds`).
// الخلفيات نفسها (20 صورة فوتوغرافية) تأتي من `app/room_backgrounds.py`.
const BACKGROUNDS = ['sunset', 'night', 'desert', 'sea', 'royal', 'aurora']

/** Create a voice room, or edit one you own when opened as /entry-form?id=<room>. */
export default function EntryForm() {
  const [params] = useSearchParams()
  const editId = Number(params.get('id') || 0)
  const { user } = useAuth()
  const s = usePageText()
  const { lang, t } = useI18n()
  const navigate = useNavigate()
  const labels = BACKGROUND_LABELS[lang] || BACKGROUND_LABELS.ar

  const [form, setForm] = useState({
    name: '',
    description: '',
    background: '',
    seat_count: 20,
    is_private: false,
    password: '',
    rules: '',
    gifts_enabled: true,
    chat_enabled: true,
  })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const existing = useRemote(
    async () => (editId ? (await api.get(`/api/rooms/${editId}`)).room : null),
    [editId],
  )

  // مكتبة الخلفيات من الخادم، والقائمة الاحتياطية أعلاه عند تعذّر الطلب فقط.
  const backgroundLibrary = useRemote(async () => api.get('/api/rooms/backgrounds'), [])
  const backgroundOptions = backgroundLibrary.data?.backgrounds?.length
    ? backgroundLibrary.data.backgrounds.map((item) => ({ slug: item.slug, label: lang === 'en' ? item.name_en : item.name_ar }))
    : BACKGROUNDS.map((key) => ({ slug: key, label: labels[key] || key }))

  useEffect(() => {
    if (!form.background && backgroundLibrary.data?.default) {
      setForm((previous) => ({ ...previous, background: backgroundLibrary.data.default }))
    }
  }, [backgroundLibrary.data, form.background])

  useEffect(() => {
    const room = existing.data
    if (!room) return
    setForm({
      name: room.name || '',
      description: room.description || '',
      background: room.background || '',
      seat_count: room.seat_count || 20,
      is_private: Boolean(room.is_private),
      password: '',
      rules: room.rules || '',
      gifts_enabled: Boolean(room.gifts_enabled),
      chat_enabled: Boolean(room.chat_enabled),
    })
  }, [existing.data])

  const field = (key, value) => setForm((previous) => ({ ...previous, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description,
        background: form.background,
        seat_count: Number(form.seat_count),
        is_private: form.is_private,
        rules: form.rules,
        gifts_enabled: form.gifts_enabled,
        chat_enabled: form.chat_enabled,
      }
      if (form.password) payload.password = form.password

      if (editId) {
        if (existing.data && existing.data.owner?.id !== user.id) throw new Error(s.ownerOnly)
        await api.patch(`/api/rooms/${editId}`, payload)
        setMessage(s.savedRoom)
        await existing.reload()
      } else {
        const result = await api.post('/api/rooms', payload)
        const created = result?.room || result
        setMessage(s.createdRoom)
        if (created?.id) navigate(`/item-details?type=room&id=${created.id}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="entry-form-page">
      <PageBar title={editId ? s.entryEdit : s.entryCreate} back="/data-management" testId="entry-form" />

      <p className="muted" style={{ margin: '0 2px 12px' }}>
        {s.entrySub}
      </p>

      {existing.error ? <p className="error-text">{existing.error}</p> : null}

      <form className="card glass stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="room-name">{s.fieldName}</label>
          <input
            id="room-name"
            required
            minLength={2}
            maxLength={64}
            value={form.name}
            data-testid="entry-name"
            onChange={(event) => field('name', event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="room-description">{s.fieldDescription}</label>
          <textarea
            id="room-description"
            rows="3"
            value={form.description}
            data-testid="entry-description"
            onChange={(event) => field('description', event.target.value)}
          />
        </div>

        <div className="grid-two">
          <div className="field">
            <label htmlFor="room-background">{s.fieldBackground}</label>
            <select
              id="room-background"
              value={form.background}
              data-testid="entry-background"
              onChange={(event) => field('background', event.target.value)}
            >
              {backgroundOptions.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="room-seats">{s.fieldSeatCount}</label>
            <input
              id="room-seats"
              type="number"
              min="4"
              max="24"
              value={form.seat_count}
              data-testid="entry-seats"
              onChange={(event) => field('seat_count', event.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="room-rules">{s.fieldRules}</label>
          <textarea
            id="room-rules"
            rows="2"
            value={form.rules}
            data-testid="entry-rules"
            onChange={(event) => field('rules', event.target.value)}
          />
        </div>

        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            style={{ width: 18 }}
            checked={form.is_private}
            data-testid="entry-private"
            onChange={(event) => field('is_private', event.target.checked)}
          />
          <span>{s.fieldIsPrivate}</span>
        </label>

        {form.is_private ? (
          <div className="field">
            <label htmlFor="room-password">{s.fieldPassword}</label>
            <input
              id="room-password"
              type="password"
              value={form.password}
              data-testid="entry-password"
              onChange={(event) => field('password', event.target.value)}
            />
          </div>
        ) : null}

        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            style={{ width: 18 }}
            checked={form.gifts_enabled}
            data-testid="entry-gifts"
            onChange={(event) => field('gifts_enabled', event.target.checked)}
          />
          <span>{s.fieldGifts}</span>
        </label>

        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            style={{ width: 18 }}
            checked={form.chat_enabled}
            data-testid="entry-chat"
            onChange={(event) => field('chat_enabled', event.target.checked)}
          />
          <span>{s.fieldChat}</span>
        </label>

        <button type="submit" className="btn btn-primary" disabled={busy} data-testid="entry-submit">
          {editId ? s.saveRoomBtn : t('createRoom') || s.createRoomBtn}
        </button>
      </form>

      {message ? (
        <p className="success-text" data-testid="entry-message">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="error-text" data-testid="entry-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}
