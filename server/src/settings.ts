import { q } from './db';

/** Visual intensity of a room gift announcement, chosen per gift rarity. */
export type GiftAnnouncementEffect = 'light' | 'medium' | 'strong';

export const GIFT_RARITY_EFFECT_DEFAULTS: Record<string, GiftAnnouncementEffect> = {
  common: 'light',
  rare: 'medium',
  epic: 'strong',
  legendary: 'strong',
  vip: 'strong',
};

export interface AppSettings {
  voice_price: number;
  video_price: number;
  paid_calls_enabled: boolean;
  free_calls_enabled: boolean;
  free_calls_per_day: number;
  free_calls_shared: boolean;
  free_calls_exempt_user_ids: string[];
  admin_percent: number;
  host_percent: number;
  min_withdrawal_coins: number;
  coin_to_iqd_rate: number;
  coin_to_usd_rate: number;
  gifts_enabled: boolean;
  gift_recipient_percent: number;
  gift_admin_percent: number;
  /** Room gift announcement bar: master switch, timing, look and scope. */
  gift_announcements_enabled: boolean;
  /** How long one announcement stays on screen (seconds). */
  gift_announcement_duration: number;
  /** Sparkles / hearts around the bar. */
  gift_announcement_effects: boolean;
  /** Fiery red accent of the bar. */
  gift_announcement_color: string;
  /** Golden glow of the bar. */
  gift_announcement_glow: string;
  /** `all` announces every gift; `selected` only the ids below. */
  gift_announcement_scope: 'all' | 'selected';
  gift_announcement_gift_ids: string[];
  gift_announcement_rarity_effects: Record<string, GiftAnnouncementEffect>;
  /** Show a user's coin balance to other users on their profile card. */
  profile_show_balances: boolean;
  /** Play the royal level-up celebration (animation + sound) when a user levels up. */
  level_up_effects: boolean;
  cup_enabled: boolean;
  /** Share of the gold spent inside a room that goes to its owner (rest → admin). */
  cup_owner_percent: number;
  cup_period: 'daily' | 'weekly' | 'monthly';
  cup_prize_1: number;
  cup_prize_2: number;
  cup_prize_3: number;
  app_name: string;
  support_contact: string;
}

export const SETTINGS_DEFAULTS: AppSettings = {
  voice_price: 100,
  video_price: 100,
  paid_calls_enabled: true,
  free_calls_enabled: true,
  free_calls_per_day: 5,
  free_calls_shared: true,
  free_calls_exempt_user_ids: [],
  admin_percent: 50,
  host_percent: 50,
  min_withdrawal_coins: 1000,
  coin_to_iqd_rate: 5,
  coin_to_usd_rate: 0.001,
  gifts_enabled: true,
  gift_recipient_percent: 60,
  gift_admin_percent: 40,
  gift_announcements_enabled: true,
  gift_announcement_duration: 5,
  gift_announcement_effects: true,
  gift_announcement_color: '#ff2d2d',
  gift_announcement_glow: '#ffd45e',
  gift_announcement_scope: 'all',
  gift_announcement_gift_ids: [],
  gift_announcement_rarity_effects: { ...GIFT_RARITY_EFFECT_DEFAULTS },
  profile_show_balances: true,
  level_up_effects: true,
  cup_enabled: true,
  cup_owner_percent: 50,
  cup_period: 'weekly',
  cup_prize_1: 5000,
  cup_prize_2: 2000,
  cup_prize_3: 1000,
  app_name: 'Connect+',
  support_contact: 'support@connectplus.app',
};

let cache: AppSettings | null = null;

export async function getSettings(force = false): Promise<AppSettings> {
  if (cache && !force) return cache;
  const rows = await q<{ key: string; value: unknown }>('SELECT key, value FROM app_settings');
  const settings: AppSettings = { ...SETTINGS_DEFAULTS };
  for (const row of rows) {
    if (row.key in settings) {
      (settings as unknown as Record<string, unknown>)[row.key] = row.value;
    }
  }
  cache = settings;
  return settings;
}

export function invalidateSettings(): void {
  cache = null;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function readHexColor(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim();
  return HEX_COLOR.test(text) ? text.toLowerCase() : fallback;
}

/** Keeps a known effect level for every rarity, filling gaps with the default. */
function readRarityEffects(value: unknown): Record<string, GiftAnnouncementEffect> {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const out: Record<string, GiftAnnouncementEffect> = {};
  for (const [rarity, fallback] of Object.entries(GIFT_RARITY_EFFECT_DEFAULTS)) {
    const level = source[rarity];
    out[rarity] =
      level === 'light' || level === 'medium' || level === 'strong' ? level : fallback;
  }
  return out;
}

const COERCE: Record<string, (value: unknown) => unknown> = {
  voice_price: (v) => Math.max(0, Math.trunc(Number(v) || 0)),
  video_price: (v) => Math.max(0, Math.trunc(Number(v) || 0)),
  paid_calls_enabled: (v) => Boolean(v),
  free_calls_enabled: (v) => Boolean(v),
  free_calls_per_day: (v) => Math.min(100, Math.max(0, Math.trunc(Number(v) || 0))),
  free_calls_shared: (v) => Boolean(v),
  free_calls_exempt_user_ids: (v) => (Array.isArray(v) ? v.map(String).slice(0, 500) : []),
  admin_percent: (v) => Math.min(100, Math.max(0, Math.trunc(Number(v) || 0))),
  host_percent: (v) => Math.min(100, Math.max(0, Math.trunc(Number(v) || 0))),
  min_withdrawal_coins: (v) => Math.max(0, Math.trunc(Number(v) || 0)),
  coin_to_iqd_rate: (v) => Math.max(0, Number(v) || 0),
  coin_to_usd_rate: (v) => Math.max(0, Number(v) || 0),
  gifts_enabled: (v) => Boolean(v),
  gift_recipient_percent: (v) => Math.min(100, Math.max(0, Math.trunc(Number(v) || 0))),
  gift_admin_percent: (v) => Math.min(100, Math.max(0, Math.trunc(Number(v) || 0))),
  gift_announcements_enabled: (v) => Boolean(v),
  gift_announcement_duration: (v) => Math.min(15, Math.max(2, Math.trunc(Number(v) || 5))),
  gift_announcement_effects: (v) => Boolean(v),
  gift_announcement_color: (v) => readHexColor(v, '#ff2d2d'),
  gift_announcement_glow: (v) => readHexColor(v, '#ffd45e'),
  gift_announcement_scope: (v) => (v === 'selected' ? 'selected' : 'all'),
  gift_announcement_gift_ids: (v) => (Array.isArray(v) ? v.map(String).slice(0, 500) : []),
  gift_announcement_rarity_effects: (v) => readRarityEffects(v),
  profile_show_balances: (v) => Boolean(v),
  level_up_effects: (v) => Boolean(v),
  cup_enabled: (v) => Boolean(v),
  cup_owner_percent: (v) => Math.min(100, Math.max(0, Math.trunc(Number(v) || 0))),
  cup_period: (v) =>
    v === 'daily' || v === 'weekly' || v === 'monthly' ? v : 'weekly',
  cup_prize_1: (v) => Math.max(0, Math.trunc(Number(v) || 0)),
  cup_prize_2: (v) => Math.max(0, Math.trunc(Number(v) || 0)),
  cup_prize_3: (v) => Math.max(0, Math.trunc(Number(v) || 0)),
  app_name: (v) => String(v || 'Connect+').slice(0, 60),
  support_contact: (v) => String(v || '').slice(0, 120),
};

/** Only whitelisted keys are persisted; percentages are kept summing to 100. */
export async function updateSettings(patch: Record<string, unknown>): Promise<AppSettings> {
  const current = await getSettings(true);
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const coerce = COERCE[key];
    if (!coerce) continue;
    next[key] = coerce(value);
  }
  if ('admin_percent' in patch || 'host_percent' in patch) {
    const admin = Number(next.admin_percent);
    next.host_percent = 100 - admin;
  }
  if ('gift_recipient_percent' in patch || 'gift_admin_percent' in patch) {
    const recipient = Number(next.gift_recipient_percent);
    next.gift_admin_percent = 100 - recipient;
  }
  for (const [key, value] of Object.entries(next)) {
    if (!(key in COERCE)) continue;
    await q('UPDATE app_settings SET value = $2::jsonb, updated_at = now() WHERE key = $1', [
      key,
      JSON.stringify(value),
    ]);
  }
  invalidateSettings();
  return getSettings(true);
}
