import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n.jsx'

export default function ChatPanel({ messages, onSend, disabled, chatEnabled }) {
  const { t } = useI18n()
  const [text, setText] = useState('')

  const submit = (event) => {
    event.preventDefault()
    const value = text.trim()
    if (!value) return
    onSend(value)
    setText('')
  }

  return (
    <div className="card glass">
      <h3 className="section-title" style={{ marginTop: 0 }}>
        {t('messagePlaceholder')}
      </h3>
      <div className="chat-log" data-testid="chat-log">
        {messages.map((message) =>
          message.kind === 'system' ? (
            <div className="chat-system" key={message.id}>
              {message.text}
            </div>
          ) : (
            <div className="chat-item" key={message.id}>
              <div className={`chat-bubble${message.mine ? ' chat-bubble-mine' : ''}`}>
                <strong style={{ fontSize: 12, opacity: 0.85 }}>
                  {message.sender?.display_name || message.sender?.username || ''}
                </strong>
                <div>{message.text}</div>
              </div>
            </div>
          ),
        )}
      </div>
      <form className="composer" onSubmit={submit}>
        <input
          data-testid="chat-input"
          placeholder={t('messagePlaceholder')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={disabled || !chatEnabled}
        />
        <button type="submit" className="btn btn-primary" data-testid="chat-send" disabled={disabled || !chatEnabled}>
          {t('send')}
        </button>
      </form>
      {!chatEnabled ? <p className="notice">الدردشة معطلة في هذه الغرفة.</p> : null}
    </div>
  )
}
