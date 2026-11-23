import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Flame, Megaphone } from 'lucide-react'
import { bannersApi, type Banner } from '../../lib/eventsApi'
import { useEventsLive } from '../../lib/useEventsLive'

const FALLBACKS = [
  'linear-gradient(120deg, #2b1160 0%, #6d28d9 48%, #ff3bd4 100%)',
  'linear-gradient(120deg, #1a0b2e 0%, #7c2d12 55%, #f59e0b 100%)',
  'linear-gradient(120deg, #140829 0%, #4c1d95 50%, #b91c1c 100%)',
]

export default function BannerCarousel({ className = '' }: { className?: string }) {
  const [banners, setBanners] = useState<Banner[] | null>(null)
  const [index, setIndex] = useState(0)
  const navigate = useNavigate()

  const load = useCallback(() => {
    bannersApi
      .list()
      .then((rows) => setBanners(rows))
      .catch(() => setBanners([]))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEventsLive((message) => {
    if (message.type === 'banner_update') load()
  })

  useEffect(() => {
    if (!banners || banners.length < 2) return
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % banners.length)
    }, 5500)
    return () => clearInterval(timer)
  }, [banners])

  useEffect(() => {
    if (banners && index >= banners.length) setIndex(0)
  }, [banners, index])

  if (!banners || banners.length === 0) return null

  const current = banners[index]

  async function open(banner: Banner) {
    try {
      const result = await bannersApi.click(banner.id)
      if (result.external) {
        window.open(result.path, '_blank', 'noopener,noreferrer')
      } else {
        navigate(result.path)
      }
    } catch {
      if (banner.external) window.open(banner.path, '_blank', 'noopener,noreferrer')
      else navigate(banner.path)
    }
  }

  return (
    <section
      className={`banner-shell relative h-44 overflow-hidden rounded-[26px] border border-gold/25 shadow-[0_18px_50px_-22px_rgba(124,58,237,0.95)] ${className}`}
      data-testid="banner-carousel"
    >
      {banners.map((banner, position) => (
        <div
          key={banner.id}
          role="button"
          tabIndex={position === index ? 0 : -1}
          aria-label={`فتح ${banner.title}`}
          aria-hidden={position !== index}
          onClick={() => open(banner)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') open(banner)
          }}
          className={`absolute inset-0 cursor-pointer transition-opacity duration-700 ${
            position === index ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          style={{ background: FALLBACKS[position % FALLBACKS.length] }}
        >
          {banner.media_url && banner.media_type === 'video' ? (
            <video
              src={banner.media_url}
              className="absolute inset-0 h-full w-full object-cover"
              autoPlay={position === index}
              muted
              loop
              playsInline
              preload={position === index ? 'auto' : 'none'}
            />
          ) : banner.media_url ? (
            <img
              src={banner.media_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}

          <div className="absolute inset-0 bg-gradient-to-t from-[#080314] via-[#160a2e]/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-[#4c1d95]/35" />

          <div className="relative z-10 flex h-full flex-col justify-end p-4">
            <span className="mb-1.5 inline-flex w-fit items-center gap-1 rounded-full border border-gold/35 bg-black/35 px-2 py-0.5 text-[9px] font-black text-gold backdrop-blur">
              <Megaphone size={9} /> إعلان مميز
            </span>
            <h2 className="font-display max-w-[85%] text-xl leading-tight font-bold text-white drop-shadow">
              {banner.title}
            </h2>
            {banner.subtitle && (
              <p className="mt-0.5 max-w-[80%] text-[11px] leading-relaxed text-blush-100/85">
                {banner.subtitle}
              </p>
            )}
            <span className="gold-btn mt-2.5 inline-flex w-fit items-center gap-1 rounded-full px-3.5 py-1.5 text-[11px] font-black">
              <Flame size={12} /> اكتشف الآن
            </span>
          </div>
        </div>
      ))}

      {banners.length > 1 && (
        <>
          <button
            type="button"
            aria-label="السابق"
            onClick={(event) => {
              event.stopPropagation()
              setIndex((current) => (current - 1 + banners.length) % banners.length)
            }}
            className="absolute top-1/2 right-1.5 z-20 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur"
          >
            <ChevronRight size={15} />
          </button>
          <button
            type="button"
            aria-label="التالي"
            onClick={(event) => {
              event.stopPropagation()
              setIndex((current) => (current + 1) % banners.length)
            }}
            className="absolute top-1/2 left-1.5 z-20 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur"
          >
            <ChevronLeft size={15} />
          </button>
          <div className="absolute inset-x-0 bottom-1.5 z-20 flex items-center justify-center gap-1.5">
            {banners.map((banner, position) => (
              <button
                key={banner.id}
                type="button"
                aria-label={`عرض الإعلان ${position + 1}`}
                onClick={(event) => {
                  event.stopPropagation()
                  setIndex(position)
                }}
                className={`h-1.5 rounded-full transition-all ${
                  position === index ? 'w-5 bg-gold' : 'w-1.5 bg-white/35'
                }`}
              />
            ))}
          </div>
        </>
      )}

      <span className="sr-only">{current.title}</span>
    </section>
  )
}
