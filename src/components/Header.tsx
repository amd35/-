import { useEffect, useState } from 'react'
import Icon from './Icon'
import { nav } from '../data/content'
import './Header.css'

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('#home')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const sections = nav
      .map((item) => document.querySelector(item.href))
      .filter((node): node is Element => Boolean(node))

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActive(`#${visible.target.id}`)
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: [0, 0.25, 0.6] },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  return (
    <header className={`hdr${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}`}>
      <div className="shell hdr__bar">
        <a className="brand" href="#home" onClick={() => setOpen(false)} aria-label="نوفا — الصفحة الرئيسية">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="30" height="30">
              <defs>
                <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" />
                  <stop offset="100%" stopColor="#67e8f9" />
                </linearGradient>
              </defs>
              <rect x="1.4" y="1.4" width="29.2" height="29.2" rx="9" fill="url(#brandGrad)" opacity="0.16" />
              <rect x="1.4" y="1.4" width="29.2" height="29.2" rx="9" stroke="url(#brandGrad)" strokeWidth="1.4" fill="none" />
              <path d="M10 22V10l12 12V10" stroke="url(#brandGrad)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
          </span>
          <span className="brand__text">
            <strong>نوفا</strong>
            <small>NOVA STUDIO</small>
          </span>
        </a>

        <nav className="hdr__nav" aria-label="التنقل الرئيسي">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`hdr__link${active === item.href ? ' is-active' : ''}`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hdr__actions">
          <a className="btn btn--primary hdr__cta" href="#booking">
            ابدأ مشروعك
            <Icon name="arrow" size={18} className="btn__icon" />
          </a>
          <button
            type="button"
            className="hdr__burger"
            aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name={open ? 'close' : 'menu'} size={22} />
          </button>
        </div>
      </div>

      <div id="mobile-menu" className="hdr__panel" hidden={!open}>
        <nav className="hdr__panel-nav" aria-label="التنقل للجوال">
          {nav.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
              <span>{item.label}</span>
              <Icon name="arrow" size={16} />
            </a>
          ))}
        </nav>
        <a className="btn btn--primary hdr__panel-cta" href="#booking" onClick={() => setOpen(false)}>
          ابدأ مشروعك
          <Icon name="arrow" size={18} className="btn__icon" />
        </a>
        <p className="hdr__panel-note">بغداد — نعمل مع عملاء في كل العراق والخليج</p>
      </div>
    </header>
  )
}
