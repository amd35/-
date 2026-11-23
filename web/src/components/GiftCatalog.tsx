import { useMemo, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon } from '../lib/ui';
import { GiftCover } from './GiftAnimation';
import { FlagThumb, isFlagGift } from './FlagGift';
import { CurrencyIcon } from './CurrencyIcon';

/** Catalog gift fields both gift sheets share. */
export interface CatalogGift {
  id: string;
  name: string;
  nameEn?: string;
  design?: string | null;
  videoUrl?: string | null;
  coverUrl?: string | null;
  rarity: string;
  price: number;
}

export type GiftCategory = 'legendary' | 'vip' | 'epic' | 'common' | 'rare' | 'flags';

const RARITY_LABEL: Record<string, string> = {
  common: 'عادي',
  rare: 'نادر',
  epic: 'ملحمي',
  legendary: 'أسطوري',
  vip: 'VIP',
};

/** Sections in the order the shop shows them: the rarest tiers first, flags last. */
const GIFT_SECTIONS: { key: GiftCategory; label: string }[] = [
  { key: 'legendary', label: RARITY_LABEL.legendary },
  { key: 'vip', label: RARITY_LABEL.vip },
  { key: 'epic', label: RARITY_LABEL.epic },
  { key: 'common', label: RARITY_LABEL.common },
  { key: 'rare', label: RARITY_LABEL.rare },
];

/**
 * The gift grid with a section per rarity (أسطوري، VIP، ملحمي، عادي، نادر) and
 * «أعلام الدول» last. The active section lives in the parent sheet so it
 * survives opening one gift and going back.
 */
export function GiftCatalog<T extends CatalogGift>({
  gifts,
  balance,
  currency,
  category,
  onCategoryChange,
  selectedId,
  onSelect,
}: {
  gifts: T[];
  /** Balance of the currency the sheet is charging in. */
  balance: number;
  currency: 'diamond' | 'gold';
  category: GiftCategory;
  onCategoryChange: (category: GiftCategory) => void;
  selectedId?: string | null;
  onSelect: (gift: T) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');

  const regular = useMemo(() => gifts.filter((gift) => !isFlagGift(gift)), [gifts]);
  const flags = useMemo(() => gifts.filter(isFlagGift), [gifts]);

  const items = useMemo(() => {
    if (category !== 'flags') return regular.filter((gift) => gift.rarity === category);
    const needle = query.trim().toLowerCase();
    if (!needle) return flags;
    return flags.filter((gift) =>
      `${gift.name} ${gift.nameEn ?? ''}`.toLowerCase().includes(needle)
    );
  }, [category, flags, regular, query]);

  const countOf = (key: GiftCategory) =>
    key === 'flags' ? flags.length : regular.filter((gift) => gift.rarity === key).length;

  return (
    <div className="gift-boutique">
      <div className="gift-cats">
        {GIFT_SECTIONS.map((section) => (
          <button
            key={section.key}
            type="button"
            className={`gift-cat rarity-${section.key}${category === section.key ? ' active' : ''}`}
            onClick={() => onCategoryChange(section.key)}
          >
            {section.label}
            <span className="gift-cat-count">{countOf(section.key)}</span>
          </button>
        ))}
        <button
          type="button"
          className={`gift-cat flags${category === 'flags' ? ' active' : ''}`}
          onClick={() => onCategoryChange('flags')}
        >
          {t('giftTabFlags')}
          <span className="gift-cat-count">{flags.length}</span>
        </button>
      </div>

      {category === 'flags' ? (
        <input
          className="input gift-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('giftSearchCountry')}
        />
      ) : null}

      <div className="gift-grid">
        {items.map((gift) => (
          <button
            key={gift.id}
            type="button"
            className={`gift-card ${balance < gift.price ? 'locked' : ''} ${
              selectedId === gift.id ? 'selected' : ''
            }`}
            onClick={() => onSelect(gift)}
          >
            <span className={`gift-rarity-pill rarity-${gift.rarity}`}>
              {RARITY_LABEL[gift.rarity] ?? gift.rarity}
            </span>
            {isFlagGift(gift) ? (
              <FlagThumb design={gift.design} className="gift-card-art" />
            ) : (
              <GiftCover gift={gift} className="gift-card-art" />
            )}
            <span className="gift-card-name">{gift.name}</span>
            <span className="gift-card-price">
              <CurrencyIcon code={currency === 'gold' ? 'GOLD' : 'DIAMOND'} size={12} />{' '}
              {formatCoins(gift.price)}
            </span>
          </button>
        ))}
        {items.length === 0 ? (
          <div className="empty" style={{ gridColumn: '1 / -1' }}>
            <Icon name="gift" size={22} />
            <span className="tiny">{t('noResults')}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
