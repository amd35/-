import { one, q } from './db';
import { endCall, acceptCall, cancelCall, inviteCall, rejectCall, type CallKind } from './calls';
import { onSocketEvent, onSocketClose, emitToUser, emitToUsers } from './realtime';
import { assertCapability } from './security/service';
import { isUuid } from './utils';

/** Bridges realtime events (call control + WebRTC signaling + typing) to the call service. */
export function registerSocketHandlers(): void {
  onSocketEvent('call:invite', async ({ userId, data }) => {
    const calleeId = String(data.calleeId || '');
    const kind = String(data.kind || 'voice') as CallKind;
    await assertCapability(userId, 'calls');
    const result = await inviteCall(userId, calleeId, kind);
    emitToUser(userId, 'call:created', {
      callId: result.call.id,
      kind,
      ratePerMinute: result.ratePerMinute,
      freeAvailable: result.freeAvailable,
    });
  });

  onSocketEvent('call:accept', async ({ userId, data }) => {
    await acceptCall(String(data.callId || ''), userId);
  });

  onSocketEvent('call:reject', async ({ userId, data }) => {
    await rejectCall(String(data.callId || ''), userId);
  });

  onSocketEvent('call:cancel', async ({ userId, data }) => {
    await cancelCall(String(data.callId || ''), userId);
  });

  onSocketEvent('call:end', async ({ userId, data }) => {
    await endCall(String(data.callId || ''), userId, 'ended');
  });

  onSocketEvent('webrtc:signal', async ({ userId, data }) => {
    const callId = String(data.callId || '');
    const call = await one<{ caller_id: string; callee_id: string; status: string }>(
      'SELECT caller_id, callee_id, status FROM calls WHERE id = $1',
      [callId]
    );
    if (!call) return;
    if (call.caller_id !== userId && call.callee_id !== userId) return;
    if (call.status !== 'accepted' && call.status !== 'ringing') return;
    const target = call.caller_id === userId ? call.callee_id : call.caller_id;
    emitToUser(target, 'webrtc:signal', {
      callId,
      from: userId,
      payload: data.payload ?? null,
    });
  });

  onSocketEvent('chat:typing', async ({ userId, data }) => {
    const conversationId = String(data.conversationId || '');
    if (!isUuid(conversationId)) return;
    const member = await one(
      'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    if (!member) return;
    const peer = await one<{ user_id: string }>(
      'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2 LIMIT 1',
      [conversationId, userId]
    );
    if (peer) emitToUser(peer.user_id, 'chat:typing', { conversationId, userId });
  });

  // ------------------------------------------------------------ voice rooms
  // Presence is tracked per socket so a user with two open tabs counts once.
  const roomPresence = new Map<string, Map<string, number>>();
  const clientRooms = new Map<number, Set<string>>();

  const roomUserIds = (roomId: string) => [...(roomPresence.get(roomId)?.keys() ?? [])];

  const presencePayload = async (roomId: string) => {
    const ids = roomUserIds(roomId);
    if (!ids.length) return { roomId, count: 0, users: [] };
    const users = await q<{
      id: string;
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
      level: number | null;
    }>(
      'SELECT id, display_name, username, avatar_url, level FROM users WHERE id = ANY($1::uuid[])',
      [ids]
    );
    const room = await one<{ owner_id: string | null }>('SELECT owner_id FROM rooms WHERE id = $1', [roomId]);
    const roles = await q<{ user_id: string; role: string }>(
      'SELECT user_id, role FROM room_roles WHERE room_id = $1',
      [roomId]
    );
    const roleByUser = new Map(roles.map((row) => [row.user_id, row.role]));
    return {
      roomId,
      count: users.length,
      users: users.map((user) => ({
        id: user.id,
        displayName: user.display_name || user.username || '',
        avatarUrl: user.avatar_url,
        level: Number(user.level ?? 1) || 1,
        role:
          room?.owner_id === user.id ? 'owner' : roleByUser.get(user.id) ?? 'member',
      })),
    };
  };

  const pushPresence = async (roomId: string) => {
    const payload = await presencePayload(roomId);
    emitToUsers(roomUserIds(roomId), 'room:presence', payload);
    return payload;
  };

  /** Removes one socket from a room; returns true when it really was in it. */
  const leaveRoom = (clientId: number, roomId: string, userId: string) => {
    const joined = clientRooms.get(clientId);
    if (!joined?.has(roomId)) return false;
    joined.delete(roomId);
    if (joined.size === 0) clientRooms.delete(clientId);
    const members = roomPresence.get(roomId);
    const count = (members?.get(userId) ?? 1) - 1;
    if (members) {
      if (count <= 0) members.delete(userId);
      else members.set(userId, count);
    }
    return true;
  };

  onSocketEvent('room:join', async ({ userId, data, client }) => {
    const roomId = String(data.roomId || '');
    if (!roomId) return;
    const room = await one('SELECT 1 FROM rooms WHERE id = $1 AND is_active = true', [roomId]);
    if (!room) return;
    if (!roomPresence.has(roomId)) roomPresence.set(roomId, new Map());
    const members = roomPresence.get(roomId)!;
    // A socket that switches rooms leaves the previous one first.
    for (const previous of [...(clientRooms.get(client.id) ?? [])]) {
      if (previous === roomId) continue;
      if (leaveRoom(client.id, previous, userId)) void pushPresence(previous);
    }
    const joined = clientRooms.get(client.id) ?? new Set<string>();
    const first = !joined.has(roomId);
    joined.add(roomId);
    clientRooms.set(client.id, joined);
    if (first) members.set(userId, (members.get(userId) ?? 0) + 1);
    await pushPresence(roomId);
  });

  onSocketEvent('room:leave', async ({ userId, data, client }) => {
    const roomId = String(data.roomId || '');
    if (!roomId) return;
    if (leaveRoom(client.id, roomId, userId)) await pushPresence(roomId);
  });

  // WebRTC audio signaling between room members (server only relays).
  onSocketEvent('room:signal', async ({ userId, data }) => {
    const roomId = String(data.roomId || '');
    const to = String(data.to || '');
    if (!roomId || !to || to === userId) return;
    const members = roomPresence.get(roomId);
    if (!members?.has(userId) || !members.has(to)) return;
    emitToUser(to, 'room:signal', { roomId, from: userId, payload: data.payload ?? null });
  });

  onSocketClose((userId, clientId) => {
    const rooms = [...(clientRooms.get(clientId) ?? [])];
    for (const roomId of rooms) {
      if (leaveRoom(clientId, roomId, userId)) void pushPresence(roomId);
    }
  });

  onSocketEvent('ping', () => undefined);
}
