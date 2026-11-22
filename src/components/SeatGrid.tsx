import { Crown, Hand, Mic, MicOff } from 'lucide-react'
import Avatar from './Avatar'

export type RoomSeat = { name: string; mic: boolean; hand: boolean; host: boolean }

const COLUMNS = 4
const ROWS = 4
const SEATS = COLUMNS * ROWS

/** شبكة المقاعد الدائرية للغرفة: ٤ أعمدة × ٤ صفوف = ١٦ مقعدًا. */
export default function SeatGrid({ seats }: { seats: RoomSeat[] }) {
  const slots = Array.from({ length: SEATS }, (_, index) => index)

  return (
    <div
      data-testid="seat-grid"
      className="grid w-full grid-cols-4 gap-x-2 gap-y-3 rounded-[22px] border border-white/10 bg-black/25 p-2.5 backdrop-blur-md"
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
                  <span className="block rounded-full bg-gradient-to-br from-amber-300/80 to-fuchsia-600 p-[1.5px]">
                    <Avatar name={seat.name} size={44} />
                  </span>
                  {seat.host && (
                    <Crown
                      size={13}
                      className="absolute -top-2 left-1/2 -translate-x-1/2 text-gold"
                      fill="currentColor"
                    />
                  )}
                  {seat.hand && (
                    <span
                      data-testid="seat-hand"
                      className="absolute -top-2 right-0 flex size-4 items-center justify-center rounded-full bg-gold text-[9px] text-[#1a0b2e]"
                    >
                      <Hand size={9} />
                    </span>
                  )}
                  <span
                    data-testid="seat-mic"
                    data-on={seat.mic ? 'true' : 'false'}
                    className={`absolute -bottom-1 left-1/2 flex size-4 -translate-x-1/2 items-center justify-center rounded-full ring-2 ring-[#120a24] ${
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
                <span className="w-full truncate text-center text-[10px] leading-tight text-slate-200">
                  {seat.name}
                </span>
              </>
            ) : (
              <>
                <span className="flex size-11 items-center justify-center rounded-full border border-dashed border-violet-300/30 bg-white/[0.04] text-violet-200/50">
                  <Mic size={15} />
                </span>
                <span className="text-[10px] leading-tight text-slate-500">فارغ</span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
