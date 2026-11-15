import Icon from './Icon'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import { services } from '../data/content'
import './Services.css'

export default function Services() {
  return (
    <section className="section services" id="services">
      <div className="shell">
        <SectionHeading
          eyebrow="خدماتنا"
          title={
            <>
              كل ما تحتاجه علامتك <span className="grad">تحت سقف واحد</span>
            </>
          }
          text="نبدأ من الاستراتيجية وننتهي بكود نظيف وتصميم قابل للتوسّع — بدون تنسيق بين عدة جهات."
        />

        <div className="services__grid">
          {services.map((service, index) => (
            <Reveal key={service.title} delay={index * 70}>
              <article className="service card">
                <div className="service__head">
                  <span className="service__icon">
                    <Icon name={service.icon} size={22} />
                  </span>
                  <span className="service__tag">{service.tag}</span>
                </div>
                <h3 className="service__title">{service.title}</h3>
                <p className="service__body">{service.body}</p>
                <span className="service__line" aria-hidden="true" />
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
