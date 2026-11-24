import { Router } from 'express';
import { reqUser, requireAuth } from '../auth';
import {
  cancelQueue,
  createPrivateMatch,
  gameSnapshot,
  joinByCode,
  joinQueue,
  leaveMatch,
  matchDetail,
  postMessage,
  reportPlayer,
  shoot,
} from '../game';
import { asyncHandler } from '../utils';

const router = Router();

router.use(requireAuth());

/** Lobby: settings, gold, stats, open rooms, leaderboard and any active match. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await gameSnapshot(reqUser(req).id));
  })
);

/** Quick match — pairs with a real waiting player or opens a room. */
router.post(
  '/queue',
  asyncHandler(async (req, res) => {
    res.json(await joinQueue(reqUser(req).id, req.body?.fee));
  })
);

router.delete(
  '/queue',
  asyncHandler(async (req, res) => {
    res.json(await cancelQueue(reqUser(req).id));
  })
);

router.post(
  '/rooms',
  asyncHandler(async (req, res) => {
    res.json(await createPrivateMatch(reqUser(req).id, req.body?.fee));
  })
);

router.post(
  '/rooms/join',
  asyncHandler(async (req, res) => {
    res.json(await joinByCode(reqUser(req).id, String(req.body?.code || '')));
  })
);

router.get(
  '/matches/:id',
  asyncHandler(async (req, res) => {
    res.json(await matchDetail(req.params.id, reqUser(req).id));
  })
);

/** One shot: aim + power only — the server simulates and scores it. */
router.post(
  '/matches/:id/shoot',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    res.json(
      await shoot(reqUser(req).id, req.params.id, {
        x: Number(body.x),
        angle: Number(body.angle),
        power: Number(body.power),
      })
    );
  })
);

router.post(
  '/matches/:id/messages',
  asyncHandler(async (req, res) => {
    const kind = req.body?.kind === 'emoji' ? 'emoji' : 'text';
    res.json(await postMessage(reqUser(req).id, req.params.id, kind, String(req.body?.body || '')));
  })
);

router.post(
  '/matches/:id/report',
  asyncHandler(async (req, res) => {
    res.json(
      await reportPlayer(
        reqUser(req).id,
        req.params.id,
        String(req.body?.targetId || ''),
        String(req.body?.reason || '')
      )
    );
  })
);

router.post(
  '/matches/:id/leave',
  asyncHandler(async (req, res) => {
    res.json(await leaveMatch(reqUser(req).id, req.params.id));
  })
);

export default router;
