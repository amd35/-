import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { formatCoins, Icon, Sheet } from '../lib/ui';
import { GiftCover } from './GiftAnimation';
import type { BigGiftEvent } from '../lib/bigGift';

/**
 * «شريط هدية المليون»: a diamond gift worth a million or more sweeps a strip
 * across every screen — inside every room too — so the whole app sees it.
 * Tapping the strip asks the member whether to walk into that room now or stay.
 */
export function BigGiftBanner() {
  const { token } = useAuth();
  const { on } = useRealtime();
  const navigate = useNavigate();
  const [item, setItem] = useState<BigGiftEvent | null>(null);
  const [ask, setAsk] = useState<BigGiftEvent | null>(null);
  const queue = useRef<BigGiftEvent[]>([]);
  const showing = useRef(false);

  const next = useCallback(() => {
    const following = queue.current.shift() ?? null;
    showing.current = Boolean(following);
    setItem(following);
  }, []);

  useEffect(() => {
    return on('room_big_gift', (data) => {
      const incoming = data as unknown as BigGiftEvent | null;
      if (!incoming?.roomId || !incoming.giftName) return;
      if (showing.current) {
        queue.current.push(incoming);
        return;
      }
      showing.current = true;
      setItem(incoming);
    });
  }, [on]);

  if (!token) return null;

  const dismiss = () => {
    setAsk(null);
    next();
  };

  const join = () => {
    if (!ask) return;
    const target = ask.roomId;
    setAsk(null);
    next();
    navigate(`/rooms/${target}`);
  };

  return createPortal(
    <>
      {item && !ask ? (
        <button
          key={item.id}
          type="button"
          className="big-gift-banner"
          onClick={() => setAsk(item)}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) next();
          }}
        >
          <span className="big-gift-banner-art" aria-hidden="true">
            {item.gift ? (
              <GiftCover
                gift={{
                  name: item.gift.name,
                  design: item.gift.design,
                  videoUrl: item.gift.videoUrl,
                  coverUrl: item.gift.coverUrl,
                  rarity: item.gift.rarity ?? 'legendary',
                }}
              />
            ) : (
              <Icon name="gift" size={24} />
            )}
          </span>
          <span className="big-gift-banner-body">
            <span className="big-gift-banner-title">
              💎 هدية المليون · {formatCoins(item.coins)}
            </span>
            <span className="big-gift-banner-gift">
              {item.giftName}
              {item.quantity > 1 ? ` × ${item.quantity}` : ''}
            </span>
            <span className="big-gift-banner-names">
              {item.senderName || '—'} ← {item.recipientName || '—'} · {item.roomName}
            </span>
          </span>
          <span className="big-gift-banner-cta">ادخل الغرفة</span>
        </button>
      ) : null}

      <Sheet open={Boolean(ask)} onClose={dismiss} title="هدية المليون 💎">
        {ask ? (
          <div className="big-gift-ask">
            <div className="big-gift-ask-card">
              <span className="big-gift-ask-art" aria-hidden="true">
                {ask.gift ? (
                  <GiftCover
                    gift={{
                      name: ask.gift.name,
                      design: ask.gift.design,
                      videoUrl: ask.gift.videoUrl,
                      coverUrl: ask.gift.coverUrl,
                      rarity: ask.gift.rarity ?? 'legendary',
                    }}
                  />
                ) : (
                  <Icon name="gift" size={30} />
                )}
              </span>
              <div className="big-gift-ask-text">
                <p className="big-gift-ask-gift">
                  {ask.giftName}
                  {ask.quantity > 1 ? ` × ${ask.quantity}` : ''} — {formatCoins(ask.coins)} ماسة
                </p>
                <p className="tiny muted">
                  {ask.senderName || '—'} ← {ask.recipientName || '—'}
                </p>
                <p className="tiny muted">الغرفة: {ask.roomName || '—'}</p>
                {ask.entrants?.length ? (
                  <p className="tiny muted">دخل {ask.entrants.length} أعضاء الغرفة الآن 🎉</p>
                ) : null}
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={join}>
              الدخول إلى الغرفة الآن
            </button>
            <button type="button" className="btn btn-ghost" onClick={dismiss}>
              إلغاء
            </button>
          </div>
        ) : null}
      </Sheet>
    </>,
    document.body
  );
}
