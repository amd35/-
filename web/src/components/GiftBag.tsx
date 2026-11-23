import { useI18n } from '../lib/i18n';
import { formatCoins, Icon } from '../lib/ui';
import { GiftCover } from './GiftAnimation';
import { FlagThumb, isFlagGift } from './FlagGift';
import { CurrencyIcon } from './CurrencyIcon';

/** Gift fields both bag cards and package lines render. */
export interface BagGiftVisual {
  name: string;
  design?: string | null;
  videoUrl?: string | null;
  coverUrl?: string | null;
  rarity?: string;
}

/** A gift the user already owns in «جنطة الهدايا». */
export interface BagGiftItem extends BagGiftVisual {
  id: string;
  nameEn?: string;
  price: number;
  quantity: number;
}

export interface GiftPackageLine extends BagGiftVisual {
  giftId: string;
  nameEn: string;
  price: number;
  quantity: number;
}

export interface GiftPackageInfo {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  coverUrl: string | null;
  price: number;
  isActive: boolean;
  items: GiftPackageLine[];
}

function GiftArt({ gift }: { gift: BagGiftVisual }) {
  return isFlagGift(gift) ? (
    <FlagThumb design={gift.design} className="gift-card-art" />
  ) : (
    <GiftCover gift={gift} className="gift-card-art" />
  );
}

/**
 * «جنطة الهدايا»: every gift the user already owns, with how many copies are
 * left. Picking one opens it so it can be sent without paying again.
 */
export function GiftBagGrid({
  items,
  selectedId,
  onSelect,
}: {
  items: BagGiftItem[];
  selectedId?: string | null;
  onSelect: (gift: BagGiftItem) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="gift-boutique">
      {items.length === 0 ? (
        <div className="empty">
          <Icon name="package" size={22} />
          <span className="tiny center">{t('giftBagEmpty')}</span>
        </div>
      ) : (
        <div className="gift-grid">
          {items.map((gift) => (
            <button
              key={gift.id}
              type="button"
              className={`gift-card gift-bag-card${selectedId === gift.id ? ' selected' : ''}`}
              onClick={() => onSelect(gift)}
            >
              <span className="gift-bag-count">×{gift.quantity}</span>
              <GiftArt gift={gift} />
              <span className="gift-card-name">{gift.name}</span>
              <span className="gift-card-price gift-bag-free">{t('giftBagFree')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * «باقات الهدايا»: admin-defined bundles. Recharging one charges its diamond
 * price once and drops every line into the bag.
 */
export function GiftPackagesGrid({
  packages,
  balance,
  buyingId,
  onBuy,
}: {
  packages: GiftPackageInfo[];
  balance: number;
  buyingId: string | null;
  onBuy: (pkg: GiftPackageInfo) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="gift-boutique">
      {packages.length === 0 ? (
        <div className="empty">
          <Icon name="package" size={22} />
          <span className="tiny center">{t('giftPackageEmpty')}</span>
        </div>
      ) : (
        <div className="gift-pack-grid">
          {packages.map((pkg) => {
            const first = pkg.items[0];
            return (
              <div key={pkg.id} className="gift-pack-card">
                <div className="gift-pack-head">
                  <span className="gift-pack-art">
                    {first ? <GiftArt gift={first} /> : <Icon name="package" size={22} />}
                  </span>
                  <div className="gift-pack-copy">
                    <b>{pkg.name}</b>
                    <span className="tiny muted">{pkg.description || pkg.nameEn}</span>
                  </div>
                  <span className="gift-pack-price">
                    <CurrencyIcon code="DIAMOND" size={13} /> {formatCoins(pkg.price)}
                  </span>
                </div>
                <div className="gift-pack-items">
                  {pkg.items.map((line) => (
                    <span key={line.giftId} className={`gift-pack-item rarity-${line.rarity}`}>
                      {line.name} ×{line.quantity}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-gold btn-block"
                  disabled={buyingId === pkg.id}
                  onClick={() => onBuy(pkg)}
                >
                  {buyingId === pkg.id ? <span className="spinner" /> : <Icon name="package" size={16} />}
                  {t('giftPackageBuy')}
                  {balance < pkg.price ? ` · ${t('buyCoins')}` : ''}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
