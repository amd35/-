import { Router } from 'express';
import { one, q } from '../db';
import { reqAdmin, requireAdmin } from '../auth';
import {
  adjustAgentBalance,
  agentFor,
  agentLedger,
  agentRecharges,
  agentRequests,
  assignAgent,
  commissionRate,
  messageAgent,
  parseCurrency,
  payoutCommission,
  setAgentStatus,
  updateAgent,
} from '../agents';
import { HttpError, asyncHandler, intParam } from '../utils';

const router = Router();
router.use(requireAdmin());

function cleanNote(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, 300) : null;
}

/**
 * Agencies list: one row per agent with its live balances, sales, due commission
 * and pending customer requests. Balances are the source of truth, never the UI.
 */
router.get(
  '/agents/overview',
  asyncHandler(async (req, res) => {
    const search = String(req.query.q || '').trim();
    const status = String(req.query.status || 'all');
    const params: unknown[] = [];
    let where = 'WHERE 1=1';
    if (status === 'active' || status === 'suspended' || status === 'revoked') {
      params.push(status);
      where += ` AND a.status = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`, search);
      where += ` AND (u.display_name ILIKE $${params.length - 1} OR u.username ILIKE $${params.length})`;
    }
    const rows = await q(
      `SELECT a.user_id, a.status, a.commission_percent, a.coins_balance, a.gold_balance,
              a.total_sales_coins, a.total_commission, a.paid_commission, a.note, a.created_at,
              u.username, u.display_name, u.avatar_url, u.is_banned,
              COALESCE(s.sales, 0) AS sales, COALESCE(s.count, 0) AS recharge_count,
              COALESCE(s.customers, 0) AS customers, COALESCE(rq.pending, 0) AS pending_requests
         FROM agents a
         JOIN users u ON u.id = a.user_id
         LEFT JOIN LATERAL (
           SELECT SUM(cost_coins) AS sales, count(*) AS count, count(DISTINCT user_id) AS customers
             FROM agent_recharges r WHERE r.agent_id = a.user_id
         ) s ON true
         LEFT JOIN LATERAL (
           SELECT count(*) AS pending FROM agent_requests ar
            WHERE ar.agent_id = a.user_id AND ar.status = 'pending'
         ) rq ON true
         ${where}
         ORDER BY (a.status = 'active') DESC, a.created_at DESC
         LIMIT 300`,
      params
    );
    const totals = await one<{
      agents: string;
      active: string;
      suspended: string;
      coins: string;
      gold: string;
      due: string;
      paid: string;
    }>(
      `SELECT count(*)::text AS agents,
              count(*) FILTER (WHERE status = 'active')::text AS active,
              count(*) FILTER (WHERE status = 'suspended')::text AS suspended,
              COALESCE(SUM(coins_balance), 0)::text AS coins,
              COALESCE(SUM(gold_balance), 0)::text AS gold,
              COALESCE(SUM(total_commission - paid_commission), 0)::text AS due,
              COALESCE(SUM(paid_commission), 0)::text AS paid
         FROM agents WHERE status <> 'revoked'`
    );
    const packages = await q(
      'SELECT * FROM agent_packages ORDER BY is_active DESC, sort_order, amount'
    );
    res.json({
      totals: {
        agents: Number(totals?.agents || 0),
        active: Number(totals?.active || 0),
        suspended: Number(totals?.suspended || 0),
        coins: Number(totals?.coins || 0),
        gold: Number(totals?.gold || 0),
        due: Number(totals?.due || 0),
        paid: Number(totals?.paid || 0),
      },
      agents: rows.map((row) => ({
        id: row.user_id,
        status: row.status,
        commissionPercent: Number(row.commission_percent),
        coinsBalance: Number(row.coins_balance),
        goldBalance: Number(row.gold_balance),
        totalSales: Number(row.sales),
        recharges: Number(row.recharge_count),
        customers: Number(row.customers),
        pendingRequests: Number(row.pending_requests),
        totalCommission: Number(row.total_commission),
        paidCommission: Number(row.paid_commission),
        dueCommission: Number(row.total_commission) - Number(row.paid_commission),
        note: row.note,
        createdAt: row.created_at,
        user: {
          id: row.user_id,
          username: row.username,
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
          banned: row.is_banned,
        },
      })),
      packages: packages.map((pack) => ({
        id: pack.id,
        name: pack.name,
        currency: pack.currency,
        amount: Number(pack.amount),
        costCoins: Number(pack.cost_coins),
        isActive: pack.is_active,
        sortOrder: pack.sort_order,
      })),
    });
  })
);

/** User lookup used by the "assign an agent" form (ID or name). */
router.get(
  '/agents/search',
  asyncHandler(async (req, res) => {
    const raw = String(req.query.q || '').trim();
    if (!raw) return res.json({ users: [] });
    const rows = await q(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_banned, a.status AS agent_status
         FROM users u LEFT JOIN agents a ON a.user_id = u.id
        WHERE u.is_bot = false AND (u.username = $2 OR u.id::text = $2 OR u.display_name ILIKE $1)
        ORDER BY (u.username = $2) DESC, u.last_seen_at DESC NULLS LAST
        LIMIT 20`,
      [`%${raw}%`, raw]
    );
    res.json({
      users: rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        banned: row.is_banned,
        agentStatus: row.agent_status,
      })),
    });
  })
);

/** Only the general admin panel reaches these routes: agents have no admin token. */
router.post(
  '/agents',
  asyncHandler(async (req, res) => {
    const admin = reqAdmin(req);
    const userId = String(req.body?.userId || '').trim();
    if (!userId) throw new HttpError(400, 'Choose a user first', 'missing_user');
    const agent = await assignAgent({
      userId,
      commissionPercent: Number(req.body?.commissionPercent ?? 10),
      note: cleanNote(req.body?.note),
      actor: admin.username,
    });
    res.status(201).json({ agent: { id: agent.user_id, status: agent.status } });
  })
);

router.get(
  '/agents/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const agent = await agentFor(id);
    if (!agent) throw new HttpError(404, 'Agent not found', 'agent_missing');
    const [recharges, requests, ledger, user] = await Promise.all([
      agentRecharges(id, 100),
      agentRequests(id, 100),
      agentLedger(id, 100),
      one('SELECT id, username, display_name, avatar_url, is_banned FROM users WHERE id = $1', [id]),
    ]);
    res.json({
      agent: {
        id: agent.user_id,
        status: agent.status,
        commissionPercent: commissionRate(agent),
        coinsBalance: Number(agent.coins_balance),
        goldBalance: Number(agent.gold_balance),
        totalSales: Number(agent.total_sales_coins),
        totalCommission: Number(agent.total_commission),
        paidCommission: Number(agent.paid_commission),
        dueCommission: Number(agent.total_commission) - Number(agent.paid_commission),
        note: agent.note,
        createdAt: agent.created_at,
      },
      user,
      recharges,
      requests,
      ledger,
    });
  })
);

router.patch(
  '/agents/:id',
  asyncHandler(async (req, res) => {
    const id = String(req.params.id);
    const patch: { commissionPercent?: number; note?: string | null } = {};
    if (req.body?.commissionPercent !== undefined) {
      const percent = Number(req.body.commissionPercent);
      if (!Number.isFinite(percent) || percent < 0 || percent > 90) {
        throw new HttpError(400, 'Commission must be between 0 and 90', 'invalid_commission');
      }
      patch.commissionPercent = percent;
    }
    if (req.body?.note !== undefined) patch.note = cleanNote(req.body.note);
    const agent = await updateAgent(id, patch);
    res.json({ agent: { id: agent.user_id, commissionPercent: commissionRate(agent) } });
  })
);

router.post(
  '/agents/:id/status',
  asyncHandler(async (req, res) => {
    const status = String(req.body?.status || '');
    if (!['active', 'suspended', 'revoked'].includes(status)) {
      throw new HttpError(400, 'Unknown status', 'invalid_status');
    }
    const agent = await setAgentStatus(String(req.params.id), status as 'active' | 'suspended' | 'revoked');
    res.json({ agent: { id: agent.user_id, status: agent.status } });
  })
);

/** Revoking keeps the whole money history; the badge and the panel disappear at once. */
router.delete(
  '/agents/:id',
  asyncHandler(async (req, res) => {
    const agent = await setAgentStatus(String(req.params.id), 'revoked');
    res.json({ agent: { id: agent.user_id, status: agent.status } });
  })
);

router.post(
  '/agents/:id/balance',
  asyncHandler(async (req, res) => {
    const direction = String(req.body?.direction || 'credit');
    const amount = Math.trunc(Number(req.body?.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpError(400, 'Enter a valid amount', 'invalid_amount');
    }
    const result = await adjustAgentBalance({
      agentId: String(req.params.id),
      currency: parseCurrency(req.body?.currency),
      delta: direction === 'debit' ? -amount : amount,
      note: cleanNote(req.body?.note),
    });
    res.json(result);
  })
);

router.post(
  '/agents/:id/payout',
  asyncHandler(async (req, res) => {
    const result = await payoutCommission({
      agentId: String(req.params.id),
      amount: Number(req.body?.amount),
      note: cleanNote(req.body?.note),
    });
    res.json(result);
  })
);

router.post(
  '/agents/:id/notify',
  asyncHandler(async (req, res) => {
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!title) throw new HttpError(400, 'Enter a title', 'missing_title');
    await messageAgent(String(req.params.id), title.slice(0, 120), body.slice(0, 1000));
    res.json({ sent: true });
  })
);

router.get(
  '/agents/:id/requests',
  asyncHandler(async (req, res) => {
    res.json({ requests: await agentRequests(String(req.params.id), 200) });
  })
);

router.get(
  '/agents/:id/ledger',
  asyncHandler(async (req, res) => {
    res.json({ ledger: await agentLedger(String(req.params.id), intParam(req.query.limit, 100, 1, 300)) });
  })
);

/* ------------------------------------------------------- agent packages ---- */

router.get(
  '/agent-packages',
  asyncHandler(async (_req, res) => {
    const packages = await q('SELECT * FROM agent_packages ORDER BY sort_order, amount');
    res.json({ packages });
  })
);

router.post(
  '/agent-packages',
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const amount = Math.trunc(Number(req.body?.amount));
    const costCoins = Math.trunc(Number(req.body?.costCoins));
    if (!name) throw new HttpError(400, 'Enter a package name', 'missing_name');
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpError(400, 'Enter a valid amount', 'invalid_amount');
    }
    if (!Number.isFinite(costCoins) || costCoins <= 0) {
      throw new HttpError(400, 'Enter a valid cost', 'invalid_cost');
    }
    const created = await one(
      `INSERT INTO agent_packages (name, currency, amount, cost_coins, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        name.slice(0, 60),
        parseCurrency(req.body?.currency),
        amount,
        costCoins,
        req.body?.isActive !== false,
        Math.trunc(Number(req.body?.sortOrder) || 0),
      ]
    );
    res.status(201).json({ package: created });
  })
);

router.put(
  '/agent-packages/:id',
  asyncHandler(async (req, res) => {
    const amount = Math.trunc(Number(req.body?.amount));
    const costCoins = Math.trunc(Number(req.body?.costCoins));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpError(400, 'Enter a valid amount', 'invalid_amount');
    }
    if (!Number.isFinite(costCoins) || costCoins <= 0) {
      throw new HttpError(400, 'Enter a valid cost', 'invalid_cost');
    }
    const updated = await one(
      `UPDATE agent_packages SET name = $2, currency = $3, amount = $4, cost_coins = $5,
         is_active = $6, sort_order = $7 WHERE id = $1 RETURNING *`,
      [
        String(req.params.id),
        String(req.body?.name || '').trim().slice(0, 60) || 'باقة',
        parseCurrency(req.body?.currency),
        amount,
        costCoins,
        req.body?.isActive !== false,
        Math.trunc(Number(req.body?.sortOrder) || 0),
      ]
    );
    if (!updated) throw new HttpError(404, 'Package not found', 'package_missing');
    res.json({ package: updated });
  })
);

router.delete(
  '/agent-packages/:id',
  asyncHandler(async (req, res) => {
    await q('UPDATE agent_packages SET is_active = false WHERE id = $1', [String(req.params.id)]);
    res.json({ ok: true });
  })
);

export default router;
