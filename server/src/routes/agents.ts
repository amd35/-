import { Router } from 'express';
import { one, q } from '../db';
import { reqUser, requireAuth } from '../auth';
import {
  activeAgent,
  agentFor,
  agentPanel,
  agentRequests,
  agentRecharges,
  agentStats,
  cancelRequest,
  createRequest,
  officialAgents,
  parseAmount,
  packageFor,
  quote,
  quoteFor,
  recharge,
  requireAgent,
  resolveRequest,
} from '../agents';
import { isOnline } from '../realtime';
import { HttpError, asyncHandler, intParam } from '../utils';

const router = Router();

/** The official agencies, for the in-app list. Any signed-in user may browse it. */
router.get(
  '/agents',
  requireAuth(),
  asyncHandler(async (_req, res) => {
    const rows = await officialAgents();
    const packages = await q(
      'SELECT * FROM agent_packages WHERE is_active = true ORDER BY sort_order, amount'
    );
    res.json({
      agents: rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        available: isOnline(row.id),
        since: row.since,
      })),
      packages: packages.map((pack) => ({
        id: pack.id,
        name: pack.name,
        currency: pack.currency,
        amount: Number(pack.amount),
        costCoins: Number(pack.cost_coins),
      })),
    });
  })
);

/** The signed-in user's own recharge requests, shown on the agents page. */
router.get(
  '/agents/me/requests',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const rows = await q(
      `SELECT r.id, r.currency, r.amount, r.cost_coins, r.status, r.note, r.agent_note,
              r.created_at, r.resolved_at,
              a.id AS agent_id, a.username AS agent_username, a.display_name AS agent_name,
              a.avatar_url AS agent_avatar
         FROM agent_requests r JOIN users a ON a.id = r.agent_id
        WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 30`,
      [me]
    );
    res.json({
      requests: rows.map((row) => ({
        id: row.id,
        currency: row.currency,
        amount: Number(row.amount),
        costCoins: Number(row.cost_coins),
        status: row.status,
        note: row.note,
        agentNote: row.agent_note,
        createdAt: row.created_at,
        resolvedAt: row.resolved_at,
        agent: {
          id: row.agent_id,
          username: row.agent_username,
          displayName: row.agent_name,
          avatarUrl: row.agent_avatar,
        },
      })),
    });
  })
);

/** A customer asks an agency for a recharge; the agent accepts or rejects it. */
router.post(
  '/agents/:id/requests',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const agentId = String(req.params.id);
    const created = await createRequest({
      userId: me,
      agentId,
      packageId: String(req.body?.packageId || ''),
      amount: parseAmount(req.body?.amount),
      note: req.body?.note ? String(req.body.note).slice(0, 300) : null,
    });
    res.status(201).json(created);
  })
);

router.post(
  '/agents/requests/:id/cancel',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    res.json(await cancelRequest(me, String(req.params.id)));
  })
);

/** The agent panel. Signed-in non-agents get 403 — the panel stays hidden for them. */
router.get(
  '/agent',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    res.json(await agentPanel(me));
  })
);

/** Agent search for the receiver: exact account ID, or a full UUID. */
router.get(
  '/agent/lookup',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await requireAgent(me);
    const raw = String(req.query.q || '').trim();
    if (!raw) throw new HttpError(400, 'Enter a user ID', 'missing_query');
    const row = await one<{
      id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      is_banned: boolean;
      is_bot: boolean;
      is_support: boolean;
    }>(
      `SELECT id, username, display_name, avatar_url, is_banned, is_bot, is_support
         FROM users WHERE username = $1 OR id::text = $1 LIMIT 1`,
      [raw]
    );
    if (!row || row.is_bot) throw new HttpError(404, 'User not found', 'user_not_found');
    res.json({
      user: {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        banned: row.is_banned,
        isSelf: row.id === me,
      },
    });
  })
);

/** Price preview so the agent sees the required amount before confirming. */
router.get(
  '/agent/quote',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await requireAgent(me);
    const amount = parseAmount(req.query.amount);
    const result = await quote(String(req.query.packageId || ''), amount);
    const agent = (await agentFor(me))!;
    const rate = Number(agent.commission_percent) || 0;
    res.json({
      package: {
        id: result.package.id,
        name: result.package.name,
        currency: result.package.currency,
        amount: Number(result.package.amount),
        costCoins: Number(result.package.cost_coins),
      },
      amount,
      costCoins: result.costCoins,
      commissionCoins: Math.floor((result.costCoins * rate) / 100),
      balance: Number(agent.coins_balance),
    });
  })
);

/** Confirm a recharge: the server prices it, deducts the balance and credits the user. */
router.post(
  '/agent/recharge',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await requireAgent(me);
    const targetId = String(req.body?.userId || '').trim();
    const amount = parseAmount(req.body?.amount);
    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(idempotencyKey)) {
      throw new HttpError(400, 'Missing confirmation key', 'missing_idempotency_key');
    }
    const target = await one<{ id: string; is_banned: boolean; is_bot: boolean }>(
      'SELECT id, is_banned, is_bot FROM users WHERE id::text = $1',
      [targetId]
    );
    if (!target || target.is_bot) throw new HttpError(404, 'User not found', 'user_not_found');
    if (target.is_banned) throw new HttpError(400, 'This account is banned', 'user_banned');

    const pack = await packageFor(String(req.body?.packageId || ''));
    const costCoins = quoteFor(pack, amount);
    const result = await recharge({
      agentId: me,
      userId: target.id,
      packageId: pack.id,
      currency: pack.currency,
      amount,
      costCoins,
      idempotencyKey,
      note: req.body?.note ? String(req.body.note).slice(0, 300) : null,
    });
    res.status(201).json(result);
  })
);

router.post(
  '/agent/requests/:id/complete',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await requireAgent(me);
    const result = await resolveRequest({
      agentId: me,
      requestId: String(req.params.id),
      action: 'complete',
      agentNote: req.body?.agentNote ? String(req.body.agentNote).slice(0, 300) : null,
    });
    res.json(result);
  })
);

router.post(
  '/agent/requests/:id/reject',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await requireAgent(me);
    const result = await resolveRequest({
      agentId: me,
      requestId: String(req.params.id),
      action: 'reject',
      agentNote: req.body?.agentNote ? String(req.body.agentNote).slice(0, 300) : null,
    });
    res.json(result);
  })
);

/** Extra pages of the agent's own history (the panel payload carries the first page). */
router.get(
  '/agent/recharges',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await requireAgent(me);
    res.json({ recharges: await agentRecharges(me, intParam(req.query.limit, 50, 1, 200)) });
  })
);

router.get(
  '/agent/requests',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await requireAgent(me);
    res.json({ requests: await agentRequests(me, intParam(req.query.limit, 50, 1, 200)) });
  })
);

router.get(
  '/agent/stats',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const agent = await activeAgent(me);
    if (!agent) throw new HttpError(403, 'You are not a recharge agent', 'not_agent');
    res.json(await agentStats(me));
  })
);

/** Small helper for clients that only need "am I an agent?". */
router.get(
  '/agent/status',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    const agent = await agentFor(me);
    res.json({
      isAgent: Boolean(agent && agent.status === 'active'),
      status: agent?.status ?? null,
    });
  })
);

export default router;
