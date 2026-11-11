import { useState } from 'react'
import { Mail, MessageSquare, Send, User } from 'lucide-react'
import { Card, Field, Notice, PageHeader, PrimaryButton, inputClass } from '../components/ui'
import { api } from '../lib/api'

export default function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSending(true)
    setError(null)
    try {
      await api.contact({ name: name.trim(), email: email.trim(), message: message.trim() })
      setSent(true)
      setName('')
      setEmail('')
      setMessage('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <PageHeader title="اتصل بنا" subtitle="أرسل ملاحظة أو طلب دعم وسنعود إليك" />

      {sent && (
        <div className="mb-3">
          <Notice>تم إرسال رسالتك — شكرًا لتواصلك، سنراجعها قريبًا.</Notice>
        </div>
      )}

      <form onSubmit={submit} className="space-y-3" data-testid="contact-form">
        <Field label="الاسم">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
            <User size={15} className="text-slate-500" />
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              placeholder="اسمك"
              className="w-full bg-transparent py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
          </div>
        </Field>

        <Field label="البريد الإلكتروني">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3">
            <Mail size={15} className="text-slate-500" />
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="name@example.com"
              className="w-full bg-transparent py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
              dir="ltr"
            />
          </div>
        </Field>

        <Field label="الرسالة">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
            minLength={3}
            rows={4}
            placeholder="اكتب تفاصيل طلبك…"
            className={inputClass}
          />
        </Field>

        {error && <Notice tone="rose">{error}</Notice>}

        <PrimaryButton type="submit" disabled={sending}>
          <span className="inline-flex items-center justify-center gap-2">
            <Send size={15} /> {sending ? 'جارٍ الإرسال…' : 'إرسال الرسالة'}
          </span>
        </PrimaryButton>
      </form>

      <Card className="mt-4 flex items-start gap-2.5">
        <MessageSquare size={15} className="mt-0.5 shrink-0 text-fuchsia-300" />
        <p className="text-[11px] leading-relaxed text-slate-400">
          متوسط وقت الرد يوم عمل واحد. للحالات العاجلة داخل الغرف استخدم زر الإبلاغ.
        </p>
      </Card>
    </div>
  )
}
