import { api } from './api';

interface CapacitorPushPlugin {
  requestPermissions: () => Promise<{ receive?: string }>;
  register: () => Promise<void>;
  addListener: (
    event: string,
    handler: (payload: { value?: string }) => void
  ) => Promise<unknown> | unknown;
}

/**
 * Registers the native device's FCM token with the API so announcements can be
 * delivered as push notifications. No-op in a browser and in shells that do not
 * ship the Capacitor push plugin — the in-app realtime channel still works.
 */
export async function registerPushToken(): Promise<void> {
  const capacitor = (window as unknown as {
    Capacitor?: { Plugins?: { PushNotifications?: CapacitorPushPlugin }; getPlatform?: () => string };
  }).Capacitor;
  const plugin = capacitor?.Plugins?.PushNotifications;
  if (!plugin) return;
  try {
    const permission = await plugin.requestPermissions();
    if (permission?.receive !== 'granted') return;
    await plugin.addListener('registration', (payload) => {
      const token = payload?.value;
      if (!token) return;
      void api('/push/register', {
        method: 'POST',
        body: { token, platform: capacitor?.getPlatform?.() || 'android' },
      }).catch(() => undefined);
    });
    await plugin.register();
  } catch {
    /* native push is unavailable in this shell */
  }
}
