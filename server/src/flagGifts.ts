import { q } from './db';
import { FLAG_COUNTRIES } from './flagCountries';

/** Stored in `gifts.design` for the country-flag category (e.g. `flag:iq`). */
export const FLAG_DESIGN_PREFIX = 'flag:';

/** One price for every country flag gift (diamonds). */
export const FLAG_GIFT_PRICE = 1000;

/** Flags are listed after the hand-made gifts in the catalog. */
const FLAG_SORT_BASE = 5000;

/**
 * Seeds one gift row per country so «أعلام الدول» is a normal gift category:
 * every flag then reuses the existing pricing, split, chat message and realtime
 * announcement paths, and the client renders its animated water-flag scene from
 * `design = 'flag:<iso>'`.
 *
 * Idempotent: the slug is unique, so a boot never duplicates or overwrites a row
 * an admin has already edited.
 */
export async function ensureFlagGifts(): Promise<void> {
  if (FLAG_COUNTRIES.length === 0) return;

  const slugs: string[] = [];
  const names: string[] = [];
  const namesEn: string[] = [];
  const descriptions: string[] = [];
  const designs: string[] = [];
  const prices: number[] = [];
  const rarities: string[] = [];
  const sortOrders: number[] = [];

  FLAG_COUNTRIES.forEach((country, index) => {
    slugs.push(`flag-${country.code.toLowerCase()}`);
    names.push(`علم ${country.ar}`);
    namesEn.push(`Flag of ${country.en}`);
    descriptions.push(`علم ${country.ar} بإطار ذهبي وتأثير مائي متحرك`);
    designs.push(`${FLAG_DESIGN_PREFIX}${country.code.toLowerCase()}`);
    prices.push(FLAG_GIFT_PRICE);
    rarities.push('rare');
    sortOrders.push(FLAG_SORT_BASE + index);
  });

  await q(
    `INSERT INTO gifts (slug, name, name_en, description, design, price, rarity, sort_order)
     SELECT * FROM unnest(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
       $6::int[], $7::text[], $8::int[]
     )
     ON CONFLICT (slug) DO NOTHING`,
    [slugs, names, namesEn, descriptions, designs, prices, rarities, sortOrders]
  );
}
