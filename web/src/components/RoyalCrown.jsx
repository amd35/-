import { useId } from 'react'

/**
 * تاج رويال ثلاثي الأبعاد لكل مستوى (SVG، بلا صور من إنشاء الذكاء الاصطناعي).
 *
 * اللون يأتي من الخادم (`accent` = لون المعدن/الوهج، `jewel` = لون الحجر)،
 * أما الشكل (عدد الرؤوس، عرض الإطار، الأجرام والجواهر) فيختلف بحسب المستوى:
 * 1) تاج بسيط، 2) تاج فضي بأربعة رؤوس، 3) تاج مقوّس بخمسة رؤوس،
 * 4) تاج عالٍ بأجرام، 5) التاج الملكي الذهبي.
 */
const LEVEL_DESIGNS = {
  1: { spikes: [[32, 36], [60, 26], [88, 36]], valley: 54, bandTop: 62, gems: [{ x: 60, y: 74, r: 5, shape: 'round' }], orbs: false, dark: '#1d6b5f' },
  2: {
    spikes: [[22, 42], [47, 22], [73, 22], [98, 42]],
    valley: 52,
    bandTop: 60,
    gems: [{ x: 34, y: 72, r: 4, shape: 'round' }, { x: 60, y: 70, r: 5.5, shape: 'round' }, { x: 86, y: 72, r: 4, shape: 'round' }],
    orbs: false,
    dark: '#265a86',
  },
  3: {
    spikes: [[18, 44], [40, 20], [60, 12], [80, 20], [102, 44]],
    valley: 50,
    bandTop: 58,
    gems: [{ x: 30, y: 72, r: 4, shape: 'round' }, { x: 60, y: 70, r: 6.5, shape: 'oval' }, { x: 90, y: 72, r: 4, shape: 'round' }],
    orbs: false,
    dark: '#42277f',
  },
  4: {
    spikes: [[20, 26], [42, 10], [78, 10], [100, 26]],
    valley: 50,
    bandTop: 58,
    gems: [{ x: 32, y: 71, r: 4.5, shape: 'round' }, { x: 60, y: 69, r: 6, shape: 'oval' }, { x: 88, y: 71, r: 4.5, shape: 'round' }],
    orbs: true,
    dark: '#8d2334',
  },
  5: {
    spikes: [[14, 32], [33, 14], [60, 6], [87, 14], [106, 32]],
    valley: 48,
    bandTop: 56,
    gems: [
      { x: 26, y: 70, r: 4.5, shape: 'round' },
      { x: 60, y: 68, r: 7, shape: 'oval' },
      { x: 94, y: 70, r: 4.5, shape: 'round' },
    ],
    orbs: true,
    dark: '#8a5c0d',
  },
}

const BAND_BOTTOM = 84

/** يرسم حافة التاج: من الركن الأيسر إلى أول رأس ثم وديان بين الرؤوس. */
function silhouette(spikes, valley, bandTop) {
  const parts = [`M 12 ${bandTop}`]
  spikes.forEach(([x, tip], index) => {
    if (index > 0) {
      const [previousX] = spikes[index - 1]
      parts.push(`L ${(previousX + x) / 2} ${valley}`)
    }
    parts.push(`L ${x} ${tip}`)
  })
  parts.push(`L 108 ${bandTop}`)
  parts.push(`L 108 ${BAND_BOTTOM}`)
  parts.push(`Q 60 ${BAND_BOTTOM + 4} 12 ${BAND_BOTTOM}`)
  parts.push('Z')
  return parts.join(' ')
}

export default function RoyalCrown({ level = 1, accent = '#f4cc44', jewel = '#45d2ba', size = 150 }) {
  const raw = useId()
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, '')
  const design = LEVEL_DESIGNS[level] || LEVEL_DESIGNS[1]
  const metal = `metal-${uid}`
  const sheen = `sheen-${uid}`
  const jewelFill = `jewel-${uid}`
  const shadow = `shadow-${uid}`

  return (
    <svg
      className="royal-crown-art"
      viewBox="0 0 120 100"
      width={size}
      height={Math.round((size * 100) / 120)}
      role="img"
      aria-label={`royal-crown-${level}`}
    >
      <defs>
        {/* معدن التاج: لمعة علوية ثم لون المستوى ثم الظل السفلي (عمق ثلاثي الأبعاد) */}
        <linearGradient id={metal} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.92" />
          <stop offset="28%" stopColor={accent} />
          <stop offset="72%" stopColor={accent} />
          <stop offset="100%" stopColor={design.dark} />
        </linearGradient>
        <linearGradient id={sheen} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={jewelFill} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="45%" stopColor={jewel} />
          <stop offset="100%" stopColor="#131a2a" stopOpacity="0.85" />
        </radialGradient>
        <filter id={shadow} x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#04140f" floodOpacity="0.65" />
        </filter>
      </defs>

      <g filter={`url(#${shadow})`}>
        <path
          d={silhouette(design.spikes, design.valley, design.bandTop)}
          fill={`url(#${metal})`}
          stroke={design.dark}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {/* حافة علوية مضيئة تعطي إحساس الخامات */}
        <path
          d={silhouette(design.spikes, design.valley, design.bandTop)}
          fill={`url(#${sheen})`}
          stroke="rgba(255, 255, 255, 0.7)"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        {/* شريط داخلي أغمق يفصل الإطار عن الرؤوس (عمق) */}
        <rect x="14" y={design.bandTop} width="92" height="9" rx="4" fill="rgba(6, 26, 22, 0.4)" />
        <rect x="14" y={design.bandTop} width="92" height="3" rx="1.5" fill="rgba(255, 255, 255, 0.45)" />

        {/* أجرام ذهبية على رؤوس المستويين الرابع والخامس */}
        {design.orbs
          ? design.spikes.map(([x, tip]) => (
              <circle key={`orb-${x}`} cx={x} cy={tip - 3} r="4.6" fill={`url(#${jewelFill})`} stroke="rgba(255, 255, 255, 0.75)" strokeWidth="1" />
            ))
          : null}

        {/* جواهر الإطار */}
        {design.gems.map((gem) => (
          <ellipse
            key={`gem-${gem.x}`}
            cx={gem.x}
            cy={gem.y}
            rx={gem.shape === 'oval' ? gem.r * 0.8 : gem.r}
            ry={gem.r}
            fill={`url(#${jewelFill})`}
            stroke="rgba(255, 255, 255, 0.8)"
            strokeWidth="1"
          />
        ))}
      </g>
    </svg>
  )
}
