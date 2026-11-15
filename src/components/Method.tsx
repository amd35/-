import Reveal from './Reveal'
import SectionHeading from './SectionHeading'
import { steps } from '../data/content'
import './Method.css'

export default function Method() {
  return (
    <section className="section method" id="method">
      <div className="shell method__grid">
        <div className="method__side">
          <SectionHeading
            eyebrow="منهجيتنا"
            title={
              <>
                أربع خطوات واضحة، <span className="grad">بلا مفاجآت</span>
              </>
            }
            text="نعمل بمراحل قصيرة ومراجعات ثابتة، فتعرف دائمًا أين وصل مشروعك وما الخطوة القادمة."
          />

          <Reveal delay={120}>
            <div className="method__note card">
              <strong>تسليم أسبوعي</strong>
              <p>كل أسبوع يصلك تحديث مرئي قابل للتجربة، لا تقارير فقط.</p>
            </div>
          </Reveal>
        </div>

        <ol className="method__list">
          {steps.map((step, index) => (
            <Reveal key={step.title} delay={index * 90}>
              <li className="method__item">
                <span className="method__num">{String(index + 1).padStart(2, '0')}</span>
                <div className="method__content">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}
