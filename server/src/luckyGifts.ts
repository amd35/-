import { randomInt } from 'node:crypto';
import type { LuckyPrizeTier } from './settings';

export interface LuckyDraw {
  tier: LuckyPrizeTier;
  /** Index of the drawn rung inside the admin's ladder. */
  index: number;
}

/**
 * Draws one prize rung with the admin's weights. The draw runs on the server with
 * crypto randomness, so a client can neither influence nor predict the result.
 */
export function pickLuckyPrize(tiers: LuckyPrizeTier[]): LuckyDraw {
  const weighted = tiers
    .map((tier, index) => ({ tier, index }))
    .filter((entry) => entry.tier.weight > 0);
  if (!weighted.length) return { tier: { amount: 0, weight: 1 }, index: 0 };

  const total = weighted.reduce((sum, entry) => sum + entry.tier.weight, 0);
  // One-million buckets keep the draw uniform without floating-point edge cases.
  const roll = (randomInt(0, 1_000_000) / 1_000_000) * total;
  let accumulated = 0;
  for (const entry of weighted) {
    accumulated += entry.tier.weight;
    if (roll < accumulated) return { tier: entry.tier, index: entry.index };
  }
  const last = weighted[weighted.length - 1];
  return { tier: last.tier, index: last.index };
}
