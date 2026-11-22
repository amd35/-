import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './auth';
import { useI18n } from './i18n';
import { useToast } from './ui';
import { wsUrl } from './api';

type Handler = (data: Record<string, unknown>) => void;

interface RealtimeValue {
  connected: boolean;
  online: Set<string>;
  send: (event: string, data?: Record<string, unknown>) => void;
  on: (event: string, handler: Handler) => () => void;
}

const RealtimeContext = createContext<RealtimeValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { token, refresh } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);
  const listeners = useRef<Map<string, Set<Handler>>>(new Map());
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Coalesces bursts of server events into one profile refresh. */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, 450);
  }, [refresh]);

  const on = useCallback((event: string, handler: Handler) => {
    if (!listeners.current.has(event)) listeners.current.set(event, new Set());
    listeners.current.get(event)!.add(handler);
    return () => {
      listeners.current.get(event)?.delete(handler);
    };
  }, []);

  const send = useCallback((event: string, data: Record<string, unknown> = {}) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ event, data }));
    }
  }, []);

  const dispatch = useCallback((event: string, data: Record<string, unknown>) => {
    listeners.current.get(event)?.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error('[realtime] handler failed', error);
      }
    });
  }, []);

  useEffect(() => {
    if (!token) {
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
      setOnline(new Set());
      return;
    }

    closedRef.current = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closedRef.current) return;
      const socket = new WebSocket(wsUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };

      socket.onmessage = (event) => {
        let parsed: { event?: string; data?: Record<string, unknown> };
        try {
          parsed = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const name = parsed.event;
        if (!name) return;
        const data = parsed.data ?? {};

        if (name === 'ready' || name === 'presence:list') {
          const ids = (data.onlineUserIds as string[] | undefined) ?? [];
          setOnline(new Set(ids));
        } else if (name === 'presence') {
          const userId = String(data.userId || '');
          if (userId) {
            setOnline((current) => {
              const next = new Set(current);
              if (data.online) next.add(userId);
              else next.delete(userId);
              return next;
            });
          }
        } else if (name === 'free:update' || name === 'wallet:update') {
          scheduleRefresh();
        } else if (name === 'notification') {
          const type = String(data.type || '');
          // The call overlay already announces call endings; don't duplicate it as a toast.
          if (type !== 'message' && type !== 'call_ended') {
            toast.push(String(data.title || t('notifications')), 'info');
          }
          scheduleRefresh();
        }

        dispatch(name, data);
      };

      socket.onclose = () => {
        setConnected(false);
        if (closedRef.current) return;
        retryRef.current = Math.min(retryRef.current + 1, 6);
        const delay = 700 * retryRef.current;
        reconnectTimer = setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    return () => {
      closedRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token, dispatch, scheduleRefresh, t, toast]);

  const value = useMemo<RealtimeValue>(
    () => ({ connected, online, send, on }),
    [connected, online, send, on]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeValue {
  const context = useContext(RealtimeContext);
  if (!context) throw new Error('useRealtime must be used inside RealtimeProvider');
  return context;
}
