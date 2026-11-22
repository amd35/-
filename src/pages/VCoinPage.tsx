import { useEffect, useState } from 'react'
import { Coins, Gem, Sparkles } from 'lucide-react'
import { Screen, ScreenHeader } from '../components/Screen'
import { api, type Me } from '../lib/api'

const PACKAGES = [
  { vcoins: 500, price: '$0.99' },
  { vcoins: 5000, price: '$8.99' },
  { vcoins: 10000, price: '$16.99' },
  { vcoins: 50000, price: '$69.99' },
]

export default function VCoinPage() {
  const [me, setMe] = useState<Me | null>(null)
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

  return (
    <Screen>
      <ScreenHeader title="مركز VCoin" subtitle="اشحن رصيدك وأرسل هدايا" />

      <section className="relative overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-[#4a2410] via-[#2b1250] to-[#150a2c] p-4">
        <span className="pointer-events-none absolute -top-8 left-6 size-28 rounded-full bg-amber-400/25 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 to-yellow-600 text-[#2a1600] shadow-[0_10px_30px_-10px_rgba(255,201,60,0.9)]">
            <Gem size={26} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-amber-100/80">رصيد VCoins</p>
            <p className="font-display text-3xl leading-none font-black text-white">
              {(me?.coins ?? 0).toLocaleString('en-US')}
            </p>
          </div>
        </div>
        <p className="relative mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-amber-100/70">
          <Sparkles size={11} /> استخدم VCoins لشراء الهدايا والألعاب داخل الغرف
        </p>
      </section>

      <section className="mt-4">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-black text-white">
            <Coins size={14} className="text-gold" /> باقات الشحن
          </h2>
          <span className="text-[10px] font-semibold text-blush-200/60">أسعار تجريبية</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {PACKAGES.map((item, index) => (
            <button
              key={item.vcoins}
              type="button"
              onClick={() => setNotice(`باقة ${item.vcoins.toLocaleString('en-US')} VCoin — الدفع غير مفعّل في النسخة التجريبية`)}
              className={`glass relative overflow-hidden rounded-3xl p-3 text-center transition active:scale-[0.98] ${
                index === 1 ? 'border-gold/50' : ''
              }`}
            >
              {index === 1 && (
                <span className="absolute top-0 right-0 rounded-bl-xl bg-gold px-2 py-0.5 text-[8px] font-black text-[#2a1600]">
                  الأكثر مبيعًا
                </span>
              )}
              <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200/90 to-yellow-600/90 text-[#2a1600]">
                <Gem size={20} />
              </span>
              <p className="mt-2 text-base font-black text-white">{item.vcoins.toLocaleString('en-US')}</p>
              <p className="text-[9px] font-semibold text-blush-200/60">VCoin</p>
              <p className="mt-2 rounded-full bg-white/10 py-1 text-[11px] font-black text-gold" dir="ltr">
                {item.price}
              </p>
            </button>
          ))}
        </div>

        {notice && (
          <p className="mt-3 rounded-2xl border border-gold/30 bg-gold/10 p-3 text-center text-[11px] font-semibold text-gold">
            {notice}
          </p>
        )}

        <p className="mt-4 text-center text-[10px] leading-relaxed text-blush-200/40">
          عمليات الشراء تحتاج ربط بوابة دفع — أضفها من صفحة الإعدادات عند توفّرها.
        </p>
      </section>
    </Screen>
  )
}
