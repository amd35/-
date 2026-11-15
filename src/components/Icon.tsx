const paths: Record<string, JSX.Element> = {
  spark: (
    <>
      <path d="M12 3v4M12 17v4M5.5 5.5l2.8 2.8M15.7 15.7l2.8 2.8M3 12h4M17 12h4M5.5 18.5l2.8-2.8M15.7 8.3l2.8-2.8" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 3.5 7.5 12 12l8.5-4.5L12 3Z" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5" />
      <path d="m3.5 17 8.5 4.5 8.5-4.5" />
    </>
  ),
  code: (
    <>
      <path d="m9 8-4 4 4 4M15 8l4 4-4 4" />
      <path d="M13 5 11 19" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
      <path d="M10.5 5.5h3M11 18.5h2" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16v-4M12.5 16V8M17 16v-6" />
    </>
  ),
  play: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="3" />
      <path d="m10.5 9.5 4.5 2.7-4.5 2.7V9.5Z" />
    </>
  ),
  arrow: <path d="M19 12H5M11 6l-6 6 6 6" />,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7.5 3v6c0 4.4-3.1 7.9-7.5 9-4.4-1.1-7.5-4.6-7.5-9V6L12 3Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
}

export type IconName = keyof typeof paths

export default function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  )
}
