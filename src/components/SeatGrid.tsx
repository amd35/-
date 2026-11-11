import { Crown, Hand, Mic, MicOff } from 'lucide-react'
import Avatar from './Avatar'

export type RoomSeat = { name: string; mic: boolean; hand: boolean; host: boolean }

const COLUMNS = 4
const ROWS = 8
const SEATS = COLUMNS * ROWS

/** شبكة المقاعد الأساسية للغرفة: 4 أعمدة × 8 صفوف = 32 مقعدًا. */
export default function SeatGrid({ seats }: { seats: RoomSeat[] }) {
  const slots = Array.from({ length: SEATS }, (_, index) => index)

  return (
    <div
      data-testid="seat-grid"
      className="glass-deep grid grid-cols-4 gap-x-2 gap-y-4 rounded-[1.75rem] p-3"
    >
      {slots.map((index) => {
        const seat = index < seats.length ? seats[index] : null

        return (
          <div
            key={index}
            data-testid="seat"
            data-state={seat ? 'occupied' : 'empty'}
            className="flex flex-col items-center gap-1"
          >
            {seat ? (
              <>
                <div className="relative">
                  <Avatar name={seat.name} size={44} />
                  {seat.host && (
                    <Crown
                      size={14}
                      className="absolute -top-2 left-1/2 -translate-x-1/2 text-amber-300"
                    />
                  )}
                  {seat.hand && (
                    <span
                      data-testid="seat-hand"
                      className="absolute -top-2 right-0 flex size-4 items-center justify-center rounded-full bg-amber-300 text-[9px] text-[#1a0f27]"
                    >
                      <Hand size={9} />
                    </span>
                  )}
                  <span
                    data-testid="seat-mic"
                    data-on={seat.mic ? 'true' : 'false'}
                    className={`absolute -bottom-1 left-1/2 flex size-4 -translate-x-1/2 items-center justify-center rounded-full ring-2 ring-[#0b0614] ${
                      seat.mic ? 'bg-emerald-500' : 'bg-slate-600'
                    }`}
                  >
                    {seat.mic ? (
                      <Mic size={9} className="text-white" />
                    ) : (
                      <MicOff size={9} className="text-white" />
                    )}
                  </span>
                </div>
                <span className="w-full truncate text-center text-[10px] text-slate-200">
                  {seat.name}
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
