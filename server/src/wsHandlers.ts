import { one, q } from './db';
import { endCall, acceptCall, cancelCall, inviteCall, rejectCall, type CallKind } from './calls';
import { onSocketEvent, emitToUser } from './realtime';

/** Bridges realtime events (call control + WebRTC signaling + typing) to the call service. */
export function registerSocketHandlers(): void {
  onSocketEvent('call:invite', async ({ userId, data }) => {
    const calleeId = String(data.calleeId || '');
    const kind = String(data.kind || 'voice') as CallKind;
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

  onSocketEvent('ping', () => undefined);
}
