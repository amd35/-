import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { verifyToken } from './auth';
import { q } from './db';

interface Client {
  id: number;
  ws: WebSocket;
  userId: string;
  alive: boolean;
}

type SocketHandler = (ctx: {
  userId: string;
  data: Record<string, unknown>;
  client: Client;
}) => Promise<void> | void;

const byUser = new Map<string, Set<Client>>();
const handlers = new Map<string, SocketHandler>();
let sequence = 0;

export function onSocketEvent(event: string, handler: SocketHandler): void {
  handlers.set(event, handler);
}

function send(ws: WebSocket, event: string, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event, data }));
}

export function isOnline(userId: string): boolean {
  return (byUser.get(userId)?.size ?? 0) > 0;
}

export function onlineUserIds(): string[] {
  return [...byUser.keys()];
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  const clients = byUser.get(userId);
  if (!clients) return;
  for (const client of clients) send(client.ws, event, data);
}

export function emitToUsers(userIds: string[], event: string, data: unknown): void {
  for (const userId of new Set(userIds)) emitToUser(userId, event, data);
}

export function broadcast(event: string, data: unknown): void {
  for (const clients of byUser.values()) {
    for (const client of clients) send(client.ws, event, data);
  }
}

export function attachRealtime(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024 });

  wss.on('connection', (ws, req) => {
    let userId: string;
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      const token = url.searchParams.get('token') || '';
      const payload = verifyToken(token);
      if (payload.kind !== 'user') throw new Error('not a user token');
      userId = payload.sub;
    } catch {
      ws.close(4001, 'unauthorized');
      return;
    }

    sequence += 1;
    const client: Client = { id: sequence, ws, userId, alive: true };
    const firstConnection = !byUser.has(userId);
    if (!byUser.has(userId)) byUser.set(userId, new Set());
    byUser.get(userId)!.add(client);

    send(ws, 'ready', { userId, onlineUserIds: onlineUserIds() });
    if (firstConnection) {
      void q('UPDATE users SET last_seen_at = now() WHERE id = $1', [userId]);
      broadcast('presence', { userId, online: true });
    }

    ws.on('pong', () => {
      client.alive = true;
    });

    ws.on('message', (raw) => {
      let parsed: { event?: string; data?: Record<string, unknown> };
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      const event = parsed.event;
      if (!event) return;
      const handler = handlers.get(event);
      if (!handler) return;
      Promise.resolve(handler({ userId, data: parsed.data ?? {}, client }))
        .catch((error: Error) => {
          send(ws, 'error', { event, message: error.message || 'Request failed' });
        });
    });

    ws.on('close', () => {
      const set = byUser.get(userId);
      if (!set) return;
      set.delete(client);
      if (set.size === 0) {
        byUser.delete(userId);
        void q('UPDATE users SET last_seen_at = now() WHERE id = $1', [userId]);
        broadcast('presence', { userId, online: false, lastSeenAt: new Date().toISOString() });
      }
    });

    ws.on('error', () => {
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const clients of byUser.values()) {
      for (const client of clients) {
        if (!client.alive) {
          client.ws.terminate();
          continue;
        }
        client.alive = false;
        try {
          client.ws.ping();
        } catch {
          /* ignore */
        }
      }
    }
  }, 25_000);
  heartbeat.unref?.();
  console.log('[ws] realtime gateway ready on /ws');
}
