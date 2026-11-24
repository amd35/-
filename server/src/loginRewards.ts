import type { PoolClient } from 'pg';
import { one, q, tx } from './db';
import { addToBag } from './giftBag';
import { notifyWith } from './notify';
import { HttpError, iraqDateStr, nextIraqMidnight } from './utils';
import { moveCoins } from './wallet';

/**
 * «مكافأة الدخول الأسبوعية» — a 7-day login streak.
 *
 * Every Baghdad day the user can claim the next day of the current week. Day 7
 * is the grand prize (diamonds + gifts into the bag + a 7-day room entry effect,
 * equipped automatically). After day 7 the next claim opens a NEW week with a
 * different reward ladder, so the cycle keeps rotating. Missing a day resets the
 * streak and starts the next week from day 1 — the server owns the date, the
 * device clock is never trusted.
 */

export interface LoginRewardGiftLine {
  slug: string;
  quantity: number;
}

export interface LoginRewardDay {
  coins: number;
  gifts: LoginRewardGiftLine[];
  /** Room entry effect handed for `days` days and equipped right away. */
  entry?: { slug: string; days: number };
}

export interface LoginRewardWeek {
  name: string;
  nameEn: string;
  days: LoginRewardDay[];
}

const g = (slug: string, quantity = 1): LoginRewardGiftLine => ({ slug, quantity });

export const LOGIN_REWARD_WEEKS: LoginRewardWeek[] = [
  {
    name: 'أسبوع الانطلاق',
    nameEn: 'Launch Week',
    days: [
      { coins: 500, gifts: [] },
      { coins: 1000, gifts: [] },
      { coins: 0, gifts: [g('roses', 3)] },
      { coins: 1500, gifts: [] },
      { coins: 2500, gifts: [] },
      { coins: 4000, gifts: [g('diamond', 1)] },
      {
        coins: 10000,
        gifts: [g('royal-crown', 1), g('golden-lion', 1), g('treasure', 1)],
        entry: { slug: 'entry-rose', days: 7 },
      },
    ],
  },
  {
    name: 'أسبوع التاج الملكي',
    nameEn: 'Royal Crown Week',
    days: [
      { coins: 800, gifts: [] },
      { coins: 1500, gifts: [] },
      { coins: 0, gifts: [g('hearts', 3)] },
      { coins: 2500, gifts: [] },
      { coins: 4000, gifts: [] },
      { coins: 7000, gifts: [g('diamond', 2)] },
      {
        coins: 20000,
        gifts: [g('royal-yacht', 1), g('private-jet', 1), g('golden-eagle', 1)],
        entry: { slug: 'entry-fireworks', days: 7 },
      },
    ],
  },
  {
    name: 'أسبوع الأسطورة',
    nameEn: 'Legend Week',
    days: [
      { coins: 1200, gifts: [] },
      { coins: 2000, gifts: [] },
      { coins: 0, gifts: [g('kiss-love', 3)] },
      { coins: 4000, gifts: [] },
      { coins: 6000, gifts: [] },
      { coins: 10000, gifts: [g('treasure', 1)] },
      {
        coins: 30000,
        gifts: [
          g('legend-dragon', 1),
          g('royal-yacht', 1),
          g('private-jet', 1),
          g('royal-crown', 1),
        ],
        entry: { slug: 'entry-crown', days: 7 },
      },
    ],
  },
];

const WEEK_LENGTH = 7;

export interface LoginRewardStateRow {
  cycle_no: number;
  day_no: number;
  last_claim_on: string | null;
}

export interface LoginRewardItemView {
  kind: 'coins' | 'gift' | 'entry';
  amount?: number;
  quantity?: number;
  name?: string;
  nameEn?: string;
  design?: string | null;
  coverUrl?: string | null;
  rarity?: string;
  days?: number;
}

export interface LoginRewardDayView {
  day: number;
  items: LoginRewardItemView[];
  claimed: boolean;
  isToday: boolean;
  isGrand: boolean;
}

export interface LoginRewardState {
  cycle: number;
  weekName: string;
  weekNameEn: string;
  day: number;
  claimedDays: number;
  todayClaimed: boolean;
  canClaim: boolean;
  nextDay: number;
  weekComplete: boolean;
  resetsAt: string;
  days: LoginRewardDayView[];
}

function weekFor(cycle: number): LoginRewardWeek {
  return LOGIN_REWARD_WEEKS[(Math.max(1, cycle) - 1) % LOGIN_REWARD_WEEKS.length];
}

async function loadState(userId: string): Promise<LoginRewardStateRow> {
  const row = await one<LoginRewardStateRow>(
    `SELECT cycle_no, day_no, last_claim_on::text AS last_claim_on
     FROM login_reward_state WHERE user_id = $1`,
    [userId]
  );
  return row ?? { cycle_no: 1, day_no: 0, last_claim_on: null };
}

/** Gift + entry rows for a week, resolved once so the calendar shows real names/art. */
async function resolveWeek(week: LoginRewardWeek) {
  const slugs = new Set<string>();
  for (const day of week.days) {
    for (const line of day.gifts) slugs.add(line.slug);
  }
  const gifts = slugs.size
    ? await q<{
        slug: string;
        name: string;
        name_en: string;
        design: string | null;
        cover_url: string | null;
        rarity: string;
      }>(
        `SELECT slug, name, name_en, design, cover_url, rarity
         FROM gifts WHERE slug = ANY($1::text[])`,
        [[...slugs]]
      )
    : [];
  const giftBySlug = new Map(gifts.map((row) => [row.slug, row]));

  const entrySlugs = week.days.map((day) => day.entry?.slug).filter(Boolean) as string[];
  const entries = entrySlugs.length
    ? await q<{ slug: string; name: string; name_en: string; design: string | null; rarity: string }>(
        `SELECT slug, name, name_en, design, rarity
         FROM avatar_frames WHERE slug = ANY($1::text[]) AND category = 'entry'`,
        [entrySlugs]
      )
    : [];
  const entryBySlug = new Map(entries.map((row) => [row.slug, row]));

  return week.days.map((day, index) => {
    const items: LoginRewardItemView[] = [];
    if (day.coins > 0) items.push({ kind: 'coins', amount: day.coins });
    for (const line of day.gifts) {
      const gift = giftBySlug.get(line.slug);
      items.push({
        kind: 'gift',
        quantity: line.quantity,
        name: gift?.name ?? line.slug,
        nameEn: gift?.name_en ?? line.slug,
        design: gift?.design ?? null,
        coverUrl: gift?.cover_url ?? null,
        rarity: gift?.rarity ?? 'common',
      });
    }
    if (day.entry) {
      const entry = entryBySlug.get(day.entry.slug);
      items.push({
        kind: 'entry',
        days: day.entry.days,
        name: entry?.name ?? day.entry.slug,
        nameEn: entry?.name_en ?? day.entry.slug,
        design: entry?.design ?? null,
        rarity: entry?.rarity ?? 'legendary',
      });
    }
    return { day: index + 1, items };
  });
}

export async function getLoginRewardState(userId: string): Promise<LoginRewardState> {
  const state = await loadState(userId);
  const today = iraqDateStr();
  const todayClaimed = state.last_claim_on === today;

  // A finished week (day 7 claimed) shows the completed calendar until tomorrow,
  // when the next claim opens a fresh week.
  const weekCycle = state.day_no >= WEEK_LENGTH ? state.cycle_no : Math.max(1, state.cycle_no);
  const week = weekFor(weekCycle);
  const resolved = await resolveWeek(week);

  const claimedDays = Math.min(state.day_no, WEEK_LENGTH);
  const nextDay = claimedDays >= WEEK_LENGTH ? 1 : claimedDays + 1;
  const weekComplete = claimedDays >= WEEK_LENGTH;

  const days: LoginRewardDayView[] = resolved.map((day) => ({
    ...day,
    claimed: day.day <= claimedDays,
    isToday: !weekComplete && !todayClaimed && day.day === nextDay,
    isGrand: day.day === WEEK_LENGTH,
  }));

  return {
    cycle: weekCycle,
    weekName: week.name,
    weekNameEn: week.nameEn,
    day: claimedDays,
    claimedDays,
    todayClaimed,
    canClaim: !todayClaimed && !weekComplete,
    nextDay: weekComplete ? 0 : nextDay,
    weekComplete,
    resetsAt: nextIraqMidnight().toISOString(),
    days,
  };
}

export interface LoginRewardGrantView extends LoginRewardItemView {
  label: string;
}

/**
 * Claims the next day of the streak. One claim per Baghdad day; a missed day
 * starts a brand-new week from day 1, so the rewards keep changing.
 */
export async function claimLoginReward(
  userId: string
): Promise<{ granted: LoginRewardGrantView[]; state: LoginRewardState }> {
  const today = iraqDateStr();
  const yesterday = iraqDateStr(new Date(Date.now() - 86_400_000));

  const granted = await tx(async (c: PoolClient) => {
    await c.query('INSERT INTO login_reward_state (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [
      userId,
    ]);
    const { rows } = await c.query<LoginRewardStateRow>(
      `SELECT cycle_no, day_no, last_claim_on::text AS last_claim_on
       FROM login_reward_state WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const state = rows[0];
    if (state.last_claim_on === today) {
      throw new HttpError(409, 'Today’s reward was already claimed', 'login_reward_claimed');
    }

    let cycle = Math.max(1, Number(state.cycle_no));
    let day: number;
    if (state.last_claim_on === yesterday && Number(state.day_no) < WEEK_LENGTH) {
      day = Number(state.day_no) + 1;
    } else if (state.last_claim_on === yesterday && Number(state.day_no) >= WEEK_LENGTH) {
      cycle += 1;
      day = 1;
    } else {
      // First claim, or the streak was broken: open the next week.
      if (state.last_claim_on) cycle += 1;
      day = 1;
    }

    const week = weekFor(cycle);
    const reward = week.days[day - 1];

    // The claim row is written first: its unique (user, week, day) is the guard,
    // and its id is the ledger reference, so a retried claim can never pay twice.
    const claimRow = await c.query<{ id: string }>(
      `INSERT INTO login_reward_claims (user_id, cycle_no, day_no, claimed_on)
       VALUES ($1, $2, $3, $4::date)
       ON CONFLICT (user_id, cycle_no, day_no) DO NOTHING
       RETURNING id`,
      [userId, cycle, day, today]
    );
    if (!claimRow.rowCount) {
      throw new HttpError(409, 'Today’s reward was already claimed', 'login_reward_claimed');
    }
    const claimId = claimRow.rows[0].id;

    if (reward.coins > 0) {
      await moveCoins(c, {
        userId,
        amount: reward.coins,
        type: 'login_reward',
        refType: 'login_reward',
        refId: claimId,
        meta: { cycle, day },
      });
    }

    for (const line of reward.gifts) {
      const gift = await c.query<{ id: string }>('SELECT id FROM gifts WHERE slug = $1', [line.slug]);
      if (gift.rowCount) await addToBag(c, userId, gift.rows[0].id, line.quantity);
    }

    if (reward.entry) {
      const frame = await c.query<{ id: string }>(
        `SELECT id FROM avatar_frames WHERE slug = $1 AND category = 'entry' AND is_active = true`,
        [reward.entry.slug]
      );
      if (frame.rowCount) {
        const itemId = frame.rows[0].id;
        const expiresAt = new Date(Date.now() + reward.entry.days * 86_400_000);
        // Extends an existing copy instead of shortening it.
        await c.query(
          `INSERT INTO user_avatar_frames (user_id, frame_id, expires_at) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, frame_id)
           DO UPDATE SET expires_at = GREATEST(COALESCE(user_avatar_frames.expires_at, EXCLUDED.expires_at), EXCLUDED.expires_at)`,
          [userId, itemId, expiresAt]
        );
        await c.query(
          `INSERT INTO user_cosmetics (user_id, category, item_id) VALUES ($1, 'entry', $2)
           ON CONFLICT (user_id, category) DO UPDATE SET item_id = EXCLUDED.item_id, equipped_at = now()`,
          [userId, itemId]
        );
      }
    }

    await c.query(
      `UPDATE login_reward_state SET cycle_no = $2, day_no = $3, last_claim_on = $4::date, updated_at = now()
       WHERE user_id = $1`,
      [userId, cycle, day, today]
    );

    const resolved = await resolveWeek(week);
    const items = resolved[day - 1].items.map((item) => ({
      ...item,
      label:
        item.kind === 'coins'
          ? `${item.amount} ألماس`
          : item.kind === 'entry'
            ? `${item.name} (${item.days} أيام)`
            : `${item.name} ×${item.quantity}`,
    }));

    await notifyWith(
      c,
      userId,
      'login_reward',
      `مكافأة الدخول — ${week.name} (يوم ${day})`,
      items.map((item) => item.label).join(' • '),
      { cycle, day }
    );

    return items;
  });

  return { granted, state: await getLoginRewardState(userId) };
}
