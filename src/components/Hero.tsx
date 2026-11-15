import Icon from './Icon'
import { stats } from '../data/content'
import './Hero.css'

const bars = [38, 62, 48, 76, 58, 88, 72]

export default function Hero() {
  return (
    <section className="hero" id="home">
      <div className="shell hero__grid">
        <div className="hero__copy">
          <span className="eyebrow">
            <span className="eyebrow__dot" />
            استوديو رقمي مستقل — بغداد
          </span>

          <h1 className="hero__title">
            نصمّم تجارب رقمية
            <br />
            <span className="grad">تتقدّم على وقتها</span>
          </h1>

          <p className="hero__lead">
            هوية بصرية، واجهات، وتطوير مواقع — فريق واحد يجمع التصميم والهندسة لنقل فكرتك من الفكرة إلى
            منتج يعمل فعلًا.
          </p>

          <div className="hero__actions">
            <a className="btn btn--primary" href="#booking">
              ابدأ مشروعك
              <Icon name="arrow" size={18} className="btn__icon" />
            </a>
            <a className="btn btn--ghost" href="#services">
              استكشف خدماتنا
            </a>
          </div>

          <dl className="hero__stats">
            {stats.map((item) => (
              <div className="hero__stat" key={item.label}>
                <dt className="hero__stat-value">{item.value}</dt>
                <dd className="hero__stat-label">{item.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="hero__visual" aria-hidden="true">
          <div className="hero__glow" />

          <div className="shot card">
            <div className="shot__top">
              <span className="shot__dots">
                <i />
                <i />
                <i />
              </span>
              <span className="shot__title">لوحة النمو</span>
              <span className="shot__pill">مباشر</span>
            </div>

            <div className="shot__body">
              <div className="shot__ring">
                <span className="shot__ring-value">92</span>
                <span className="shot__ring-label">جودة الواجهة</span>
              </div>

              <div className="shot__bars">
                {bars.map((height, index) => (
                  <span
                    key={index}
                    className={`shot__bar${index === bars.length - 2 ? ' is-hot' : ''}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>

            <div className="shot__foot">
              <span>زيارات هذا الشهر</span>
              <strong>+38%</strong>
            </div>
          </div>

          <div className="float float--a card">
            <span className="float__icon">
              <Icon name="spark" size={16} />
            </span>
            <div>
              <strong>هوية جديدة</strong>
              <small>جاهزة للتسليم</small>
            </div>
          </div>

          <div className="float float--b card">
            <span className="float__icon float__icon--cyan">
              <Icon name="shield" size={16} />
            </span>
            <div>
              <strong>+98%</strong>
              <small>رضا العملاء</small>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
