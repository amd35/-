import { assetUrl } from '../../lib/api';
import { Icon, Sheet, Spinner } from '../../lib/ui';
import type { RoomStoreData } from './types';

/**
 * The room's own store. Every upgrade is defined by the administration (name,
 * artwork, diamond price and the member limit it unlocks); the room owner buys
 * them here and the room keeps them.
 */
export function RoomStoreSheet({
  open,
  onClose,
  data,
  loading,
  busyTier,
  onPurchase,
}: {
  open: boolean;
  onClose: () => void;
  data: RoomStoreData | null;
  loading: boolean;
  busyTier: string | null;
  onPurchase: (tierId: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="متجر الغرفة">
      {loading || !data ? (
        <Spinner label="جارٍ تحميل المتجر" />
      ) : (
        <div className="room-store">
          <div className="room-store-summary">
            <span className="room-store-stat">
              <Icon name="users" size={13} /> السعة {data.capacity.count} / {data.capacity.limit}
            </span>
            <span className="room-store-stat">
              <Icon name="sparkle" size={13} /> رصيدك {data.balance.toLocaleString('en-US')} ماسة
            </span>
          </div>
          {!data.isOwner ? (
            <p className="tiny muted center">المتجر مخصص لصاحب الغرفة — الترقيات ترفع سعة الغرفة للجميع.</p>
          ) : null}

          {data.tiers.length === 0 ? (
            <p className="tiny muted center">لا توجد ترقيات منشورة من الإدارة بعد</p>
          ) : (
            <div className="room-store-grid">
              {data.tiers.map((tier) => (
                <article key={tier.id} className={`room-store-card${tier.owned ? ' owned' : ''}`}>
                  <div className="room-store-art">
                    {tier.imageUrl ? (
                      <img src={assetUrl(tier.imageUrl)} alt={tier.name} loading="lazy" />
                    ) : (
                      <Icon name="sparkle" size={26} />
                    )}
                    {tier.owned ? <span className="room-store-owned">مملوكة</span> : null}
                  </div>
                  <div className="room-store-body">
                    <b>{tier.name}</b>
                    {tier.description ? <span className="tiny muted">{tier.description}</span> : null}
                    <span className="room-store-cap">
                      <Icon name="users" size={12} /> حتى {tier.memberCapacity.toLocaleString('en-US')} عضو
                    </span>
                    {tier.owned ? (
                      <span className="room-store-price done">
                        <Icon name="check" size={13} /> مفعّلة
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={!data.isOwner || busyTier === tier.id}
                        onClick={() => onPurchase(tier.id)}
                      >
                        <Icon name="sparkle" size={13} />{' '}
                        {busyTier === tier.id
                          ? 'جارٍ الشراء…'
                          : `${tier.priceDiamonds.toLocaleString('en-US')} ماسة`}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
