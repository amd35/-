import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import { testimonials } from '../data/content'
import './Testimonials.css'

export default function Testimonials() {
  return (
    <section className="section testimonials" id="testimonials">
      <div className="shell">
        <SectionHeading
          align="center"
          eyebrow="آراء العملاء"
          title={
            <>
              ثقة تُبنى بالنتائج، <span className="grad">لا بالكلام</span>
            </>
          }
        />

        <div className="testimonials__grid">
          {testimonials.map((item, index) => (
            <Reveal key={item.name} delay={index * 80}>
              <figure className="quote card">
                <div className="quote__stars" aria-label="تقييم خمس نجوم">
                  {Array.from({ length: 5 }).map((_, star) => (
                    <svg key={star} viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
                      <path
                        d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5L2.5 9.5l6.6-.9 2.9-6Z"
                        fill="currentColor"
                      />
                    </svg>
                  ))}
                </div>
                <blockquote className="quote__text">«{item.quote}»</blockquote>
                <figcaption className="quote__author">
                  <span className="quote__avatar">{item.initials}</span>
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.role}</small>
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
