import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gamepad2, Headphones, Play, Sparkles, Trophy, Users } from 'lucide-react'
import Avatar from '../components/Avatar'
import BottomNav from '../components/BottomNav'
import RoomOverlay from '../components/RoomOverlay'
import { Screen, ScreenHeader, SectionHead } from '../components/Screen'
import { api, type Game, type Room } from '../lib/api'

const MORE_GAMES = [
  { label: 'شطرنج', emoji: '♟️' },
  { label: 'ورق', emoji: '🃏' },
  { label: 'سلوتس', emoji: '🎰' },
  { label: 'فقاعات', emoji: '🫧' },
]

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([])
  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [openRoom, setOpenRoom] = useState<Room | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
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

  const primary = games.slice(0, 2)
  const battleRooms = (rooms ?? []).filter((room) => !selected || room.game === selected)

  function play(game: Game) {
    const room = (rooms ?? []).find((item) => item.game === game.key)
    if (room) {
      setOpenRoom(room)
      return
    }
    setSelected(game.key)
    setNotice(`لا توجد غرفة ${game.name} مفتوحة الآن — أنشئ غرفة معركة وابدأ اللعب.`)
  }

  return (
    <Screen>
      <ScreenHeader title="الألعاب" subtitle="العب واربح داخل الغرف الصوتية" back={false} />

      <section className="relative overflow-hidden rounded-[26px] border border-gold/25 bg-gradient-to-br from-[#3a1a6e] via-[#25104f] to-[#140829] p-4">
        <span className="animate-romance-float pointer-events-none absolute -top-6 left-2 size-24 rounded-full bg-amber-300/20 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 to-yellow-600 text-[#2a1600]">
            <Gamepad2 size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-[10px] font-bold text-gold">
              <Sparkles size={11} /> العب واربح جوائز حقيقية
            </p>
            <p className="mt-1 text-sm font-black text-white">بطولات يومية مع أصدقائك</p>
            <p className="mt-0.5 text-[10px] text-blush-200/70">جوائز ألماس وهدايا داخل الغرف</p>
          </div>
        </div>
      </section>

      {error && (
        <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-3 text-center text-xs text-red-200">
          {error}
        </p>
      )}

      <section className="mt-4">
        <SectionHead title="الألعاب الرئيسية" icon={<Trophy size={14} className="text-gold" />} />
        <div className="grid grid-cols-2 gap-2.5">
          {primary.map((game) => (
            <div key={game.key} className="glass flex flex-col items-center rounded-3xl p-3 text-center">
              <span
                className="flex size-14 items-center justify-center rounded-2xl text-2xl"
                style={{ backgroundColor: `${game.accent}26`, color: game.accent }}
              >
                {game.name.charAt(0)}
              </span>
              <p className="mt-2 text-sm font-black text-white">{game.name}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[10px] text-blush-200/60">
                <Users size={10} /> {game.players} لاعب
              </p>
              <button
                type="button"
                data-testid={`game-${game.key}`}
                onClick={() => play(game)}
                className="gold-btn mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full py-1.5 text-[11px] font-black"
              >
                <Play size={11} /> العب الآن
              </button>
            </div>
          ))}
          {primary.length === 0 && (
            <p className="col-span-2 py-6 text-center text-xs text-blush-200/50">جارٍ تحميل الألعاب…</p>
          )}
        </div>
      </section>

      <section className="mt-4">
        <SectionHead title="ألعاب أخرى" hint="قريبًا" />
        <div className="grid grid-cols-4 gap-2">
          {MORE_GAMES.map((game) => (
            <button
              key={game.label}
              type="button"
              onClick={() => setNotice(`${game.label} ستكون متاحة قريبًا داخل الغرف.`)}
              className="glass flex flex-col items-center gap-1.5 rounded-2xl py-2.5"
            >
              <span className="text-xl">{game.emoji}</span>
              <span className="text-[9px] font-bold text-blush-200">{game.label}</span>
            </button>
          ))}
        </div>
      </section>

      {notice && (
        <p className="mt-3 rounded-2xl border border-gold/30 bg-gold/10 p-3 text-center text-[11px] font-semibold text-gold">
          {notice}
        </p>
      )}

      <section className="mt-4">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-black text-white">
            <Headphones size={14} className="text-fuchsia-300" /> غرف المعركة الآن
          </h2>
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[10px] font-bold text-gold"
            >
              إلغاء الفلتر
            </button>
          )}
        </div>

        {rooms === null && !error && (
          <p className="py-6 text-center text-xs text-blush-200/50">جارٍ تحميل الغرف…</p>
        )}

        {rooms !== null && battleRooms.length === 0 && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-center">
            <p className="text-xs text-blush-200/60">لا توجد غرفة معركة مفتوحة الآن.</p>
            <Link
              to="/add-item"
              className="gold-btn mt-2 inline-flex rounded-full px-4 py-1.5 text-[11px] font-black"
            >
              أنشئ غرفة معركة
            </Link>
          </div>
        )}

        <ul className="space-y-2">
          {battleRooms.map((room) => (
            <li key={room.id}>
              <button
                type="button"
                data-testid="room-card"
                data-room-id={room.id}
                onClick={() => setOpenRoom(room)}
                className="glass flex w-full items-center gap-3 rounded-2xl p-2.5 text-right transition active:scale-[0.99]"
              >
                <Avatar name={room.host} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-white">{room.title}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[10px] text-blush-200/60">
                    <span className="flex items-center gap-1">
                      <Headphones size={10} /> {room.listeners.toLocaleString('en-US')}
                    </span>
                    <span>{games.find((item) => item.key === room.game)?.name ?? room.category}</span>
                  </span>
                </span>
                <span className="gold-btn shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black">دخول</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <BottomNav />
      {openRoom && <RoomOverlay room={openRoom} onClose={() => setOpenRoom(null)} />}
    </Screen>
  )
}
