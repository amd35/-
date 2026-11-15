import { useState } from 'react'
import Icon from './Icon'
import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import { faqs } from '../data/content'
import './Faq.css'

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section className="section faq" id="faq">
      <div className="shell faq__grid">
        <SectionHeading
          eyebrow="الأسئلة الشائعة"
          title={
            <>
              أسئلة يسألها <span className="grad">كل عميل</span>
            </>
          }
          text="لم تجد سؤالك؟ أرسله لنا عبر النموذج وسنجيبك خلال يوم عمل واحد."
        />

        <div className="faq__list">
          {faqs.map((item, index) => {
            const isOpen = openIndex === index
            return (
              <Reveal key={item.q} delay={index * 60}>
                <div className={`faq__item${isOpen ? ' is-open' : ''}`}>
                  <h3>
                    <button
                      type="button"
                      className="faq__question"
                      aria-expanded={isOpen}
                      aria-controls={`faq-panel-${index}`}
                      onClick={() => setOpenIndex(isOpen ? null : index)}
                    >
                      <span>{item.q}</span>
                      <span className="faq__toggle">
                        <Icon name="plus" size={16} />
                      </span>
                    </button>
                  </h3>
                  <div className="faq__panel" id={`faq-panel-${index}`} hidden={!isOpen}>
                    <p>{item.a}</p>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
