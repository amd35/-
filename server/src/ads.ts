import { one, q, tx } from './db';
import { broadcast } from './realtime';
import { HttpError } from './utils';

/**
 * Ads & events managed from the admin panel.
 *
 * One row is one ad: an image or a video plus bilingual copy, an optional link,
 * a schedule window, a manual order, and two placements (home banner carousel
 * and the popup shown when the app opens). The dedicated ads page lists every
 * live row, so it doubles as the events board.
 *
 * Views and clicks are counted per ad. A view is recorded once per user per day
 * (the unique index in `ad_events` makes the increment idempotent), while every
 * click is counted.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AdRow {
  id: string;
  title_ar: string;
  title_en: string;
  body_ar: string;
  body_en: string;
  media_type: 'image' | 'video';
  media_url: string;
  link_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  is_active: boolean;
  show_banner: boolean;
  show_popup: boolean;
  view_count: number;
  click_count: number;
  created_at: string;
  updated_at: string;
}

function isLive(row: AdRow, now: number): boolean {
  if (!row.is_active) return false;
  const start = row.starts_at ? new Date(row.starts_at).getTime() : null;
  const end = row.ends_at ? new Date(row.ends_at).getTime() : null;
  if (start !== null && start > now) return false;
  if (end !== null && end < now) return false;
  return true;
}

export function serializeAd(row: AdRow, now = Date.now()) {
  return {
    id: row.id,
    titleAr: row.title_ar,
    titleEn: row.title_en,
    bodyAr: row.body_ar,
    bodyEn: row.body_en,
    mediaType: row.media_type,
    mediaUrl: row.media_url,
    linkUrl: row.link_url,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    showBanner: row.show_banner,
    showPopup: row.show_popup,
    viewCount: row.view_count,
    clickCount: row.click_count,
    isLive: isLive(row, now),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Everything currently on air, in the order the admin arranged. */
export async function listLiveAds(): Promise<AdRow[]> {
  return q<AdRow>(
    `SELECT * FROM ads
     WHERE is_active
       AND (starts_at IS NULL OR starts_at <= now())
       AND (ends_at IS NULL OR ends_at >= now())
     ORDER BY sort_order ASC, created_at DESC`
  );
}

export async function adminAdsOverview() {
  const rows = await q<AdRow>('SELECT * FROM ads ORDER BY sort_order ASC, created_at DESC');
  return { ads: rows.map((row) => serializeAd(row)) };
}

function assertId(id: string): string {
  if (!UUID_RE.test(id)) throw new HttpError(404, 'Ad not found', 'ad_not_found');
  return id;
}

async function getAd(id: string): Promise<AdRow> {
  const row = await one<AdRow>('SELECT * FROM ads WHERE id = $1', [assertId(id)]);
  if (!row) throw new HttpError(404, 'Ad not found', 'ad_not_found');
  return row;
}

function readText(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function readMediaType(value: unknown): 'image' | 'video' {
  const type = String(value ?? '').trim();
  if (type !== 'image' && type !== 'video') {
    throw new HttpError(400, 'Media type must be image or video', 'invalid_media_type');
  }
  return type;
}

function readMediaUrl(value: unknown): string {
  const url = String(value ?? '').trim();
  if (!url) throw new HttpError(400, 'Upload an image or video first', 'missing_media');
  if (!url.startsWith('/uploads/') && !/^https?:\/\//.test(url)) {
    throw new HttpError(400, 'Media URL is not valid', 'invalid_media');
  }
  return url;
}

function readLink(value: unknown): string | null {
  const url = String(value ?? '').trim();
  if (!url) return null;
  if (!url.startsWith('/') && !/^https?:\/\//.test(url)) {
    throw new HttpError(400, 'Link must start with http(s):// or /', 'invalid_link');
  }
  return url.slice(0, 500);
}

function readDate(value: unknown, message: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new HttpError(400, message, 'invalid_date');
  return date.toISOString();
}

function readWindow(startsAt: unknown, endsAt: unknown) {
  const start = readDate(startsAt, 'Invalid start date');
  const end = readDate(endsAt, 'Invalid end date');
  if (start && end && new Date(end) <= new Date(start)) {
    throw new HttpError(400, 'The end date must be after the start date', 'invalid_window');
  }
  return { startsAt: start, endsAt: end };
}

function readOrder(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const order = Number(value);
  if (!Number.isFinite(order)) throw new HttpError(400, 'Invalid order', 'invalid_order');
  return Math.trunc(order);
}

export interface AdInput {
  titleAr?: unknown;
  titleEn?: unknown;
  bodyAr?: unknown;
  bodyEn?: unknown;
  mediaType?: unknown;
  mediaUrl?: unknown;
  linkUrl?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  sortOrder?: unknown;
  isActive?: unknown;
  showBanner?: unknown;
  showPopup?: unknown;
}

function assertTitle(titleAr: string, titleEn: string): void {
  if (!titleAr && !titleEn) {
    throw new HttpError(400, 'Add a title in Arabic or English', 'missing_title');
  }
}

export async function createAd(input: AdInput): Promise<AdRow> {
  const titleAr = readText(input.titleAr, 160);
  const titleEn = readText(input.titleEn, 160);
  assertTitle(titleAr, titleEn);
  const mediaType = readMediaType(input.mediaType);
  const mediaUrl = readMediaUrl(input.mediaUrl);
  const { startsAt, endsAt } = readWindow(input.startsAt, input.endsAt);

  const row = await one<AdRow>(
    `INSERT INTO ads
       (title_ar, title_en, body_ar, body_en, media_type, media_url, link_url,
        starts_at, ends_at, sort_order, is_active, show_banner, show_popup)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      titleAr,
      titleEn,
      readText(input.bodyAr, 1000),
      readText(input.bodyEn, 1000),
      mediaType,
      mediaUrl,
      readLink(input.linkUrl),
      startsAt,
      endsAt,
      readOrder(input.sortOrder, 0),
      input.isActive !== false,
      input.showBanner !== false,
      input.showPopup === true,
    ]
  );

  broadcast('ads', { id: row!.id });
  return row!;
}

export async function updateAd(id: string, body: AdInput): Promise<AdRow> {
  const current = await getAd(id);

  const titleAr = body.titleAr === undefined ? current.title_ar : readText(body.titleAr, 160);
  const titleEn = body.titleEn === undefined ? current.title_en : readText(body.titleEn, 160);
  assertTitle(titleAr, titleEn);
  const mediaType = body.mediaType === undefined ? current.media_type : readMediaType(body.mediaType);
  const mediaUrl = body.mediaUrl === undefined ? current.media_url : readMediaUrl(body.mediaUrl);
  const { startsAt, endsAt } = readWindow(
    body.startsAt === undefined ? current.starts_at : body.startsAt,
    body.endsAt === undefined ? current.ends_at : body.endsAt
  );

  const row = await one<AdRow>(
    `UPDATE ads SET
       title_ar = $2, title_en = $3, body_ar = $4, body_en = $5,
       media_type = $6, media_url = $7, link_url = $8,
       starts_at = $9, ends_at = $10, sort_order = $11,
       is_active = $12, show_banner = $13, show_popup = $14, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      titleAr,
      titleEn,
      body.bodyAr === undefined ? current.body_ar : readText(body.bodyAr, 1000),
      body.bodyEn === undefined ? current.body_en : readText(body.bodyEn, 1000),
      mediaType,
      mediaUrl,
      body.linkUrl === undefined ? current.link_url : readLink(body.linkUrl),
      startsAt,
      endsAt,
      readOrder(body.sortOrder, current.sort_order),
      body.isActive === undefined ? current.is_active : Boolean(body.isActive),
      body.showBanner === undefined ? current.show_banner : Boolean(body.showBanner),
      body.showPopup === undefined ? current.show_popup : Boolean(body.showPopup),
    ]
  );

  broadcast('ads', { id });
  return row!;
}

export async function toggleAd(id: string): Promise<AdRow> {
  const row = await one<AdRow>(
    'UPDATE ads SET is_active = NOT is_active, updated_at = now() WHERE id = $1 RETURNING *',
    [assertId(id)]
  );
  if (!row) throw new HttpError(404, 'Ad not found', 'ad_not_found');
  broadcast('ads', { id });
  return row;
}

/** Swaps the ad with its neighbour and renumbers the whole list, so equal stored orders stay stable. */
export async function moveAd(id: string, direction: unknown): Promise<void> {
  const dir = String(direction ?? '');
  if (dir !== 'up' && dir !== 'down') {
    throw new HttpError(400, 'Direction must be up or down', 'invalid_direction');
  }
  const rows = await q<AdRow>('SELECT * FROM ads ORDER BY sort_order ASC, created_at DESC');
  const index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new HttpError(404, 'Ad not found', 'ad_not_found');
  const target = dir === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= rows.length) return;

  const ids = rows.map((row) => row.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];
  await tx(async (client) => {
    for (let position = 0; position < ids.length; position += 1) {
      await client.query('UPDATE ads SET sort_order = $2, updated_at = now() WHERE id = $1', [
        ids[position],
        position,
      ]);
    }
  });
  broadcast('ads', { id });
}

export async function deleteAd(id: string): Promise<void> {
  const row = await one<{ id: string }>('DELETE FROM ads WHERE id = $1 RETURNING id', [assertId(id)]);
  if (!row) throw new HttpError(404, 'Ad not found', 'ad_not_found');
  broadcast('ads', { id });
}

/**
 * Records one interaction. A view counts once per user per day; every click counts.
 * Returns whether the counter actually moved.
 */
export async function recordAdEvent(
  id: string,
  userId: string,
  kind: 'view' | 'click'
): Promise<boolean> {
  const adId = assertId(id);
  if (kind === 'view') {
    const inserted = await one<{ id: string }>(
      `INSERT INTO ad_events (ad_id, user_id, kind)
       VALUES ($1, $2, 'view')
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [adId, userId]
    );
    if (!inserted) return false;
    await q('UPDATE ads SET view_count = view_count + 1 WHERE id = $1', [adId]);
    return true;
  }

  const exists = await one<{ id: string }>('SELECT id FROM ads WHERE id = $1', [adId]);
  if (!exists) throw new HttpError(404, 'Ad not found', 'ad_not_found');
  await q(`INSERT INTO ad_events (ad_id, user_id, kind) VALUES ($1, $2, 'click')`, [adId, userId]);
  await q('UPDATE ads SET click_count = click_count + 1 WHERE id = $1', [adId]);
  return true;
}
