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
  const [randomPrice, setRandomPrice] = useState(500);
  const [confirm, setConfirm] = useState<RoomAd | null>(null);
  const [busy, setBusy] = useState(false);
  const [rollBusy, setRollBusy] = useState(false);
  const [won, setWon] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ ads: RoomAd[]; randomGift?: { price: number } }>('/room-ads')
      .then((data) => {
        if (!alive) return;
        setAds(data.ads ?? []);
        if (data.randomGift?.price) setRandomPrice(data.randomGift.price);
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

  /** «هدية عشوائية»: a mystery box from the daily store, straight into the bag. */
  const openRandom = async () => {
    setRollBusy(true);
    try {
      const result = await api<{ giftName: string }>('/room-ads/random-gift', {
        method: 'POST',
        body: { requestId: `random-gift-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
      });
      setWon(result.giftName);
      toast.push(`مبروك! «${result.giftName}» صارت في جنطة هداياك 🎁`, 'success');
    } catch (err) {
      const code = (err as { code?: string }).code;
      toast.push(
        code === 'insufficient_coins'
          ? 'رصيدك من الماسات لا يكفي لهذه الهدية'
          : (err as Error).message || 'تعذّر فتح الهدية',
        'error'
      );
    } finally {
      setRollBusy(false);
    }
  };

  const ad = ads[0];
  if (!ad) return null;

  return (
    <>
      <div className="room-ad-rail" aria-label="إعلانات الغرفة">
        <button
          type="button"
          className={`room-ad-card${ad.featured ? ' featured' : ''}`}
          onClick={() => {
            setWon(null);
            setConfirm(ad);
          }}
        >
          <span className="room-ad-art">
            <AdArt gift={ad.gift} />
          </span>
          {ad.featured ? <span className="room-ad-badge">هدية اليوم</span> : null}
          <span className="room-ad-body">
            <b className="room-ad-title">{ad.title}</b>
            <span className="room-ad-price">
              <Icon name="sparkle" size={10} /> {formatCoins(ad.price)} ماسة
            </span>
          </span>
        </button>
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

            <div className="room-ad-random">
              <b className="room-ad-random-title">🎁 هدية عشوائية</b>
              <span className="tiny muted center">
                افتح صندوقك واحصل على هدية عشوائية من المتجر — تنضاف لجنطة هداياك.
              </span>
              <span className="room-ad-confirm-price">
                <Icon name="sparkle" size={14} /> {formatCoins(randomPrice)} ماسة
              </span>
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={rollBusy}
                onClick={() => void openRandom()}
              >
                {rollBusy ? 'جارٍ الفتح…' : 'افتح هدية عشوائية'}
              </button>
              {won ? <span className="room-ad-won">ربحت: {won}</span> : null}
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}
