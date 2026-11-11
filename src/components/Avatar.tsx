export default function Avatar({
  name,
  size = 44,
  online,
}: {
  name: string
  size?: number
  online?: boolean
}) {
  const hue = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span
        className="flex h-full w-full items-center justify-center rounded-full font-bold text-white ring-1 ring-white/20"
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 75% 55%), hsl(${(hue + 55) % 360} 80% 42%))`,
          fontSize: size * 0.4,
        }}
      >
        {name.trim().charAt(0)}
      </span>
      {online !== undefined && (
        <span
          className={`absolute -bottom-0.5 -left-0.5 size-3 rounded-full border-2 border-[#0a0613] ${
            online ? 'bg-emerald-400' : 'bg-slate-500'
          }`}
        />
      )}
    </span>
  )
}
