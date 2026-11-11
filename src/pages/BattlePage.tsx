import { useEffect, useState } from 'react'
import { Flame, Loader2, Sparkles, Trophy, Users } from 'lucide-react'
import PageBackdrop from '../components/PageBackdrop'
import RoomCard from '../components/RoomCard'
import { EmptyState, PageHeader, SectionTitle } from '../components/ui'
import { api, type Game, type Room } from '../lib/api'

export default function BattlePage({ onOpenRoom }: { onOpenRoom: (room: Room) => void }) {
  const [games, setGames] = useState<Game[]>([])
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([api.games(), api.rooms(true)])
      .then(([gameList, roomList]) => {
        if (!active) return
        setGames(gameList)
        setRooms(roomList)
      })
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [])

  const battleRooms = (rooms ?? []).filter((room) => !selected || room.game === selected)
  const activeGame = games.find((game) => game.key === selected)

  return (
    <PageBackdrop photo="petals">
      <PageHeader
        eyebrow="ساحة التحدي"
        title="المعركة"
        subtitle="العب مع أصحابك داخل غرفة صوتية واربح النقاط"
      />

      <div className="glass-deep relative overflow-hidden rounded-[1.75rem] border-amber-300/25 p-4">
        <span className="animate-romance-float pointer-events-none absolute -top-8 right-4 size-24 rounded-full bg-amber-300/20 blur-2xl" />
        <div className="relative">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
            <Flame size={14} /> بطولة الأسبوع
          </p>
          <p className="font-display mt-1.5 text-xl leading-snug font-bold text-white">
            اربح 5 معارك واحصل على 1000 عملة
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-blush-200/60">
            <Sparkles size={11} className="text-amber-200/80" /> ينتهي التحدي بعد 3 أيام
          </p>
        </div>
      </div>

      <section className="mt-6">
        <SectionTitle hint={`${games.length} لعبة`}>اختر لعبتك</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          {games.map((game) => {
            const active = selected === game.key
            return (
              <button
                key={game.key}
                type="button"
                data-testid={`game-${game.key}`}
                onClick={() => setSelected(active ? null : game.key)}
                aria-pressed={active}
                className={`rounded-3xl border p-3 text-right backdrop-blur-md transition ${
                  active
                    ? 'border-fuchsia-300/50 bg-gradient-to-br from-fuchsia-500/25 to-rose-500/10 shadow-[0_10px_30px_-14px_rgba(236,72,153,0.9)]'
                    : 'border-white/10 bg-white/[0.06] hover:border-white/25'
                }`}
              >
                <span
                  className="flex size-10 items-center justify-center rounded-2xl text-base font-black"
                  style={{ backgroundColor: `${game.accent}22`, color: game.accent }}
                >
                  {game.name.charAt(0)}
                </span>
                <span className="mt-2 block text-sm font-bold text-white">{game.name}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-blush-200/60">
                  <Users size={11} /> {game.players} لاعب
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-white">
            <Trophy size={15} className="text-amber-300" />
            {activeGame ? `غرف ${activeGame.name}` : 'غرف المعركة الآن'}
          </h2>
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[11px] font-bold text-blush-200"
            >
              إلغاء الفلتر
            </button>
          )}
        </div>

        {error && (
          <p className="rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-center text-xs text-red-200 backdrop-blur">
            {error}
          </p>
        )}

        {rooms === null && !error && (
          <p className="flex items-center justify-center gap-2 py-8 text-xs text-blush-200/50">
            <Loader2 size={14} className="animate-spin" /> جارٍ تحميل المعارك…
          </p>
        )}

        {rooms !== null && battleRooms.length === 0 && (
          <EmptyState>لا توجد معارك مفتوحة الآن — أنشئ واحدة وابدأ التحدي.</EmptyState>
        )}

        <div className="space-y-2.5" data-testid="battle-rooms">
          {battleRooms.map((room) => (
            <RoomCard key={room.id} room={room} onOpen={onOpenRoom} />
          ))}
        </div>
      </section>
    </PageBackdrop>
  )
}
