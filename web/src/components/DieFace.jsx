import { pipsFor } from '../lib/pips.js'

/** نرد واقعي يُظهر القيمة التي رمّاها الخادم. */
export default function DieFace({ value, size = 42 }) {
  return (
    <span
      className="game-die"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`النرد ${value}`}
      data-testid="ludo-die"
      data-value={value}
    >
      {pipsFor(value).map((on, index) => (
        <span key={index} className={on ? 'game-die-pip game-die-pip-on' : 'game-die-pip'} />
      ))}
    </span>
  )
}
