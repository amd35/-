import { useState, type FormEvent } from 'react'
import Icon from './Icon'
import Reveal from './Reveal'
import { contact, serviceOptions } from '../data/content'
import './Booking.css'

type Errors = { name?: string; phone?: string }

export default function Booking() {
  const [form, setForm] = useState({ name: '', phone: '', service: serviceOptions[0], message: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [sent, setSent] = useState(false)

  const update = (field: keyof typeof form) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const next: Errors = {}
    if (form.name.trim().length < 2) next.name = 'اكتب اسمك الكامل من فضلك.'
    if (!/[+\d][\d\s-]{6,}/.test(form.phone.trim())) next.phone = 'رقم هاتف غير واضح — مثال: 0780 000 0000.'

    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSent(true)
  }

  const reset = () => {
    setForm({ name: '', phone: '', service: serviceOptions[0], message: '' })
    setErrors({})
    setSent(false)
  }

  return (
    <section className="section booking" id="booking">
      <div className="shell booking__grid">
        <div className="booking__intro">
          <Reveal>
            <span className="eyebrow">
              <span className="eyebrow__dot" />
              لنبدأ الحديث
            </span>
            <h2 className="booking__title">
              أخبرنا عن فكرتك، <br />
              <span className="grad">ونعود إليك خلال 24 ساعة</span>
            </h2>
            <p className="booking__lead">
              جلسة أولى مجانية مدتها 30 دقيقة نحدد فيها نطاق العمل والجدول الزمني والتكلفة التقديرية.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <ul className="booking__list">
              <li>
                <span className="booking__ico">
                  <Icon name="phone" size={17} />
                </span>
                <span>
                  <small>الهاتف / واتساب</small>
                  <strong dir="ltr">{contact.phone}</strong>
                </span>
              </li>
              <li>
                <span className="booking__ico">
                  <Icon name="mail" size={17} />
                </span>
                <span>
                  <small>البريد الإلكتروني</small>
                  <strong dir="ltr">{contact.email}</strong>
                </span>
              </li>
              <li>
                <span className="booking__ico">
                  <Icon name="pin" size={17} />
                </span>
                <span>
                  <small>الموقع</small>
                  <strong>{contact.location}</strong>
                </span>
              </li>
              <li>
                <span className="booking__ico">
                  <Icon name="clock" size={17} />
                </span>
                <span>
                  <small>أوقات العمل</small>
                  <strong>{contact.hours}</strong>
                </span>
              </li>
            </ul>
          </Reveal>
        </div>

        <Reveal delay={80} className="booking__card-wrap">
          <div className="booking__card card">
            {sent ? (
              <div className="booking__done" role="status">
                <span className="booking__done-icon">
                  <Icon name="check" size={26} />
                </span>
                <h3>تم استلام طلبك</h3>
                <p>
                  شكرًا {form.name.split(' ')[0]} — وصلنا طلبك بخصوص «{form.service}» وسنتواصل معك على{' '}
                  <span dir="ltr">{form.phone}</span> خلال 24 ساعة.
                </p>
                <button type="button" className="btn btn--ghost" onClick={reset}>
                  إرسال طلب آخر
                </button>
              </div>
            ) : (
              <form className="booking__form" onSubmit={handleSubmit} noValidate>
                <div className="field">
                  <label htmlFor="name">الاسم الكامل</label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    placeholder="مثال: علي حسين"
                    value={form.name}
                    onChange={(event) => update('name')(event.target.value)}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'name-error' : undefined}
                  />
                  {errors.name ? (
                    <span className="field__error" id="name-error" role="alert">
                      {errors.name}
                    </span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="phone">رقم الهاتف</label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    placeholder="0780 000 0000"
                    value={form.phone}
                    onChange={(event) => update('phone')(event.target.value)}
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby={errors.phone ? 'phone-error' : undefined}
                  />
                  {errors.phone ? (
                    <span className="field__error" id="phone-error" role="alert">
                      {errors.phone}
                    </span>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="service">الخدمة المطلوبة</label>
                  <select
                    id="service"
                    name="service"
                    value={form.service}
                    onChange={(event) => update('service')(event.target.value)}
                  >
                    {serviceOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="message">تفاصيل المشروع (اختياري)</label>
                  <textarea
                    id="message"
                    name="message"
                    rows={3}
                    placeholder="أخبرنا عن هدفك، جمهورك، والموعد الذي تحتاجه."
                    value={form.message}
                    onChange={(event) => update('message')(event.target.value)}
                  />
                </div>

                <button className="btn btn--primary booking__submit" type="submit">
                  أرسل الطلب
                  <Icon name="arrow" size={18} className="btn__icon" />
                </button>
                <p className="booking__hint">بياناتك تُستخدم للتواصل بخصوص مشروعك فقط.</p>
              </form>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
