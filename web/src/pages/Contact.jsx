import { useState } from 'react'
import PageBar from '../components/PageBar.jsx'
import { api } from '../lib/api.js'
import { useRemote } from '../lib/hooks.js'
import { usePageText } from '../lib/pageText.js'

const TOPICS = ['general', 'bug', 'payment', 'abuse', 'suggestion']

/** Sends a support request to the team; the request is stored and delivered in-app. */
export default function Contact() {
  const s = usePageText()
  const [form, setForm] = useState({ topic: 'general', subject: '', body: '', contact: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const { data, error: loadError, loading, reload } = useRemote(() => api.get('/api/support/mine'))

  const topicLabels = {
    general: s.topicGeneral,
    bug: s.topicBug,
    payment: s.topicPayment,
    abuse: s.topicAbuse,
    suggestion: s.topicSuggestion,
  }

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api.post('/api/support', {
        topic: form.topic,
        subject: form.subject.trim(),
        body: form.body.trim(),
        contact: form.contact.trim(),
      })
      setMessage(s.requestSent)
      setForm({ topic: 'general', subject: '', body: '', contact: '' })
      await reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const requests = data?.messages || []

  return (
    <div data-testid="contact-page">
      <PageBar title={s.contact} back="/help" testId="contact" />

      <p className="muted" style={{ margin: '0 2px 12px' }}>
        {s.contactSub}
      </p>

      <form className="card glass stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="support-topic">{s.topic}</label>
          <select
            id="support-topic"
            value={form.topic}
            data-testid="contact-topic"
            onChange={(event) => setForm({ ...form, topic: event.target.value })}
          >
            {TOPICS.map((key) => (
              <option key={key} value={key}>
                {topicLabels[key]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="support-subject">{s.subject}</label>
          <input
            id="support-subject"
            required
            minLength={2}
            maxLength={120}
            value={form.subject}
            data-testid="contact-subject"
            onChange={(event) => setForm({ ...form, subject: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="support-body">{s.body}</label>
          <textarea
            id="support-body"
            required
            minLength={5}
            maxLength={2000}
            rows="5"
            value={form.body}
            data-testid="contact-body"
            onChange={(event) => setForm({ ...form, body: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="support-contact">{s.contactField}</label>
          <input
            id="support-contact"
            maxLength={120}
            value={form.contact}
            data-testid="contact-extra"
            onChange={(event) => setForm({ ...form, contact: event.target.value })}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy} data-testid="contact-submit">
          {s.sendRequest}
        </button>
        <p className="muted" style={{ margin: 0 }}>
          {s.supportNoMail}
        </p>
      </form>

      {message ? (
        <p className="success-text" data-testid="contact-message">
          {message}
        </p>
      ) : null}
      {error || loadError ? <p className="error-text">{error || loadError}</p> : null}

      <h2 className="section-title">{s.myRequests}</h2>
      <div className="card glass">
        {loading && !data ? <p className="muted">{s.loading}</p> : null}
        {data && requests.length === 0 ? <p className="muted">{s.noRequests}</p> : null}
        {requests.map((request) => (
          <div className="list-item" key={request.id} data-testid="support-row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{request.subject}</strong>
              <div className="muted">{request.body}</div>
              <div className="muted">
                {topicLabels[request.topic] || request.topic} ·{' '}
                {new Date(request.created_at).toLocaleString('en')}
              </div>
            </div>
            <span className={`status-pill status-${request.status === 'open' ? 'pending' : 'paid'}`}>
              {request.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
