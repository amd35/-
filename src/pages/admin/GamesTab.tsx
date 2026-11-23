import { useState } from 'react'
import { Clock3, Loader2, Save, ToggleLeft, ToggleRight } from 'lucide-react'
import { adminApi, type GameCatalogItem } from '../../lib/eventsApi'

function GameRow({
  game,
  onSaved,
}: {
  game: GameCatalogItem
  onSaved: () => void
}) {
  const [enabled, setEnabled] = useState(game.enabled)
  const [duration, setDuration] = useState(game.duration_seconds)
  const [rules, setRules] = useState(game.rules)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save(change: { enabled?: boolean; duration_seconds?: number; rules?: string }, message: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await adminApi.updateGame(game.key, change)
      setEnabled(updated.enabled)
      setDuration(updated.duration_seconds)
      setRules(updated.rules)
      setNotice(message)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر الحفظ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="glass rounded-2xl p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-white">{game.name}</p>
          <p className="mt-0.5 text-[10px] text-blush-200/55">{game.description}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => save({ enabled: !enabled }, enabled ? 'أُوقفت اللعبة' : 'فُعّلت اللعبة')}
          className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black disabled:opacity-50 ${
            enabled
              ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200'
              : 'border-white/15 bg-white/[0.06] text-blush-200/60'
          }`}
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : enabled ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
          {enabled ? 'متاحة' : 'موقوفة'}
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="flex items-center gap-1 text-[10px] font-bold text-blush-200/60">
          <Clock3 size={11} /> المدة
        </span>
        <input
          type="number"
          min={5}
          max={3600}
          value={duration}
          onChange={(event) => setDuration(Number(event.target.value))}
          className="w-20 rounded-lg border border-white/12 bg-white/[0.06] px-2 py-1 text-[11px] text-white focus:outline-none"
        />
        <span className="text-[10px] text-blush-200/45">ثانية</span>
      </div>

      <textarea
        value={rules}
        onChange={(event) => setRules(event.target.value)}
        rows={2}
        className="mt-2 w-full rounded-xl border border-white/12 bg-white/[0.06] px-2.5 py-2 text-[11px] text-white focus:outline-none"
        placeholder="قواعد اللعبة"
      />

      {error && <p className="mt-1 text-[10px] text-red-300">{error}</p>}
      {notice && <p className="mt-1 text-[10px] text-emerald-300">{notice}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={() =>
          save(
            { enabled, duration_seconds: Math.max(5, Number(duration) || 60), rules },
            'تم حفظ قواعد اللعبة',
          )
        }
        className="mt-2 flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[10px] font-bold text-gold disabled:opacity-50"
      >
        <Save size={10} /> حفظ القواعد والمدة
      </button>
    </li>
  )
}

export default function GamesTab({
  games,
  onRefresh,
}: {
  games: GameCatalogItem[]
  onRefresh: () => void
}) {
  return (
    <div>
      <p className="mb-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] leading-relaxed text-blush-200/55">
        الأدمن يحدد الألعاب المتاحة. إيقاف لعبة يمنع بدء مشاركات جديدة فيها فورًا،
        بينما تبقى نتائج المشاركات السابقة محفوظة.
      </p>
      <ul className="space-y-2">
        {games.map((game) => (
          <GameRow key={game.key} game={game} onSaved={onRefresh} />
        ))}
      </ul>
    </div>
  )
}
