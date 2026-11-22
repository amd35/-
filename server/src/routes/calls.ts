import { Router } from 'express';
import { one, q } from '../db';
import { reqUser, requireAuth } from '../auth';
import {
  acceptCall,
  cancelCall,
  endCall,
  inviteCall,
  rejectCall,
  type CallKind,
} from '../calls';
import { getFreeCallState } from '../freecalls';
import { asyncHandler, intParam } from '../utils';

const router = Router();

router.get(
  '/free-state',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json(await getFreeCallState(reqUser(req).id));
  })
);

router.get(
  '/active',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const call = await one(
      `SELECT c.*, u.display_name AS peer_name, u.avatar_url AS peer_avatar
       FROM calls c
       JOIN users u ON u.id = CASE WHEN c.caller_id = $1 THEN c.callee_id ELSE c.caller_id END
       WHERE (c.caller_id = $1 OR c.callee_id = $1) AND c.status IN ('ringing', 'accepted')
       ORDER BY c.created_at DESC LIMIT 1`,
      [me]
    );
    res.json({ call });
  })
);

router.post(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const calleeId = String(req.body?.calleeId || '');
    const kind = String(req.body?.kind || 'voice') as CallKind;
    const result = await inviteCall(me, calleeId, kind);
    res.status(201).json({
      callId: result.call.id,
      kind,
      freeAvailable: result.freeAvailable,
      ratePerMinute: result.ratePerMinute,
      status: result.call.status,
      isBot: result.isBot,
    });
  })
);

router.post(
  '/:id/accept',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    res.json(await acceptCall(req.params.id, me));
  })
);

router.post(
  '/:id/reject',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    res.json({ call: await rejectCall(req.params.id, me) });
  })
);

router.post(
  '/:id/cancel',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    res.json({ call: await cancelCall(req.params.id, me) });
  })
);

router.post(
  '/:id/end',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const summary = await endCall(req.params.id, me, 'ended');
    res.json({ call: summary });
  })
);

router.get(
  '/history',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const filter = String(req.query.filter || 'all');
    const limit = intParam(req.query.limit, 60, 1, 200);
    const params: unknown[] = [me];
    let sql = `
      SELECT c.id, c.kind, c.status, c.is_free, c.duration_seconds, c.coins_charged,
             c.coins_refunded, c.rate_per_minute, c.created_at, c.accepted_at, c.ended_at,
             c.end_reason,
             CASE WHEN c.caller_id = $1 THEN 'outgoing' ELSE 'incoming' END AS direction,
             (c.status = 'missed' AND c.callee_id = $1) AS missed_for_me,
             u.id AS peer_id, u.display_name AS peer_name, u.username AS peer_username,
             u.avatar_url AS peer_avatar
      FROM calls c
      JOIN users u ON u.id = CASE WHEN c.caller_id = $1 THEN c.callee_id ELSE c.caller_id END
      WHERE (c.caller_id = $1 OR c.callee_id = $1)`;
    if (filter === 'voice' || filter === 'video') {
      params.push(filter);
      sql += ` AND c.kind = $${params.length}`;
    }
    if (filter === 'missed') {
      sql += ` AND c.status = 'missed' AND c.callee_id = $1`;
    }
    sql += ` ORDER BY c.created_at DESC LIMIT ${limit}`;
    const rows = await q(sql, params);
    res.json({
      calls: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        isFree: row.is_free,
        durationSeconds: row.duration_seconds,
        coinsCharged: row.coins_charged,
        coinsRefunded: row.coins_refunded,
        ratePerMinute: row.rate_per_minute,
        createdAt: row.created_at,
        acceptedAt: row.accepted_at,
        endedAt: row.ended_at,
        endReason: row.end_reason,
        direction: row.direction,
        missed: row.missed_for_me,
        peer: {
          id: row.peer_id,
          displayName: row.peer_name,
          username: row.peer_username,
          avatarUrl: row.peer_avatar,
        },
      })),
    });
  })
);

export default router;
