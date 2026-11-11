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
      className={`glass group flex w-full items-center gap-3 rounded-3xl p-3.5 text-right transition hover:border-fuchsia-300/40 hover:bg-white/[0.09] ${
        compact ? 'min-w-[250px]' : ''
      }`}
    >
      <Avatar name={room.host} size={46} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-bold text-white">{room.title}</span>
          {room.is_battle && <Swords size={14} className="shrink-0 text-amber-300" />}
        </span>
        <span className="mt-1 flex items-center gap-2 text-[11px] text-blush-200/60">
          <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 font-semibold text-blush-100">
            {room.category}
          </span>
          <span className="truncate">{room.host}</span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-center gap-1 text-[11px] font-semibold">
        <span className="flex items-center gap-1 rounded-full border border-fuchsia-300/20 bg-fuchsia-500/15 px-2 py-1 text-blush-200">
          <Headphones size={13} />
          {room.listeners.toLocaleString('en-US')}
        </span>
        <span className="flex items-center gap-1 text-blush-200/50">
          <Mic size={12} />
          {room.seats_taken}/{room.seats_total}
        </span>
      </span>
    </button>
  )
}
