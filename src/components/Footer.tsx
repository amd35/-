import Icon from './Icon'
import { contact, nav, services } from '../data/content'
import './Footer.css'

const socials = [
  {
    label: 'إنستغرام',
    href: '#',
    path: 'M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm0 1.8a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm5-2.3a.95.95 0 1 1-1.9 0 .95.95 0 0 1 1.9 0ZM8.5 3.5h7A5 5 0 0 1 20.5 8.5v7a5 5 0 0 1-5 5h-7a5 5 0 0 1-5-5v-7a5 5 0 0 1 5-5Zm0 1.8a3.2 3.2 0 0 0-3.2 3.2v7a3.2 3.2 0 0 0 3.2 3.2h7a3.2 3.2 0 0 0 3.2-3.2v-7a3.2 3.2 0 0 0-3.2-3.2h-7Z',
  },
  {
    label: 'لينكدإن',
    href: '#',
    path: 'M4.8 3.4a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2ZM3.1 9.2h3.4v11.4H3.1V9.2Zm6 0h3.3v1.6c.6-1 1.8-1.9 3.6-1.9 2.6 0 4.3 1.7 4.3 4.8v6.9h-3.4v-6.2c0-1.5-.6-2.4-1.9-2.4-1.1 0-1.8.7-2.1 1.5-.1.3-.1.7-.1 1v6.1H9.1V9.2Z',
  },
  {
    label: 'إكس',
    href: '#',
    path: 'M17.6 3.5h3.1l-6.8 7.8 8 10.4h-6.2l-4.8-6.3-5.5 6.3H2.2l7.3-8.3-7.7-9.9h6.4l4.4 5.8 5-5.8Zm-1.1 16.3h1.7L7.4 5.2H5.6l10.9 14.6Z',
  },
]

export default function Footer() {
  return (
    <footer className="ftr">
      <div className="shell ftr__grid">
        <div className="ftr__brand">
          <a className="brand" href="#home" aria-label="نوفا — الصفحة الرئيسية">
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="30" height="30">
                <defs>
                  <linearGradient id="footerGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" />
                    <stop offset="100%" stopColor="#67e8f9" />
                  </linearGradient>
                </defs>
                <rect x="1.4" y="1.4" width="29.2" height="29.2" rx="9" stroke="url(#footerGrad)" strokeWidth="1.4" fill="none" />
                <path d="M10 22V10l12 12V10" stroke="url(#footerGrad)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </span>
            <span className="brand__text">
              <strong>نوفا</strong>
              <small>NOVA STUDIO</small>
            </span>
          </a>
          <p className="ftr__blurb">
            استوديو رقمي مستقل يصمّم الهويات والتجارب الرقمية للعلامات التي تريد أن تُرى.
          </p>
          <div className="ftr__social">
            {socials.map((item) => (
              <a key={item.label} href={item.href} aria-label={item.label} title={item.label}>
                <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
                  <path d={item.path} />
                </svg>
              </a>
            ))}
          </div>
        </div>

        <nav className="ftr__col" aria-label="روابط سريعة">
          <h4>روابط سريعة</h4>
          {nav.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ftr__col">
          <h4>خدماتنا</h4>
          {services.slice(0, 4).map((service) => (
            <a key={service.title} href="#services">
              {service.title}
            </a>
          ))}
        </div>

        <div className="ftr__col">
          <h4>تواصل معنا</h4>
          <a href={`tel:${contact.phone.replace(/\s/g, '')}`} dir="ltr">
            {contact.phone}
          </a>
          <a href={`mailto:${contact.email}`} dir="ltr">
            {contact.email}
          </a>
          <span className="ftr__muted">{contact.location}</span>
          <a className="ftr__cta" href="#booking">
            ابدأ مشروعك
            <Icon name="arrow" size={16} />
          </a>
        </div>
      </div>

      <div className="shell ftr__bottom">
        <span>© {new Date().getFullYear()} نوفا ستوديو — جميع الحقوق محفوظة.</span>
        <span className="ftr__made">
          صُمم وبُني في بغداد <span className="eyebrow__dot" />
        </span>
      </div>
    </footer>
  )
}
