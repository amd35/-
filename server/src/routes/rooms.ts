import { Router } from 'express';
import { q, tx } from '../db';
import { reqUser, requireAuth } from '../auth';
import { broadcast } from '../realtime';
import { getRoomDetail, listRooms } from '../rooms';
import { HttpError, asyncHandler } from '../utils';

const router = Router();

router.get(
  '/',
  requireAuth(),
  asyncHandler(async (_req, res) => {
    res.json({ rooms: await listRooms() });
  })
);

router.get(
  '/:id',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({ room: await getRoomDetail(req.params.id, reqUser(req).id) });
  })
);

router.post(
  '/:id/mics/:micId/take',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const micId = req.params.micId;

    await tx(async (client) => {
      const room = await client.query<{ is_active: boolean }>('SELECT is_active FROM rooms WHERE id = $1', [
        roomId,
      ]);
      if (!room.rows[0]?.is_active) throw new HttpError(404, 'Room not found', 'room_not_found');

      const found = await client.query<{ id: string; user_id: string | null; is_locked: boolean }>(
        'SELECT id, user_id, is_locked FROM room_mics WHERE id = $1 AND room_id = $2 FOR UPDATE',
        [micId, roomId]
      );
      const seat = found.rows[0];
      if (!seat) throw new HttpError(404, 'Mic not found', 'mic_not_found');
      if (seat.user_id && seat.user_id !== me) throw new HttpError(409, 'This mic is taken', 'mic_taken');
      if (seat.is_locked) throw new HttpError(403, 'This mic is locked', 'mic_locked');

      // One seat per user: release any other seat this user holds in the room first.
      await client.query(
        'UPDATE room_mics SET user_id = NULL, joined_at = NULL WHERE room_id = $1 AND user_id = $2 AND id <> $3',
        [roomId, me, micId]
      );
      await client.query('UPDATE room_mics SET user_id = $2, joined_at = now() WHERE id = $1', [micId, me]);
    });

    broadcast('room', { roomId });
    res.json({ room: await getRoomDetail(roomId, me) });
  })
);

router.post(
  '/:id/mics/:micId/leave',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const roomId = req.params.id;
    const released = await q(
      'UPDATE room_mics SET user_id = NULL, joined_at = NULL WHERE id = $1 AND room_id = $2 AND user_id = $3 RETURNING id',
      [req.params.micId, roomId, me]
    );
    if (!released.length) throw new HttpError(403, 'You are not on this mic', 'not_on_mic');

    broadcast('room', { roomId });
    res.json({ room: await getRoomDetail(roomId, me) });
  })
);

export default router;
