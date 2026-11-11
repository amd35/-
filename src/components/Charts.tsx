export function BarList({
  data,
  color = '#d946ef',
}: {
  data: { label: string; value: number }[]
  color?: string
}) {
  const max = Math.max(...data.map((item) => item.value), 1)
  return (
    <ul className="space-y-2.5">
      {data.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="truncate text-slate-300">{item.label}</span>
            <span className="font-bold text-slate-400">{item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(item.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function SparkBars({
  data,
  color = '#34d399',
}: {
  data: { label: string; value: number }[]
  color?: string
}) {
  const max = Math.max(...data.map((item) => item.value), 1)
  return (
    <div className="flex h-32 items-end gap-2">
      {data.map((item) => (
        <div key={item.label} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-400">{item.value}</span>
          <div
            className="w-full rounded-t-lg transition-all"
            style={{
              height: `${Math.max((item.value / max) * 88, 6)}px`,
              backgroundColor: color,
              opacity: 0.85,
            }}
          />
          <span className="text-[9px] text-slate-500">{item.label.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}
