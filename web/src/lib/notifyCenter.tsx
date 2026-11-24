import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { LuxuryNotification, type LuxuryItem } from '../components/LuxuryNotification';
import { onNotificationTap, showNotification } from './appNotify';
import { useRealtime } from './realtime';

type NewItem = Omit<LuxuryItem, 'key'>;

interface NotifyValue {
  /** Shows the luxury card in-app (Settings uses it for the sample notification). */
  show: (item: NewItem) => void;
}

const NotifyContext = createContext<NotifyValue | null>(null);

let counter = 0;

function previewOf(data: Record<string, unknown>): string {
  const body = String(data.body || '').trim();
  if (body) return body;
  switch (String(data.type || 'text')) {
    case 'image':
      return '📷 أرسل لك صورة';
    case 'video':
      return '🎬 أرسل لك فيديو';
    case 'audio':
      return '🎙️ أرسل لك رسالة صوتية';
    case 'file':
      return '📎 أرسل لك ملفاً';
    default:
      return 'أرسل لك رسالة جديدة';
  }
}

function routeOf(data: Record<string, unknown>): string | undefined {
  if (typeof data.conversationId === 'string' && data.conversationId) {
    return `/chats/${data.conversationId}`;
  }
  if (typeof data.link === 'string' && data.link.startsWith('/')) return data.link;
  return undefined;
}

/**
 * Listens to the realtime feed and turns friend messages / system notices into
 * the luxury in-app card — or an OS notification when the app is in the background.
 */
export function NotifyProvider({ children }: { children: ReactNode }) {
  const { on } = useRealtime();
  const navigate = useNavigate();
  const [items, setItems] = useState<LuxuryItem[]>([]);

  const dismiss = useCallback((key: string) => {
    setItems((current) => current.filter((item) => item.key !== key));
  }, []);

  const show = useCallback((item: NewItem) => {
    counter += 1;
    const key = `local-${counter}`;
    setItems((current) => [...current.filter((row) => row.key !== key).slice(-2), { ...item, key }]);
  }, []);

  useEffect(() => {
    const push = (item: NewItem) => {
      counter += 1;
      const key = `${item.kind}-${counter}`;
      setItems((current) => [...current.filter((row) => row.key !== key).slice(-2), { ...item, key }]);
    };

    const offMessage = on('message:new', (data) => {
      if (data.mine) return;
      const conversationId = String(data.conversationId || '');
      if (!conversationId) return;
      const viewing = window.location.pathname === `/chats/${conversationId}` && !document.hidden;
      if (viewing) return;

      const title = String(data.senderName || '') || 'رسالة جديدة';
      const body = previewOf(data);
      const route = `/chats/${conversationId}`;

      if (document.hidden) {
        void showNotification({ kind: 'message', title, body, route });
        return;
      }
      push({
        kind: 'message',
        title,
        body,
        route,
        avatarUrl: typeof data.senderAvatar === 'string' ? data.senderAvatar : null,
      });
    });

    const offSystem = on('notification', (data) => {
      const type = String(data.type || '');
      // Friend messages already arrive through `message:new`; avoid a double card.
      if (type === 'message') return;
      const title = String(data.title || '') || 'يلا فون';
      const body = String(data.body || '');
      const route = routeOf(data);
      if (document.hidden) {
        void showNotification({ kind: 'system', title, body, route });
        return;
      }
      push({ kind: 'system', title, body, route });
    });

    return () => {
      offMessage();
      offSystem();
    };
  }, [on]);

  useEffect(() => onNotificationTap((route) => {
    if (route) navigate(route);
  }), [navigate]);

  const value = useMemo<NotifyValue>(() => ({ show }), [show]);

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <div className="lux-note-stack">
        {items.map((item) => (
          <LuxuryNotification
            key={item.key}
            item={item}
            onClose={() => dismiss(item.key)}
            onOpen={() => {
              dismiss(item.key);
              if (item.route) navigate(item.route);
            }}
          />
        ))}
      </div>
    </NotifyContext.Provider>
  );
}

export function useNotify(): NotifyValue {
  const context = useContext(NotifyContext);
  if (!context) throw new Error('useNotify must be used inside NotifyProvider');
  return context;
}
