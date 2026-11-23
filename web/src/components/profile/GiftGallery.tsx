import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';
import { useRealtime } from '../../lib/realtime';
import { formatCoins, Icon, Spinner } from '../../lib/ui';
import { GiftAnimation, GiftCover } from '../GiftAnimation';

export interface ReceivedGift {
  giftId: string;
  name: string;
  nameEn: string;
  design: string | null;
  videoUrl: string | null;
  coverUrl: string | null;
  rarity: string;
  count: number;
  coins: number;
  lastReceivedAt: string;
  lastSender: { displayName: string; avatarUrl: string | null } | null;
}

const RARITY_LABEL: Record<string, string> = {
  common: 'عادي',
  rare: 'نادر',
  epic: 'ملحمي',
  legendary: 'أسطوري',
  vip: 'VIP',
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ar-IQ', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * 🎁 The permanent gift gallery: every gift this user received, grouped by gift,
 * newest first. Tapping a card plays that gift's animation once (never looping in
 * the grid) so the list stays light.
 */
export function GiftGallery({ userId }: { userId: string }) {
  const { on } = useRealtime();
  const [items, setItems] = useState<ReceivedGift[]>([]);
  const [totals, setTotals] = useState({ count: 0, coins: 0 });
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<ReceivedGift | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api<{ items: ReceivedGift[]; totals: { count: number; coins: number } }>(
        `/users/${userId}/gifts`
      );
      setItems(response.items);
      setTotals(response.totals);
    } catch {
      // A signed-out or removed user simply shows the empty gallery.
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // A new gift lands in the gallery the moment it is broadcast.
  useEffect(() => {
    const offGift = on('room_message', (data) => {
      const message = data.message as { type?: string } | null;
      if (message?.type === 'gift') void load();
    });
    const offWallet = on('wallet:update', () => void load());
    return () => {
      offGift();
      offWallet();
    };
  }, [on, load]);

  return (
    <section className="gift-gallery">
      <div className="gift-gallery-title">
        <span aria-hidden="true">🎁</span>
        معرض الهدايا المستلمة
        <span aria-hidden="true">🎁</span>
      </div>

      <div className="gift-gallery-summary">
        <div>
          <span className="gift-gallery-summary-icon">
            <Icon name="coins" size={16} />
          </span>
          <div>
            <b>{formatCoins(totals.coins)}</b>
            <span>القيمة الإجمالية</span>
          </div>
        </div>
        <div>
          <span className="gift-gallery-summary-icon">
            <Icon name="gift" size={16} />
          </span>
          <div>
            <b>{formatCoins(totals.count)}</b>
            <span>إجمالي الهدايا</span>
          </div>
        </div>
      </div>

      {loading ? (
        <Spinner label="جارٍ تحميل الهدايا…" />
      ) : items.length === 0 ? (
        <div className="gift-gallery-empty">
          <Icon name="gift" size={26} />
          <span>لا توجد هدايا مستلمة بعد</span>
        </div>
      ) : (
        <div className="gift-gallery-grid">
          {items.map((item) => (
            <button
              key={item.giftId}
              type="button"
              className={`gift-gallery-card rarity-${item.rarity}`}
              onClick={() => setActive(item)}
              title={item.name}
            >
              <GiftCover gift={item} className="gift-gallery-art" />
              <span className="gift-gallery-count">×{formatCoins(item.count)}</span>
              <span className={`gift-gallery-rarity rarity-${item.rarity}`}>
                {RARITY_LABEL[item.rarity] ?? item.rarity}
              </span>
              <span className="gift-gallery-name">{item.name}</span>
              <span className="gift-gallery-date" dir="ltr">
                {new Date(item.lastReceivedAt).toLocaleDateString('en-GB')}
              </span>
            </button>
          ))}
        </div>
      )}

      {active
        ? createPortal(
            <div className="gift-gallery-reveal" onClick={() => setActive(null)}>
              <div className="gift-gallery-reveal-card" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  className="gift-gallery-reveal-close"
                  onClick={() => setActive(null)}
                  aria-label="إغلاق"
                >
                  <Icon name="x" size={18} />
                </button>
                <GiftAnimation gift={active} className="gift-gallery-reveal-art" sound loop={false} />
                <h3>{active.name}</h3>
                <div className={`gift-gallery-rarity rarity-${active.rarity}`}>
                  {RARITY_LABEL[active.rarity] ?? active.rarity}
                </div>
                <div className="gift-gallery-reveal-meta">
                  <span>
                    <Icon name="gift" size={13} /> استُلمت ×{formatCoins(active.count)}
                  </span>
                  <span>
                    <Icon name="coins" size={13} /> {formatCoins(active.coins)}
                  </span>
                </div>
                {active.lastSender ? (
                  <p className="tiny muted center">آخر مرسل: {active.lastSender.displayName}</p>
                ) : null}
                <p className="tiny muted center">{formatDate(active.lastReceivedAt)}</p>
              </div>
            </div>,
            document.body
          )
        : null}
    </section>
  );
}
