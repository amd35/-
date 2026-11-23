import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useRealtime } from './realtime';

/**
 * Ads & events, served live by the admin panel.
 *
 * The same list feeds the home carousel (rows with `showBanner`), the popup
 * shown when the app opens (rows with `showPopup`) and the /ads page. Each view
 * is sent once per browser session and deduped again on the server per user/day;
 * every click is sent as it happens.
 */

export interface AdItem {
  id: string;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  linkUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  isActive: boolean;
  showBanner: boolean;
  showPopup: boolean;
  viewCount: number;
  clickCount: number;
  isLive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The copy in the current language, falling back to the other one when it is empty. */
export function adText(lang: 'ar' | 'en', ar: string, en: string): string {
  const primary = (lang === 'ar' ? ar : en).trim();
  if (primary) return primary;
  return (lang === 'ar' ? en : ar).trim();
}

function readSession(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeSession(key: string): void {
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    /* storage disabled */
  }
}

export function trackAdView(id: string): void {
  const key = `connect_ad_view_${id}`;
  if (readSession(key)) return;
  writeSession(key);
  void api(`/ads/${id}/view`, { method: 'POST' }).catch(() => undefined);
}

export function trackAdClick(id: string): void {
  void api(`/ads/${id}/click`, { method: 'POST' }).catch(() => undefined);
}

export function adPopupSeen(id: string): boolean {
  return readSession(`connect_ad_popup_${id}`);
}

export function markAdPopupSeen(id: string): void {
  writeSession(`connect_ad_popup_${id}`);
}

export function useAds() {
  const [ads, setAds] = useState<AdItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useRealtime();

  const reload = useCallback(async () => {
    try {
      const response = await api<{ ads: AdItem[] }>('/ads');
      setAds(response.ads);
    } catch {
      /* keep the last known list when the API is unreachable */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => on('ads', () => void reload()), [on, reload]);

  return { ads, loading, reload };
}
