import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Diamond, Gem, Gift, Plus, Send, Shield, Sparkles } from 'lucide-react'
import BottomNav from '../components/BottomNav'
import { Screen, ScreenHeader, SectionHead } from '../components/Screen'
import { api, type Me } from '../lib/api'

type StoreItem = { name: string; emoji: string; price: number }

const TABS = [
  { key: 'gifts', label: 'الهدايا' },
  { key: 'items', label: 'العناصر' },
  { key: 'privileges', label: 'الامتيازات' },
] as const

type TabKey = (typeof TABS)[number]['key']

const CATALOG: Record<TabKey, StoreItem[]> = {
  gifts: [
    { name: 'وردة', emoji: '🌹', price: 500 },
    { name: 'كيكة', emoji: '🎂', price: 2000 },
    { name: 'تاج', emoji: '👑', price: 5000 },
    { name: 'دب', emoji: '🧸', price: 3000 },
    { name: 'سيارة', emoji: '🏎️', price: 20000 },
    { name: 'يخت', emoji: '🛥️', price: 50000 },
    { name: 'مايك', emoji: '🎤', price: 8000 },
    { name: 'صاروخ', emoji: '🚀', price: 15000 },
    { name: 'ألماسة', emoji: '💎', price: 25000 },
  ],
  items: [
    { name: 'إطار ذهبي', emoji: '🖼️', price: 12000 },
    { name: 'تأثير دخول', emoji: '✨', price: 18000 },
    { name: 'خلفية ملكية', emoji: '🌌', price: 22000 },
    { name: 'لقب مميز', emoji: '🏷️', price: 9000 },
  ],
  privileges: [
    { name: 'عضوية VIP', emoji: '⭐', price: 30000 },
    { name: 'درع المضيف', emoji: '🛡️', price: 45000 },
    { name: 'شارة الوكالة', emoji: '🏅', price: 80000 },
  ],
}

export default function StorePage() {
  const [me, setMe] = useState<Me | null>(null)
  const [tab, setTab] = useState<TabKey>('gifts')
  const [selected, setSelected] = useState<StoreItem | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .me()
      .then((profile) => active && setMe(profile))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const items = CATALOG[tab]

  function choose(item: StoreItem) {
    setSelected(item)
    setNotice(null)
  }

  function send() {
    if (!selected) {
      setNotice('اختر هدية أولًا من الشبكة أعلاه.')
      return
    }
    setNotice(`تم اختيار ${selected.name} — أرسله من داخل الغرفة لصديقك.`)
  }

  return (
    <Screen>
      <ScreenHeader title="المتجر" subtitle="هدايا وعناصر وامتيازات" back={false} />

      <section className="glass flex items-center gap-2 rounded-2xl px-3 py-2.5">
        <span className="flex items-center gap-1.5 rounded-full bg-cyan-400/10 px-2.5 py-1 text-[11px] font-black text-cyan-200">
          <Diamond size={13} /> {(me?.diamonds ?? 0).toLocaleString('en-US')}
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-black text-gold">
          <Gem size={13} /> {(me?.coins ?? 0).toLocaleString('en-US')}
        </span>
        <Link
          to="/vcoin"
          aria-label="شحن الرصيد"
          className="gold-btn ms-auto flex size-7 items-center justify-center rounded-full"
        >
          <Plus size={15} />
        </Link>
      </section>

      <div className="glass mt-3 grid grid-cols-3 gap-1 rounded-2xl p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            data-testid={`store-${item.key}`}
            onClick={() => {
              setTab(item.key)
              setSelected(null)
              setNotice(null)
            }}
            className={`rounded-xl py-2 text-[11px] font-bold transition ${
              tab === item.key ? 'purple-btn' : 'text-blush-200/60'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="mt-4">
        <SectionHead
          title="اختر ما تريد إرساله"
          icon={<Gift size={14} className="text-fuchsia-300" />}
          hint={`${items.length} عنصر`}
        />

        <div className="grid grid-cols-3 gap-2">
          {items.map((item) => {
            const active = selected?.name === item.name
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => choose(item)}
                className={`flex flex-col items-center rounded-2xl border p-2 transition active:scale-[0.98] ${
                  active
                    ? 'border-gold/70 bg-gold/10 shadow-[0_10px_26px_-14px_rgba(255,209,102,0.9)]'
                    : 'border-white/10 bg-white/[0.05]'
                }`}
              >
                <span className="text-2xl leading-none">{item.emoji}</span>
                <span className="mt-1.5 text-[10px] font-bold text-white">{item.name}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[9px] font-black text-gold">
                  <Gem size={9} /> {item.price.toLocaleString('en-US')}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {notice && (
        <p className="mt-3 rounded-2xl border border-gold/30 bg-gold/10 p-3 text-center text-[11px] font-semibold text-gold">
          {notice}
        </p>
      )}

      <button
        type="button"
        onClick={send}
        className="gold-btn mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-black transition active:scale-[0.99]"
      >
        <Send size={15} /> إرسال هدية
      </button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] font-semibold text-blush-200/40">
        <Shield size={11} /> كل الهدايا تُرسل داخل الغرف الصوتية
        <Sparkles size={11} className="text-gold" />
      </p>

      <BottomNav />
    </Screen>
  )
}
