import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field, Notice, PageHeader, PrimaryButton, inputClass } from '../components/ui'
import { api, type Game } from '../lib/api'

const CATEGORIES = ['ونسة', 'ألعاب', 'ترفيه', 'شعر', 'تعليم', 'ديني']

export default function AddItemPage() {
  const navigate = useNavigate()
  const [games, setGames] = useState<Game[]>([])
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [seats, setSeats] = useState(8)
  const [isBattle, setIsBattle] = useState(false)
  const [game, setGame] = useState<string>('ludo')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .games()
      .then(setGames)
      .catch(() => undefined)
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.createRoom({
        title: title.trim(),
        category,
        seats_total: seats,
        is_battle: isBattle,
        game: isBattle ? game : null,
      })
      navigate('/')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader title="إضافة غرفة" subtitle="أنشئ غرفة صوتية جديدة وابدأ بمشاركتها مع أصدقائك" />

      <form onSubmit={submit} className="space-y-3" data-testid="add-item-form">
        <Field label="اسم الغرفة">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="مثال: جلسة ونسة الليل"
            className={inputClass}
            name="title"
            required
            minLength={2}
          />
        </Field>

        <Field label="القسم">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={inputClass}
            name="category"
          >
            {CATEGORIES.map((item) => (
              <option key={item} value={item} className="bg-[#12101c]">
                {item}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`عدد المقاعد: ${seats}`}>
          <input
            type="range"
            min={2}
            max={12}
            value={seats}
            onChange={(event) => setSeats(Number(event.target.value))}
            className="w-full accent-fuchsia-500"
            name="seats"
          />
        </Field>

        <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <span className="text-xs font-bold text-white">غرفة معركة (لعبة)</span>
          <input
            type="checkbox"
            checked={isBattle}
            onChange={(event) => setIsBattle(event.target.checked)}
            className="size-5 accent-fuchsia-500"
            data-testid="battle-toggle"
          />
        </label>

        {isBattle && (
          <Field label="اللعبة">
            <select
              value={game}
              onChange={(event) => setGame(event.target.value)}
              className={inputClass}
              name="game"
            >
              {games.map((item) => (
                <option key={item.key} value={item.key} className="bg-[#12101c]">
                  {item.name} · {item.players} لاعب
                </option>
              ))}
            </select>
          </Field>
        )}

        {error && <Notice tone="rose">{error}</Notice>}

        <PrimaryButton type="submit" disabled={saving || title.trim().length < 2}>
          {saving ? 'جارٍ الحفظ…' : 'أنشئ الغرفة'}
        </PrimaryButton>
      </form>
    </div>
  )
}
