import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, Icon, Sheet, useToast } from '../../lib/ui';
import { GiftCover } from '../GiftAnimation';
import { FlagThumb, isFlagGift } from '../FlagGift';

interface RoomAdGift {
  id: string;
  name: string;
  nameEn: string;
  design: string | null;
  coverUrl: string | null;
  videoUrl: string | null;
  rarity: string;
  price: number;
}

export interface RoomAd {
  id: string;
  title: string;
  price: number;
  featured: boolean;
  gift: RoomAdGift;
}

function AdArt({ gift }: { gift: RoomAdGift }) {
  return isFlagGift(gift) ? (
    <FlagThumb design={gift.design} className="room-ad-art-img" />
  ) : (
    <GiftCover gift={gift} className="room-ad-art-img" />
  );
}

/**
 * «إعلانات الغرفة»: the administration's horizontal banner ads on the left of
 * the stage. Each banner sells one gift; buying it drops the gift into the
 * buyer's gift bag («جنطة الهدايا»). The server rotates the featured gift every
 * Baghdad day, so the shop never repeats the same gift until its turn comes back.
 */
export function RoomAdRail() {
  const toast = useToast();
  const [ads, setAds] = useState<RoomAd[]>([]);
  const [confirm, setConfirm] = useState<RoomAd | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ ads: RoomAd[] }>('/room-ads')
      .then((data) => {
        if (alive) setAds(data.ads ?? []);
      })
      .catch(() => {
        if (alive) setAds([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const buy = async (ad: RoomAd) => {
    setBusy(true);
    try {
      const result = await api<{ giftName: string; balance: number; bagQuantity: number }>(
        `/room-ads/${ad.id}/buy`,
        {
          method: 'POST',
          body: { requestId: `room-ad-${ad.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
        }
      );
      toast.push(`«${result.giftName}» صارت في جنطة هداياك 🎁`, 'success');
      setConfirm(null);
    } catch (err) {
      const code = (err as { code?: string }).code;
      toast.push(
        code === 'insufficient_coins'
          ? 'رصيدك من الماسات لا يكفي لهذه الهدية'
          : (err as Error).message || 'تعذّر إتمام الشراء',
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  if (ads.length === 0) return null;

  return (
    <>
      <div className="room-ad-rail" aria-label="إعلانات الغرفة">
        {ads.map((ad) => (
          <button
            key={ad.id}
            type="button"
            className={`room-ad-card${ad.featured ? ' featured' : ''}`}
            onClick={() => setConfirm(ad)}
          >
            <span className="room-ad-art">
              <AdArt gift={ad.gift} />
            </span>
            <span className="room-ad-body">
              {ad.featured ? <span className="room-ad-badge">هدية اليوم</span> : null}
              <b className="room-ad-title">{ad.title}</b>
              <span className="room-ad-price">
                <Icon name="sparkle" size={10} /> {formatCoins(ad.price)} ماسة
              </span>
            </span>
            <span className="room-ad-go" aria-hidden="true">
              <Icon name="arrowLeft" size={12} />
            </span>
          </button>
        ))}
      </div>

      <Sheet open={Boolean(confirm)} onClose={() => (busy ? null : setConfirm(null))} title="متجر الهدايا اليومي">
        {confirm ? (
          <div className="room-ad-confirm">
            <div className="room-ad-confirm-art">
              <AdArt gift={confirm.gift} />
            </div>
            <b className="room-ad-confirm-name">{confirm.title}</b>
            <span className="tiny muted center">
              تُضاف الهدية إلى جنطة هداياك وتقدر ترسلها لأي شخص بدون دفع مرة ثانية.
            </span>
            <span className="room-ad-confirm-price">
              <Icon name="sparkle" size={14} /> {formatCoins(confirm.price)} ماسة
            </span>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busy}
              onClick={() => void buy(confirm)}
            >
              {busy ? 'جارٍ الشراء…' : 'شراء وإضافة للجنطة'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block btn-sm"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              إلغاء
            </button>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
