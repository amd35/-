import { Crown, Mic } from 'lucide-react'
import Avatar from './Avatar'
import type { Room } from '../lib/api'

const COLUMNS = 4
const ROWS = 8
const SEATS = COLUMNS * ROWS

/** شبكة المقاعد الأساسية للغرفة: 4 أعمدة × 8 صفوف = 32 مقعدًا. */
export default function SeatGrid({ room }: { room: Room }) {
  const taken = Math.min(room.seats_taken, SEATS)
  const seats = Array.from({ length: SEATS }, (_, index) => index)

  return (
    <div
      data-testid="seat-grid"
      className="glass-deep grid grid-cols-4 gap-x-2 gap-y-4 rounded-[1.75rem] p-3"
    >
      {seats.map((index) => {
        const occupied = index < taken
        const name = index === 0 ? room.host : index === 1 ? 'أنت' : 'مستمع'

        return (
          <div
            key={index}
            data-testid="seat"
            data-state={occupied ? 'occupied' : 'empty'}
            className="flex flex-col items-center gap-1"
          >
            {occupied ? (
              <>
                <div className="relative">
                  <Avatar name={name} size={44} />
                  {index === 0 && (
                    <Crown
                      size={14}
                      className="absolute -top-2 left-1/2 -translate-x-1/2 text-amber-300"
                    />
                  )}
                  <span className="absolute -bottom-1 left-1/2 flex size-4 -translate-x-1/2 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#0b0614]">
                    <Mic size={9} className="text-white" />
                  </span>
                </div>
                <span className="w-full truncate text-center text-[10px] text-slate-200">
                  {name}
                </span>
              </>
            ) : (
              <>
                <span className="flex size-11 items-center justify-center rounded-full border border-dashed border-white/25 bg-white/[0.03] text-white/40">
                  <Mic size={15} />
                </span>
                <span className="text-[10px] text-slate-500">فارغ</span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
