import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { api, assetUrl } from './api';
import { useRealtime } from './realtime';

/**
 * Admin-managed app artwork.
 *
 * `GET /api/backgrounds` returns the live image of every slot, so the welcome and
 * login screens (signed out) see the same backgrounds as the app. Publishing a
 * new image in the admin panel pushes a realtime event and every open client
 * reloads the map without a rebuild or reinstall.
 */

export type BackgroundMap = Record<string, string>;

interface BackgroundsValue {
  backgrounds: BackgroundMap;
  reload: () => Promise<void>;
}

const BackgroundsContext = createContext<BackgroundsValue | null>(null);

export function BackgroundsProvider({ children }: { children: ReactNode }) {
  const [backgrounds, setBackgrounds] = useState<BackgroundMap>({});
  const { on } = useRealtime();

  const reload = useCallback(async () => {
    try {
      const response = await api<{ backgrounds: { slot: string; url: string }[] }>('/backgrounds');
      const next: BackgroundMap = {};
      for (const item of response.backgrounds) next[item.slot] = item.url;
      setBackgrounds(next);
    } catch {
      /* keep the last known backgrounds when the API is unreachable */
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => on('backgrounds', () => void reload()), [on, reload]);

  const value = useMemo(() => ({ backgrounds, reload }), [backgrounds, reload]);
  return <BackgroundsContext.Provider value={value}>{children}</BackgroundsContext.Provider>;
}

export function useBackgrounds(): BackgroundsValue {
  const context = useContext(BackgroundsContext);
  if (!context) throw new Error('useBackgrounds must be used inside BackgroundsProvider');
  return context;
}

const PAGE_SLOTS: [RegExp, string][] = [
  [/^\/chats/, 'page_chats'],
  [/^\/rooms/, 'page_rooms'],
  [/^\/wallet/, 'page_wallet'],
  [/^\/(profile|u\/)/, 'page_profile'],
  [/^\/settings/, 'page_settings'],
  [/^\/$/, 'page_home'],
];

/** The background slot a route reads, before falling back to the generic one. */
export function slotForPath(pathname: string): string {
  if (pathname === '/welcome') return 'splash';
  if (pathname === '/login' || pathname === '/register' || pathname === '/forgot') return 'login';
  for (const [pattern, slot] of PAGE_SLOTS) {
    if (pattern.test(pathname)) return slot;
  }
  return 'pages';
}

/**
 * Paints the admin-chosen image behind the current screen. `app_main` is the base
 * backdrop (body::before); the per-screen slot layers over it with a scrim so
 * text stays readable.
 */
export function BackgroundLayer() {
  const { backgrounds } = useBackgrounds();
  const { pathname } = useLocation();
  // The admin panel keeps its own neutral look; user-facing backgrounds never style it.
  const onAdmin = pathname.startsWith('/admin');
  const appMain = onAdmin ? undefined : assetUrl(backgrounds.app_main);
  const pageUrl = onAdmin ? undefined : assetUrl(backgrounds[slotForPath(pathname)] || backgrounds.pages);

  useEffect(() => {
    const root = document.documentElement;
    if (appMain) root.style.setProperty('--app-bg-image', `url("${appMain}")`);
    else root.style.removeProperty('--app-bg-image');
  }, [appMain]);

  if (!pageUrl) return null;
  return (
    <div className="page-bg" aria-hidden="true">
      <div className="page-bg-image" style={{ backgroundImage: `url("${pageUrl}")` }} />
    </div>
  );
}
