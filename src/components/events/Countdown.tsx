import { useEffect, useState } from 'react'
import { Clock3 } from 'lucide-react'
import { remainingMs } from '../../lib/eventFormat'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function parts(target: string) {
  const total = remainingMs(target)
  return {
    total,
    days: Math.floor(total / 86_400_000),
    hours: Math.floor((total % 86_400_000) / 3_600_000),
    minutes: Math.floor((total % 3_600_000) / 60_000),
    seconds: Math.floor((total % 60_000) / 1000),
  }
}

export default function Countdown({
  target,
  prefix,
  compact,
}: {
  target: string
  prefix?: string
  compact?: boolean
}) {
  const [left, setLeft] = useState(() => parts(target))

  useEffect(() => {
    setLeft(parts(target))
    const timer = setInterval(() => setLeft(parts(target)), 1000)
    return () => clearInterval(timer)
  }, [target])

  if (left.total <= 0) {
    return (
      <span className={`inline-flex items-center gap-1 ${compact ? 'text-[10px]' : 'text-xs'} font-bold text-blush-200/60`}>
        <Clock3 size={compact ? 10 : 12} /> انتهى الوقت
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center gap-1 tabular-nums ${compact ? 'text-[10px]' : 'text-xs'} font-black text-amber-200`}
    >
      <Clock3 size={compact ? 10 : 12} />
      {prefix ? `${prefix} ` : ''}
      {left.days > 0 ? `${left.days} يوم ` : ''}
      {pad(left.hours)}:{pad(left.minutes)}:{pad(left.seconds)}
    </span>
  )
}
