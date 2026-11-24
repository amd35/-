/** The four-leaf clover mark of «هدايا الحظ», drawn inline so it stays sharp. */
export function LuckyClover({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      fill="none"
    >
      <defs>
        <linearGradient id="lucky-leaf" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff6c9" />
          <stop offset="0.45" stopColor="#ffd24a" />
          <stop offset="1" stopColor="#b9821a" />
        </linearGradient>
      </defs>
      <g fill="url(#lucky-leaf)" stroke="#8a5c12" strokeWidth="1.4">
        <path d="M32 30c0-9-5-14-12-14-6 0-10 4-10 9 0 6 6 9 14 9h8z" />
        <path d="M32 30c0-9 5-14 12-14 6 0 10 4 10 9 0 6-6 9-14 9h-8z" />
        <path d="M32 34c0 9-5 14-12 14-6 0-10-4-10-9 0-6 6-9 14-9h8z" />
        <path d="M32 34c0 9 5 14 12 14 6 0 10-4 10-9 0-6-6-9-14-9h-8z" />
      </g>
      <path d="M32 30c0 6 1 12 3 18" stroke="#8a5c12" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="26" cy="22" r="3.2" fill="#fffbe8" opacity="0.75" />
    </svg>
  );
}
