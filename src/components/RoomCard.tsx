import { Headphones, Mic, Swords } from 'lucide-react'
import Avatar from './Avatar'
import type { Room } from '../lib/api'

export default function RoomCard({
  room,
  onOpen,
  compact,
}: {
  room: Room
  onOpen: (room: Room) => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      data-testid="room-card"
      data-room-id={room.id}
      onClick={() => onOpen(room)}
      className={`glass group flex w-full items-center gap-3 rounded-2xl p-2.5 text-right transition active:scale-[0.99] hover:border-violet-300/35 ${
        compact ? 'min-w-[250px]' : ''
      }`}
    >
      <span className="relative shrink-0 rounded-full bg-gradient-to-br from-amber-300/80 to-fuchsia-600 p-[1.5px]">
        <Avatar name={room.host} size={46} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-bold text-white">{room.title}</span>
          {room.is_battle && <Swords size={13} className="shrink-0 text-gold" />}
        </span>
        <span className="mt-1 flex items-center gap-1.5 text-[10px] text-blush-200/70">
          <span className="rounded-full border border-violet-300/20 bg-violet-500/15 px-1.5 py-0.5 font-semibold text-blush-100">
            {room.category}
          </span>
          <span className="truncate">{room.host}</span>
        </span>
        <span className="mt-1 flex items-center gap-2.5 text-[10px] font-semibold text-blush-200/60">
          <span className="flex items-center gap-1">
            <Headphones size={11} /> {room.listeners.toLocaleString('en-US')}
          </span>
          <span className="flex items-center gap-1">
            <Mic size={11} /> {room.seats_taken}/{room.seats_total}
          </span>
        </span>
      </span>

      <span className="gold-btn shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black">دخول</span>
    </button>
  )
}
