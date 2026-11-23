import { Capacitor } from '@capacitor/core';

/**
 * Native / web notification bridge for Yalla Phone.
 *
 * - Native Android: Capacitor Local Notifications, with three Android channels
 *   (friend messages, system notices, "we miss you" come-back reminders) so each
 *   kind keeps its own sound, colour and importance.
 * - Browser: the Web Notification API, used only after the user grants permission.
 *
 * The plugin is imported dynamically so the browser bundle never ships it.
 */

export type NotifyKind = 'message' | 'system' | 'reengage';

export interface AppNotifyPayload {
  kind: NotifyKind;
  title: string;
  body: string;
  /** Android expanded text (the notification grows when opened). */
  largeBody?: string;
  /** In-app route opened when the notification is tapped. */
  route?: string;
}

export const APP_NAME = 'يلا فون';
export const COME_BACK_ID = 7301;
export const COME_BACK_TEXT = 'أهلا صار هواي ماشايفينك تعال يا نغل';
export const COME_BACK_HOURS = 5;

const CHANNEL: Record<NotifyKind, string> = {
  message: 'yalal_messages',
  system: 'yalal_system',
  reengage: 'yalal_reengage',
};

export const isNativeApp = Capacitor.isNativePlatform();

let pluginPromise: Promise<typeof import('@capacitor/local-notifications')> | null = null;
const plugin = () => (pluginPromise ??= import('@capacitor/local-notifications'));

/** Android channels must exist before the first notification is posted. */
export async function setupNotificationChannels(): Promise<void> {
  if (!isNativeApp) return;
  try {
    const { LocalNotifications } = await plugin();
    await LocalNotifications.createChannel({
      id: CHANNEL.message,
      name: 'رسائل الأصدقاء',
      description: 'إشعارات الرسائل الجديدة في يلا فون',
      importance: 5,
      visibility: 1,
      lights: true,
      lightColor: '#ff3ea5',
      vibration: true,
    });
    await LocalNotifications.createChannel({
      id: CHANNEL.system,
      name: 'إشعارات يلا فون',
      description: 'إشعارات النظام والإدارة',
      importance: 4,
      visibility: 1,
      lights: true,
      lightColor: '#f6c453',
      vibration: true,
    });
    await LocalNotifications.createChannel({
      id: CHANNEL.reengage,
      name: 'رسائل الشوق',
      description: 'تذكير ودّي عند الابتعاد عن التطبيق',
      importance: 3,
      visibility: 1,
      lights: true,
      lightColor: '#a855f7',
      vibration: true,
    });
  } catch {
    /* channels are best-effort; the notification still posts on the default one */
  }
}

/** Current permission state without prompting. */
export async function notificationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (isNativeApp) {
    try {
      const { LocalNotifications } = await plugin();
      const { display } = await LocalNotifications.checkPermissions();
      if (display === 'granted') return 'granted';
      return display === 'denied' ? 'denied' : 'prompt';
    } catch {
      return 'denied';
    }
  }
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission === 'granted'
    ? 'granted'
    : Notification.permission === 'denied'
      ? 'denied'
      : 'prompt';
}

/** Asks the OS for permission — call this from a real tap. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (isNativeApp) {
    try {
      const { LocalNotifications } = await plugin();
      let { display } = await LocalNotifications.checkPermissions();
      if (display !== 'granted') {
        const asked = await LocalNotifications.requestPermissions();
        display = asked.display;
      }
      if (display === 'granted') await setupNotificationChannels();
      return display === 'granted';
    } catch {
      return false;
    }
  }
  if (typeof Notification === 'undefined') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

let nextId = 2000;
const numericId = () => {
  nextId = nextId >= 2_000_000_000 ? 2000 : nextId + 1;
  return nextId;
};

/** Posts one notification right now (used for messages arriving while the app is in the background). */
export async function showNotification(payload: AppNotifyPayload): Promise<void> {
  if (isNativeApp) {
    try {
      const { LocalNotifications } = await plugin();
      await LocalNotifications.schedule({
        notifications: [
          {
            id: numericId(),
            title: payload.title,
            body: payload.body,
            largeBody: payload.largeBody ?? payload.body,
            summaryText: APP_NAME,
            channelId: CHANNEL[payload.kind],
            smallIcon: 'ic_stat_yalal',
            largeIcon: 'ic_notification_logo',
            iconColor: payload.kind === 'message' ? '#ff3ea5' : '#f6c453',
            autoCancel: true,
            group: 'yalal',
            extra: { route: payload.route ?? null, kind: payload.kind },
          },
        ],
      });
    } catch {
      /* permission missing or plugin unavailable */
    }
    return;
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(payload.title, {
      body: payload.body,
      icon: '/favicon.png',
      badge: '/favicon.png',
      tag: `yalal-${payload.kind}`,
    });
  } catch {
    /* Chrome on Android needs a service worker; the in-app card still shows */
  }
}

/**
 * Schedules the "we miss you" reminder for when the user leaves the app.
 * Called on background; cancelled the moment the app comes back.
 */
export async function scheduleComeBack(hours = COME_BACK_HOURS): Promise<void> {
  if (!isNativeApp) return;
  try {
    const { LocalNotifications } = await plugin();
    await LocalNotifications.cancel({ notifications: [{ id: COME_BACK_ID }] }).catch(() => undefined);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: COME_BACK_ID,
          title: APP_NAME,
          body: COME_BACK_TEXT,
          largeBody: `${COME_BACK_TEXT} 💜 عندك رسايل وهدايا تنتظرك داخل يلا فون.`,
          summaryText: APP_NAME,
          channelId: CHANNEL.reengage,
          smallIcon: 'ic_stat_yalal',
          largeIcon: 'ic_notification_logo',
          iconColor: '#a855f7',
          autoCancel: true,
          extra: { route: '/', kind: 'reengage' },
          schedule: { at: new Date(Date.now() + hours * 60 * 60 * 1000) },
        },
      ],
    });
  } catch {
    /* permission missing — nothing to do */
  }
}

export async function cancelComeBack(): Promise<void> {
  if (!isNativeApp) return;
  try {
    const { LocalNotifications } = await plugin();
    await LocalNotifications.cancel({ notifications: [{ id: COME_BACK_ID }] }).catch(() => undefined);
  } catch {
    /* ignore */
  }
}

/** Fires when the user taps a notification; the route is the in-app destination. */
export function onNotificationTap(handler: (route: string | null) => void): () => void {
  if (!isNativeApp) return () => undefined;
  let remove: (() => void) | null = null;
  let disposed = false;
  void (async () => {
    try {
      const { LocalNotifications } = await plugin();
      const listener = await LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (event) => {
          const route = event.notification.extra?.route;
          handler(typeof route === 'string' && route.startsWith('/') ? route : null);
        }
      );
      if (disposed) void listener.remove();
      else remove = () => void listener.remove();
    } catch {
      /* ignore */
    }
  })();
  return () => {
    disposed = true;
    remove?.();
  };
}
