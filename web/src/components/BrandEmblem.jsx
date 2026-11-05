import { useId } from 'react'

/**
 * شعار التطبيق (BrandEmblem) — مرسوم بالكود بـ SVG وليس صورة نقطية، لذلك يبقى حاداً
 * بكل المقاسات ويحمل هوية التطبيق نفسها: درع ذهبي بحدّ فاتح، وداخله سماعة مايك عنابية
 * (التطبيق غرف صوتية + ألعاب + هدايا). يحلّ محل الحروف المؤقتة «T» في الشريط العلوي
 * وصفحة الدخول، و«CP» في وسط شرائح الصفحة الرئيسية، والشعار في هيدر المحادثات.
 *
 * `size` رقم بالبكسل، أو `"100%"` ليملأ الصندوق الذي يحدّده CSS (`brand-mark`/`chats-logo`)
 * فتبقى أحجام الشاشات الصغيرة كما هي دون تعديل.
 */
export default function BrandEmblem({ size = 34, className = '' }) {
  const id = useId().replace(/:/g, '')
  const gold = `${id}-gold`
  const shine = `${id}-shine`

  return (
    <svg
      className={`brand-emblem${className ? ` ${className}` : ''}`}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      style={{ width: size, height: size, display: 'block' }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gold} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#ffeaa8" />
          <stop offset="45%" stopColor="#e6bb45" />
          <stop offset="100%" stopColor="#a8791b" />
        </linearGradient>
        <linearGradient id={shine} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.62)" />
          <stop offset="60%" stopColor="rgba(255, 255, 255, 0)" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${gold})`} />
      <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${shine})`} />
      <rect x="3" y="3" width="58" height="58" rx="17" fill="none" stroke="rgba(255, 246, 214, 0.8)" strokeWidth="2" />
      <g fill="none" stroke="#5a1220" strokeWidth="5" strokeLinecap="round">
        <path d="M19 33a13 13 0 0 0 26 0" />
        <path d="M32 46v7" />
        <path d="M24 53h16" />
      </g>
      <rect x="25" y="12" width="14" height="24" rx="7" fill="#5a1220" />
    </svg>
  )
}
