import { useEffect, useState } from 'react'
import { Flame, Loader2, Trophy, Users } from 'lucide-react'
import RoomCard from '../components/RoomCard'
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
    <div>
      <header>
        <h1 className="text-2xl font-black text-white">المعركة</h1>
        <p className="mt-1 text-xs text-slate-400">العب مع أصحابك داخل غرفة صوتية واربح النقاط</p>
      </header>

      <div className="relative mt-4 overflow-hidden rounded-3xl border border-amber-300/20 bg-gradient-to-l from-amber-500/20 via-fuchsia-600/15 to-transparent p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
          <Flame size={14} /> بطولة الأسبوع
        </p>
        <p className="mt-1.5 text-lg font-black text-white">اربح 5 معارك واحصل على 1000 عملة</p>
        <p className="mt-1 text-[11px] text-slate-300">ينتهي التحدي بعد 3 أيام</p>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold text-white">اختر لعبتك</h2>
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
                className={`rounded-2xl border p-3 text-right transition ${
                  active
                    ? 'border-fuchsia-400/60 bg-fuchsia-500/15'
                    : 'border-white/10 bg-white/[0.04] hover:border-white/25'
                }`}
              >
                <span
                  className="flex size-10 items-center justify-center rounded-xl text-base font-black"
                  style={{ backgroundColor: `${game.accent}22`, color: game.accent }}
                >
                  {game.name.charAt(0)}
                </span>
                <span className="mt-2 block text-sm font-bold text-white">{game.name}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
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
            <Trophy size={15} className="text-amber-400" />
            {activeGame ? `غرف ${activeGame.name}` : 'غرف المعركة الآن'}
          </h2>
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[11px] font-bold text-fuchsia-300"
            >
              إلغاء الفلتر
            </button>
          )}
        </div>

        {error && (
          <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-center text-xs text-red-200">
            {error}
          </p>
        )}

        {rooms === null && !error && (
          <p className="flex items-center justify-center gap-2 py-8 text-xs text-slate-400">
            <Loader2 size={14} className="animate-spin" /> جارٍ تحميل المعارك…
          </p>
        )}

        {rooms !== null && battleRooms.length === 0 && (
          <p className="rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-xs text-slate-400">
            لا توجد معارك مفتوحة الآن — أنشئ واحدة وابدأ التحدي.
          </p>
        )}

        <div className="space-y-2.5" data-testid="battle-rooms">
          {battleRooms.map((room) => (
            <RoomCard key={room.id} room={room} onOpen={onOpenRoom} />
          ))}
        </div>
      </section>
    </div>
  )
}
