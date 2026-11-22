import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  Crown,
  Hand,
  Headphones,
  MessageCircle,
  Mic,
  MicOff,
  Share2,
  Sparkles,
} from 'lucide-react'
import Avatar from './Avatar'
import SeatGrid, { type RoomSeat } from './SeatGrid'
import { api, type Room } from '../lib/api'
import { useVoiceRoom } from '../lib/useVoiceRoom'

const GIFTS = ['🌹', '🦋', '💎', '🏆', '🚀']

export default function RoomOverlay({ room, onClose }: { room: Room; onClose: () => void }) {
  const [notice, setNotice] = useState<string | null>(null)
  const [manualLink, setManualLink] = useState<string | null>(null)
  const [following, setFollowing] = useState(false)
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
  const guests = seats.filter((seat) => !seat.host)

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#080314]">
      <div aria-hidden data-testid="room-backdrop" className="photo-base photo-evening absolute inset-0 opacity-60" />
      <div aria-hidden data-testid="room-scrim" className="absolute inset-0 bg-[#080314]/80" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(168,85,247,0.45),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#080314]/30 via-transparent to-[#080314]" />

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

      <div className="relative mx-auto flex h-full w-full max-w-[440px] flex-col">
        <header className="flex items-center gap-2 px-4 pt-4 pb-2">
          <button
            type="button"
            onClick={handleClose}
            aria-label="رجوع"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white"
          >
            <ChevronRight size={19} />
          </button>

          <span className="shrink-0 rounded-full bg-gradient-to-br from-amber-300 to-fuchsia-600 p-[1.5px]">
            <Avatar name={room.host} size={34} />
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold text-white">{room.title}</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-blush-200/70">
              <span className="rounded-full bg-white/10 px-1.5 py-0.5">ID {room.id}</span>
              <span className="flex items-center gap-1">
                <Headphones size={11} /> {seats.length} متصل
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => setFollowing((value) => !value)}
            aria-pressed={following}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-black transition ${
              following ? 'border border-white/15 bg-white/10 text-white' : 'gold-btn'
            }`}
          >
            {following ? 'متابَع' : 'متابعة'}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* المضيف */}
          <div className="flex flex-col items-center pt-1">
            <div className="relative">
              <Crown size={18} className="absolute -top-3 left-1/2 -translate-x-1/2 text-gold gift-glow" fill="currentColor" />
              <span className="block rounded-full bg-gradient-to-br from-amber-300 via-fuchsia-500 to-violet-700 p-[2px] shadow-[0_0_30px_-6px_rgba(255,209,102,0.9)]">
                <Avatar name={room.host} size={72} />
              </span>
              <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-[#1b0b34] px-2 py-0.5 text-[9px] font-bold text-gold ring-1 ring-gold/40">
                <Mic size={9} /> المضيف
              </span>
            </div>
            <p className="mt-2.5 text-sm font-bold text-white">{room.host}</p>
            <p className="text-[10px] font-semibold text-blush-200/60">{room.category} · غرفة مباشرة</p>
          </div>

          {/* المقاعد */}
          <div className="mt-3">
            <SeatGrid seats={guests} />
          </div>

          <button
            type="button"
            onClick={toggleHand}
            aria-pressed={handRaised}
            data-testid="raise-hand"
            className={`mt-2 flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-xs font-semibold transition ${
              handRaised
                ? 'border-gold/40 bg-gold/15 text-gold'
                : 'border-white/10 bg-white/[0.06] text-slate-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <Hand size={15} /> {handRaised ? 'يدك مرفوعة' : 'ارفع يدك للتحدث'}
            </span>
            <span className="text-[10px] text-slate-400">{handRaised ? 'بانتظار المضيف' : 'رفع'}</span>
          </button>

          {/* الدردشة */}
          <div className="glass mt-3 rounded-2xl p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold text-blush-200/70">
              <MessageCircle size={12} /> دردشة الغرفة
            </p>
            <div className="space-y-1 text-[11px] leading-relaxed">
              <p className="text-slate-300">
                <span className="font-bold text-gold">النظام:</span> مرحباً بك في {room.title}
              </p>
              <p className="text-slate-300">
                <span className="font-bold text-fuchsia-300">{room.host}:</span> أهلاً بكم جميعاً 👋
              </p>
              <p className="text-slate-400">
                <span className="font-bold text-blush-200">أنت:</span> انضممت إلى الغرفة
              </p>
            </div>
            <input
              readOnly
              value="اكتب رسالة للغرفة…"
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px] text-slate-400 outline-none"
            />
          </div>

          {/* الهدايا */}
          <div className="glass mt-3 rounded-2xl p-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[10px] font-bold text-blush-200/70">
                <Sparkles size={12} className="text-gold" /> أرسل هدية
              </p>
              <button
                type="button"
                onClick={() => sendGift('🎁')}
                aria-label="أرسل صندوق هدايا"
                className="animate-gift-pulse text-3xl"
              >
                🎁
              </button>
            </div>
            <div className="mt-2 flex justify-between gap-2">
              {GIFTS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => sendGift(emoji)}
                  aria-label={`أرسل ${emoji}`}
                  data-testid={`gift-${emoji}`}
                  className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.08] text-xl transition active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        {micError && (
          <p
            data-testid="mic-error"
            className="mx-4 mb-2 rounded-xl border border-rose-400/30 bg-rose-500/15 p-2 text-center text-[11px] text-rose-200"
          >
            {micError}
          </p>
        )}

        {manualLink && (
          <div
            data-testid="share-panel"
            className="mx-4 mb-2 rounded-2xl border border-white/15 bg-black/85 p-3"
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
          <div data-testid="gift-toast" className="pointer-events-none absolute inset-x-0 bottom-36 z-20 flex justify-center">
            <span className="animate-romance-float rounded-full bg-black/70 px-4 py-2 text-sm font-bold text-white shadow-lg">
              {gift.emoji} من {gift.from}
            </span>
          </div>
        )}

        {notice && (
          <p
            data-testid="room-notice"
            className="absolute inset-x-4 bottom-32 z-20 rounded-xl bg-black/70 p-2 text-center text-[11px] text-white"
          >
            {notice}
          </p>
        )}

        <div className="flex items-center justify-center gap-5 border-t border-white/10 bg-gradient-to-t from-[#0a0418] to-[#120826]/90 px-4 pt-3 pb-5">
          <button
            type="button"
            aria-label="مشاركة"
            onClick={shareRoom}
            className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white"
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
                : 'purple-btn'
            }`}
          >
            {micOn ? <Mic size={24} /> : <MicOff size={24} />}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-xs font-bold text-rose-300"
          >
            خروج
          </button>
        </div>
      </div>
    </div>
  )
}
