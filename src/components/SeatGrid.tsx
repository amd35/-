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
      className="glass-deep grid w-full grid-cols-4 gap-x-1.5 gap-y-3 rounded-[1.25rem] p-2.5 sm:mx-auto sm:max-w-lg sm:gap-x-2.5 sm:gap-y-4 sm:rounded-[1.75rem] sm:p-3.5 lg:max-w-2xl lg:gap-x-4 lg:gap-y-5 lg:p-4"
    >
      {slots.map((index) => {
        const seat = index < seats.length ? seats[index] : null

        return (
          <div
            key={index}
            data-testid="seat"
            data-state={seat ? 'occupied' : 'empty'}
            className="flex min-w-0 flex-col items-center gap-1"
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
                <span className="w-full truncate text-center text-[10px] leading-tight text-slate-200 sm:text-[11px]">
                  {seat.name}
                </span>
              </>
            ) : (
              <>
                <span className="flex size-10 items-center justify-center rounded-full border border-dashed border-white/25 bg-white/[0.03] text-white/40 sm:size-11">
                  <Mic size={15} />
                </span>
                <span className="text-[10px] leading-tight text-slate-500 sm:text-[11px]">فارغ</span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
