import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Crown, Headphones, Mic, MicOff, Share2, Sparkles, Users } from 'lucide-react'
import Avatar from './Avatar'
import { api, type Room } from '../lib/api'

const SEAT_NAMES = ['أبو رعد', 'سارة', 'حسن', 'زينب', 'مصطفى', 'نور', 'مؤيد']

export default function RoomOverlay({ room, onClose }: { room: Room; onClose: () => void }) {
  const [micOn, setMicOn] = useState(false)
  const [joined, setJoined] = useState(true)
  const onCloseRef = useRef<() => void>(() => {})

  useEffect(() => {
    api.joinRoom(room.id).catch(() => undefined)
  }, [room.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function handleClose() {
    api.leaveRoom(room.id).catch(() => undefined)
    onClose()
  }

  onCloseRef.current = handleClose

  const seats = Array.from({ length: room.seats_total }, (_, index) => index)

  return (
    <div className="photo-base photo-evening fixed inset-0 z-50 flex flex-col bg-[#0a0613]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_-10%,rgba(244,114,182,0.32),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0a0613]/65 via-transparent to-[#0a0613]/95" />

      <header className="relative flex items-center gap-2 px-4 pt-5 pb-3">
        <button
          type="button"
          onClick={handleClose}
          aria-label="رجوع"
          className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <ChevronRight size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-white">{room.title}</h2>
          <p className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-semibold text-slate-200">
              {room.category}
            </span>
            <span className="flex items-center gap-1">
              <Headphones size={12} /> {room.listeners.toLocaleString('en-US')} مستمع
            </span>
          </p>
        </div>
        <Avatar name={room.host} size={36} />
      </header>

      <div className="relative flex-1 overflow-y-auto px-4">
        <div className="glass-deep grid grid-cols-4 gap-3 rounded-[1.75rem] p-4">
          {seats.map((index) => {
            const occupied = index < room.seats_taken
            const name = index === 0 ? room.host : SEAT_NAMES[(index - 1) % SEAT_NAMES.length]
            return (
              <div key={index} className="flex flex-col items-center gap-1.5">
                {occupied ? (
                  <>
                    <div className="relative">
                      <Avatar name={name} size={48} />
                      {index === 0 && (
                        <Crown
                          size={16}
                          className="absolute -top-2 left-1/2 -translate-x-1/2 text-amber-300"
                        />
                      )}
                      <span className="absolute -bottom-1 left-1/2 flex size-4 -translate-x-1/2 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-[#0a0613]">
                        <Mic size={9} className="text-white" />
                      </span>
                    </div>
                    <span className="w-full truncate text-center text-[10px] text-slate-300">{name}</span>
                  </>
                ) : (
                  <>
                    <span className="flex size-12 items-center justify-center rounded-full border border-dashed border-white/25 text-white/40">
                      <Mic size={16} />
                    </span>
                    <span className="text-[10px] text-slate-500">فارغ</span>
                  </>
                )}
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => setJoined((value) => !value)}
          data-testid="raise-hand"
          className={`mt-4 flex w-full items-center justify-between rounded-2xl border p-3.5 text-sm font-semibold transition ${
            joined
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-white/10 bg-white/5 text-slate-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <Users size={16} /> {joined ? 'أنت داخل الغرفة' : 'اضغط للانضمام'}
          </span>
          <span className="text-xs text-slate-400">{joined ? 'استمع الآن' : 'انضم'}</span>
        </button>

        <div className="glass mt-4 rounded-3xl p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-blush-200">
            <Sparkles size={14} className="text-amber-300" /> الهدايا المدعومة
          </p>
          <div className="mt-3 flex gap-2 text-2xl">
            {['🌹', '🦋', '💎', '🏆', '🚀'].map((gift) => (
              <span
                key={gift}
                className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/10"
              >
                {gift}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/[0.03] p-3">
          <Avatar name="المستخدم" size={32} />
          <input
            readOnly
            value="اكتب رسالة للغرفة…"
            className="flex-1 bg-transparent text-xs text-slate-400 outline-none"
          />
        </div>
        <div className="h-28" />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 bg-gradient-to-t from-[#0a0613] via-[#0a0613]/95 to-transparent px-4 pt-6 pb-6">
        <button
          type="button"
          aria-label="مشاركة"
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <Share2 size={18} />
        </button>
        <button
          type="button"
          data-testid="mic-toggle"
          onClick={() => setMicOn((value) => !value)}
          aria-pressed={micOn}
          className={`flex size-16 items-center justify-center rounded-full text-white shadow-lg transition ${
            micOn
              ? 'bg-emerald-500 shadow-[0_0_26px_-2px_rgba(16,185,129,0.7)]'
              : 'bg-gradient-to-br from-rose-500 to-fuchsia-600 shadow-[0_0_26px_-2px_rgba(236,72,153,0.85)]'
          }`}
        >
          {micOn ? <Mic size={24} /> : <MicOff size={24} />}
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="rounded-full bg-rose-500/15 px-4 py-3 text-xs font-bold text-rose-300"
        >
          خروج
        </button>
      </div>
    </div>
  )
}
