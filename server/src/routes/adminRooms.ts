import { Router } from 'express';
import { q, tx } from '../db';
import { requireAdmin } from '../auth';
import { broadcast } from '../realtime';
import { MIC_KINDS, RoomRow, allRoomsWithMics, packMicPositions, serializeRoom } from '../rooms';
import { HttpError, asyncHandler } from '../utils';
import { giftUpload } from './uploads';

const router = Router();
router.use(requireAdmin());

function readRoom(body: Record<string, unknown>) {
  const name = String(body?.name ?? '').trim();
  if (!name) throw new HttpError(400, 'Room name is required', 'missing_name');
  return {
    name,
    description: String(body?.description ?? '').trim(),
    coverUrl: body?.coverUrl ? String(body.coverUrl) : null,
    rules: String(body?.rules ?? '').trim(),
    isActive: body?.isActive === undefined ? true : Boolean(body.isActive),
    sortOrder: Number(body?.sortOrder ?? 0) || 0,
    background: String(body?.background ?? 'fire').slice(0, 300) || 'fire',
    musicUrl: body?.musicUrl ? String(body.musicUrl).trim().slice(0, 500) : null,
    country: String(body?.country ?? 'العراق').trim().slice(0, 60) || 'العراق',
    language: String(body?.language ?? 'العربية').trim().slice(0, 60) || 'العربية',
  };
}

function readKind(value: unknown): string {
  const kind = String(value ?? 'speaker');
  return (MIC_KINDS as readonly string[]).includes(kind) ? kind : 'speaker';
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ rooms: await allRoomsWithMics() });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const fields = readRoom((req.body ?? {}) as Record<string, unknown>);
    const micCount = Math.min(20, Math.max(0, Number(req.body?.micCount ?? 15) || 0));

    const room = await tx(async (client) => {
      const inserted = await client.query<RoomRow>(
        `INSERT INTO rooms (name, description, cover_url, rules, is_active, sort_order,
                            background, music_url, country, language)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [
          fields.name,
          fields.description,
          fields.coverUrl,
          fields.rules,
          fields.isActive,
          fields.sortOrder,
          fields.background,
          fields.musicUrl,
          fields.country,
          fields.language,
        ]
      );
      const created = inserted.rows[0];
      for (let position = 1; position <= micCount; position += 1) {
        await client.query('INSERT INTO room_mics (room_id, position, label, kind) VALUES ($1, $2, $3, $4)', [
          created.id,
          position,
          position === 1 ? 'المايك الرئيسي' : `مايك ${position}`,
          position === 1 ? 'host' : 'speaker',
        ]);
      }
      return created;
    });

    broadcast('room', { roomId: room.id });
    res.status(201).json({ room: serializeRoom(room) });
  })
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const fields = readRoom((req.body ?? {}) as Record<string, unknown>);
    const updated = await q<RoomRow>(
      `UPDATE rooms
       SET name = $2, description = $3, cover_url = $4, rules = $5, is_active = $6, sort_order = $7,
           background = $8, music_url = $9, country = $10, language = $11
       WHERE id = $1
       RETURNING *`,
      [
        req.params.id,
        fields.name,
        fields.description,
        fields.coverUrl,
        fields.rules,
        fields.isActive,
        fields.sortOrder,
        fields.background,
        fields.musicUrl,
        fields.country,
        fields.language,
      ]
    );
    if (!updated[0]) throw new HttpError(404, 'Room not found', 'room_not_found');

    broadcast('room', { roomId: req.params.id });
    res.json({ room: serializeRoom(updated[0]) });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const deleted = await q<{ id: string }>('DELETE FROM rooms WHERE id = $1 RETURNING id', [req.params.id]);
    if (!deleted.length) throw new HttpError(404, 'Room not found', 'room_not_found');

    broadcast('room', { roomId: req.params.id });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/mics',
  asyncHandler(async (req, res) => {
    const roomId = req.params.id;
    const kind = readKind(req.body?.kind);
    const label = String(req.body?.label ?? '').trim();

    const micId = await tx(async (client) => {
      const room = await client.query('SELECT id FROM rooms WHERE id = $1', [roomId]);
      if (!room.rows[0]) throw new HttpError(404, 'Room not found', 'room_not_found');

      const next = await client.query<{ position: number }>(
        'SELECT COALESCE(MAX(position), 0) + 1 AS position FROM room_mics WHERE room_id = $1',
        [roomId]
      );
      const position = Number(next.rows[0].position);
      const inserted = await client.query<{ id: string }>(
        'INSERT INTO room_mics (room_id, position, label, kind) VALUES ($1, $2, $3, $4) RETURNING id',
        [roomId, position, label || `مايك ${position}`, kind]
      );
      return inserted.rows[0].id;
    });

    broadcast('room', { roomId });
    res.status(201).json({ micId });
  })
);

router.patch(
  '/:id/mics/:micId',
  asyncHandler(async (req, res) => {
    const label = req.body?.label === undefined ? null : String(req.body.label).trim();
    const kind = req.body?.kind === undefined ? null : readKind(req.body.kind);
    const locked = req.body?.isLocked === undefined ? null : Boolean(req.body.isLocked);

    const updated = await q<{ id: string }>(
      `UPDATE room_mics
       SET label = COALESCE($3, label), kind = COALESCE($4, kind), is_locked = COALESCE($5, is_locked)
       WHERE id = $1 AND room_id = $2
       RETURNING id`,
      [req.params.micId, req.params.id, label, kind, locked]
    );
    if (!updated.length) throw new HttpError(404, 'Mic not found', 'mic_not_found');

    broadcast('room', { roomId: req.params.id });
    res.json({ ok: true });
  })
);

router.delete(
  '/:id/mics/:micId',
  asyncHandler(async (req, res) => {
    const roomId = req.params.id;
    await tx(async (client) => {
      const deleted = await client.query(
        'DELETE FROM room_mics WHERE id = $1 AND room_id = $2 RETURNING id',
        [req.params.micId, roomId]
      );
      if (!deleted.rows.length) throw new HttpError(404, 'Mic not found', 'mic_not_found');
      await packMicPositions(client, roomId);
    });

    broadcast('room', { roomId });
    res.json({ ok: true });
  })
);

router.post(
  '/:id/mics/reorder',
  asyncHandler(async (req, res) => {
    const roomId = req.params.id;
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String) : [];
    if (!ids.length) throw new HttpError(400, 'Send the mic order', 'missing_order');

    await tx(async (client) => {
      const found = await client.query<{ id: string }>('SELECT id FROM room_mics WHERE room_id = $1', [roomId]);
      const current = found.rows.map((row) => row.id);
      const complete = current.length === ids.length && current.every((id) => ids.includes(id));
      if (!complete) throw new HttpError(400, 'The order must list every mic exactly once', 'invalid_order');

      await client.query('UPDATE room_mics SET position = -position - 1000000 WHERE room_id = $1', [roomId]);
      for (let index = 0; index < ids.length; index += 1) {
        await client.query('UPDATE room_mics SET position = $2 WHERE id = $1', [ids[index], index + 1]);
      }
    });

    broadcast('room', { roomId });
    res.json({ ok: true });
  })
);

router.post(
  '/upload',
  giftUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file received', 'missing_file');
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  })
);

export default router;
