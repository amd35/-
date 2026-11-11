import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Hand, Headphones, Mic, MicOff, Share2, Sparkles, Users } from 'lucide-react'
import Avatar from './Avatar'
import SeatGrid, { type RoomSeat } from './SeatGrid'
import { api, type Room } from '../lib/api'
import { useVoiceRoom } from '../lib/useVoiceRoom'

const GIFTS = ['🌹', '🦋', '💎', '🏆', '🚀']

export default function RoomOverlay({ room, onClose }: { room: Room; onClose: () => void }) {
  const [notice, setNotice] = useState<string | null>(null)
  const [manualLink, setManualLink] = useState<string | null>(null)
  const onCloseRef = useRef<() => void>(() => {})
  const { peers, streams, selfName, micOn, micError, toggleMic, handRaised, toggleHand, sendGift, gift } =
    useVoiceRoom(room)

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

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 2600)
    return () => window.clearTimeout(timer)
  }, [notice])

  function handleClose() {
    api.leaveRoom(room.id).catch(() => undefined)
    onClose()
  }

  onCloseRef.current = handleClose

  function copyLink(url: string) {
    const field = document.createElement('textarea')
    field.value = url
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(field)
    return copied
  }

  async function shareRoom() {
    const url = window.location.href
    const data = { title: `يلا فون — ${room.title}`, text: 'انضم إليّ في الغرفة الصوتية', url }
    try {
      if (navigator.share) {
        await navigator.share(data)
        setNotice('تمت مشاركة الغرفة')
        return
      }
    } catch {
      /* المستخدم أغلق نافذة المشاركة — نكمل بالنسخ */
    }
    let copied = false
    if (navigator.clipboard?.writeText) {
      copied = await navigator.clipboard
        .writeText(url)
        .then(() => true)
        .catch(() => false)
    }
    if (!copied) {
      setManualLink(url)
      setNotice(null)
      return
    }
    setManualLink(null)
    setNotice('تم نسخ رابط الغرفة')
  }

  const seats: RoomSeat[] = [
    { name: selfName, mic: micOn, hand: handRaised, host: selfName === room.host },
    ...peers.map((peer) => ({
      name: peer.name,
      mic: peer.mic,
      hand: peer.hand,
      host: peer.name === room.host,
    })),
  ]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#07030f]">
      {/* خلفية رومانسية مصوّرة + scrim داكن ثابت يضمن قراءة النصوص */}
      <div
        aria-hidden
        data-testid="room-backdrop"
        className="photo-base photo-couple pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        data-testid="room-scrim"
        className="pointer-events-none absolute inset-0 bg-[#07030f]/75"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_-12%,rgba(244,114,182,0.26),transparent_58%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#07030f]/40 via-transparent to-[#07030f]/95" />

      {/* صوت أعضاء الغرفة الحقيقي */}
      <div className="hidden" aria-hidden>
        {Object.entries(streams).map(([peerId, stream]) => (
          <audio
            key={peerId}
            autoPlay
            playsInline
            ref={(element) => {
              if (element) element.srcObject = stream
            }}
          />
        ))}
      </div>

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
              <Headphones size={12} /> {seats.length} متصل
            </span>
          </p>
        </div>
        <Avatar name={room.host} size={36} />
      </header>

      <div className="relative flex-1 overflow-y-auto px-4">
        <SeatGrid seats={seats} />

        <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs font-semibold text-emerald-200">
          <span className="flex items-center gap-2">
            <Users size={16} /> أنت داخل الغرفة
          </span>
          <span className="text-emerald-200/80">{seats.length} متصل الآن</span>
        </div>

        <button
          type="button"
          onClick={toggleHand}
          aria-pressed={handRaised}
          data-testid="raise-hand"
          className={`mt-2 flex w-full items-center justify-between rounded-2xl border p-3.5 text-sm font-semibold transition ${
            handRaised
              ? 'border-amber-300/40 bg-amber-300/15 text-amber-200'
              : 'border-white/10 bg-white/5 text-slate-300'
          }`}
        >
          <span className="flex items-center gap-2">
            <Hand size={16} /> {handRaised ? 'يدك مرفوعة' : 'ارفع يدك للتحدث'}
          </span>
          <span className="text-xs text-slate-400">{handRaised ? 'بانتظار المضيف' : 'رفع'}</span>
        </button>

        <div className="glass mt-4 rounded-3xl p-4">
          <p className="flex items-center gap-2 text-xs font-bold text-blush-200">
            <Sparkles size={14} className="text-amber-300" /> أرسل هدية للغرفة
          </p>
          <div className="mt-3 flex gap-2 text-2xl">
            {GIFTS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => sendGift(emoji)}
                aria-label={`أرسل ${emoji}`}
                data-testid={`gift-${emoji}`}
                className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/10 transition active:scale-95"
              >
                {emoji}
              </button>
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

      {micError && (
        <p
          data-testid="mic-error"
          className="absolute inset-x-4 bottom-28 rounded-xl border border-rose-400/30 bg-rose-500/15 p-2 text-center text-[11px] text-rose-200"
        >
          {micError}
        </p>
      )}

      {manualLink && (
        <div
          data-testid="share-panel"
          className="absolute inset-x-4 bottom-28 rounded-2xl border border-white/15 bg-black/85 p-3"
        >
          <p className="mb-2 text-[11px] font-semibold text-slate-200">انسخ رابط الغرفة وشاركه:</p>
          <input
            readOnly
            dir="ltr"
            aria-label="رابط الغرفة"
            value={manualLink}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-lg bg-white/10 px-2 py-1.5 text-[11px] text-white outline-none"
          />
        </div>
      )}

      {gift && (
        <div
          data-testid="gift-toast"
          className="pointer-events-none absolute inset-x-0 bottom-40 flex justify-center"
        >
          <span className="animate-romance-float rounded-full bg-black/70 px-4 py-2 text-sm font-bold text-white shadow-lg">
            {gift.emoji} من {gift.from}
          </span>
        </div>
      )}

      {notice && (
        <p
          data-testid="room-notice"
          className="absolute inset-x-4 bottom-28 rounded-xl bg-black/70 p-2 text-center text-[11px] text-white"
        >
          {notice}
        </p>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 bg-gradient-to-t from-[#07030f] via-[#07030f]/95 to-transparent px-4 pt-6 pb-6">
        <button
          type="button"
          aria-label="مشاركة"
          onClick={shareRoom}
          className="flex size-11 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <Share2 size={18} />
        </button>
        <button
          type="button"
          data-testid="mic-toggle"
          onClick={toggleMic}
          aria-pressed={micOn}
          aria-label={micOn ? 'إيقاف المِيكروفون' : 'تشغيل المِيكروفون'}
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
