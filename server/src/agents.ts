import type { PoolClient } from 'pg';
import { one, q, tx } from './db';
import { notify, notifyWith } from './notify';
import { HttpError } from './utils';
import { moveCoins, moveGold } from './wallet';

/**
 * Official recharge agents (وكلاء الشحن الرسميون).
 *
 * Every money movement of an agent is server-side and append-only:
 *  - the agent balance (coins + gold) lives on `agents`,
 *  - each change writes an `agent_ledger` row (unique per kind + reference),
 *  - a delivered recharge writes `agent_recharges` (unique idempotency key),
 *  - the user's coins move through the normal wallet ledger.
 * The client never sends a price: it is computed here from the package.
 */

export type AgentCurrency = 'coins' | 'gold';
export type AgentStatus = 'active' | 'suspended' | 'revoked';

export interface AgentRow {
  user_id: string;
  status: string;
  commission_percent: number | string;
  coins_balance: number;
  gold_balance: number;
  total_sales_coins: number;
  total_commission: number;
  paid_commission: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}

export interface AgentPackageRow {
  id: string;
  name: string;
  currency: AgentCurrency;
  amount: number;
  cost_coins: number;
  is_active: boolean;
  sort_order: number;
}

const MAX_AMOUNT = 10_000_000;

export function commissionRate(agent: AgentRow): number {
  const value = Number(agent.commission_percent);
  return Number.isFinite(value) ? Math.min(90, Math.max(0, value)) : 0;
}

function balanceColumn(currency: AgentCurrency): string {
  return currency === 'gold' ? 'gold_balance' : 'coins_balance';
}

export function parseCurrency(value: unknown): AgentCurrency {
  return value === 'gold' ? 'gold' : 'coins';
}

/** Whole, positive amount. Amounts are integers, so no fractional coin can ever be minted. */
export function parseAmount(value: unknown): number {
  const amount = Math.trunc(Number(value));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new HttpError(400, 'Enter a valid amount', 'invalid_amount');
  }
  if (amount > MAX_AMOUNT) throw new HttpError(400, 'Amount is too large', 'invalid_amount');
  return amount;
}

export async function agentFor(userId: string): Promise<AgentRow | null> {
  return one<AgentRow>('SELECT * FROM agents WHERE user_id = $1', [userId]);
}

/** The agent record only while the agency is actually live (not suspended, not revoked). */
export async function activeAgent(userId: string): Promise<AgentRow | null> {
  const agent = await agentFor(userId);
  return agent && agent.status === 'active' ? agent : null;
}

export async function requireAgent(userId: string): Promise<AgentRow> {
  const agent = await agentFor(userId);
  if (!agent || agent.status === 'revoked') {
    throw new HttpError(403, 'You are not a recharge agent', 'not_agent');
  }
  if (agent.status === 'suspended') {
    throw new HttpError(403, 'Your agent account is suspended', 'agent_suspended');
  }
  return agent;
}

export async function packageFor(packageId: string): Promise<AgentPackageRow> {
  const pack = await one<AgentPackageRow>(
    'SELECT * FROM agent_packages WHERE id = $1 AND is_active = true',
    [packageId]
  );
  if (!pack) throw new HttpError(404, 'Recharge package not found', 'package_missing');
  return pack;
}

/** Price of `amount` units of a package, in agent coins. Always computed on the server. */
export function quoteFor(pack: AgentPackageRow, amount: number): number {
  return Math.max(1, Math.ceil((Number(pack.cost_coins) * amount) / Number(pack.amount)));
}

interface LedgerInput {
  agentId: string;
  kind: string;
  currency: AgentCurrency;
  amount: number;
  balanceAfter: number;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  actor?: string;
}

async function writeLedger(c: PoolClient, entry: LedgerInput): Promise<void> {
  await c.query(
    `INSERT INTO agent_ledger (agent_id, kind, currency, amount, balance_after, ref_type, ref_id, note, actor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (agent_id, kind, ref_id) DO NOTHING`,
    [
      entry.agentId,
      entry.kind,
      entry.currency,
      entry.amount,
      entry.balanceAfter,
      entry.refType ?? null,
      entry.refId ?? null,
      entry.note ?? null,
      entry.actor ?? 'admin',
    ]
  );
}

async function lockAgent(c: PoolClient, agentId: string): Promise<AgentRow> {
  const { rows } = await c.query<AgentRow>('SELECT * FROM agents WHERE user_id = $1 FOR UPDATE', [
    agentId,
  ]);
  if (!rows[0]) throw new HttpError(404, 'Agent not found', 'agent_missing');
  return rows[0];
}

/* ------------------------------------------------------------------ admin ---- */

export async function assignAgent(params: {
  userId: string;
  commissionPercent: number;
  note?: string | null;
  actor?: string;
}): Promise<AgentRow> {
  const user = await one<{ id: string; display_name: string; username: string; is_bot: boolean }>(
    'SELECT id, display_name, username, is_bot FROM users WHERE id = $1',
    [params.userId]
  );
  if (!user || user.is_bot) throw new HttpError(404, 'User not found', 'user_not_found');

  const percent = Math.min(90, Math.max(0, Number(params.commissionPercent) || 0));
  const agent = await one<AgentRow>(
    `INSERT INTO agents (user_id, status, commission_percent, note, assigned_by)
     VALUES ($1, 'active', $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET status = 'active', commission_percent = EXCLUDED.commission_percent,
           note = EXCLUDED.note, revoked_at = NULL, updated_at = now()
     RETURNING *`,
    [user.id, percent, params.note ?? null, params.actor ?? 'admin']
  );
  await notify(
    user.id,
    'agent_assigned',
    'تم تعيينك وكيل شحن رسمياً',
    `أصبحت وكيل شحن رسمياً في التطبيق — نسبة عمولتك ${percent}%`,
    { commissionPercent: percent }
  );
  return agent as AgentRow;
}

export async function updateAgent(
  userId: string,
  patch: { commissionPercent?: number; note?: string | null }
): Promise<AgentRow> {
  const agent = await agentFor(userId);
  if (!agent) throw new HttpError(404, 'Agent not found', 'agent_missing');
  const percent =
    patch.commissionPercent === undefined
      ? commissionRate(agent)
      : Math.min(90, Math.max(0, Number(patch.commissionPercent) || 0));
  const updated = await one<AgentRow>(
    `UPDATE agents SET commission_percent = $2, note = COALESCE($3, note), updated_at = now()
     WHERE user_id = $1 RETURNING *`,
    [userId, percent, patch.note ?? null]
  );
  if (patch.commissionPercent !== undefined && percent !== commissionRate(agent)) {
    await notify(
      userId,
      'agent_commission',
      'تم تحديث نسبة عمولتك',
      `نسبة عمولتك الآن ${percent}%`,
      { commissionPercent: percent }
    );
  }
  return updated as AgentRow;
}

export async function setAgentStatus(userId: string, status: AgentStatus): Promise<AgentRow> {
  const agent = await agentFor(userId);
  if (!agent) throw new HttpError(404, 'Agent not found', 'agent_missing');
  const updated = await one<AgentRow>(
    `UPDATE agents SET status = $2, revoked_at = CASE WHEN $2 = 'revoked' THEN now() ELSE NULL END,
       updated_at = now() WHERE user_id = $1 RETURNING *`,
    [userId, status]
  );
  if (status === 'suspended') {
    await notify(userId, 'agent_suspended', 'تم إيقاف وكالة الشحن مؤقتاً', 'لا يمكنك تنفيذ عمليات شحن حتى إعادة التفعيل.');
  } else if (status === 'active') {
    await notify(userId, 'agent_active', 'تم إعادة تفعيل وكالتك', 'يمكنك الآن استقبال طلبات الشحن وتنفيذها.');
  } else {
    await notify(userId, 'agent_revoked', 'تم سحب صفة وكيل الشحن', 'أُلغيت وكالتك من قبل الإدارة.');
  }
  return updated as AgentRow;
}

export async function adjustAgentBalance(params: {
  agentId: string;
  currency: AgentCurrency;
  delta: number;
  note?: string | null;
}): Promise<{ balanceAfter: number }> {
  const delta = Math.trunc(params.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new HttpError(400, 'Enter a valid amount', 'invalid_amount');
  }
  return tx(async (c) => {
    const agent = await lockAgent(c, params.agentId);
    if (agent.status === 'revoked') throw new HttpError(400, 'This agency was revoked', 'agent_revoked');
    const column = balanceColumn(params.currency);
    const current = Number(agent[column as 'coins_balance' | 'gold_balance']);
    const next = current + delta;
    if (next < 0) {
      throw new HttpError(402, 'Agent balance is not enough', 'insufficient_agent_balance', {
        balance: current,
        required: Math.abs(delta),
      });
    }
    await c.query(`UPDATE agents SET ${column} = $2, updated_at = now() WHERE user_id = $1`, [
      params.agentId,
      next,
    ]);
    await writeLedger(c, {
      agentId: params.agentId,
      kind: delta > 0 ? 'credit' : 'debit',
      currency: params.currency,
      amount: Math.abs(delta),
      balanceAfter: next,
      refType: 'admin',
      refId: null,
      note: params.note ?? null,
    });
    await notifyWith(
      c,
      params.agentId,
      delta > 0 ? 'agent_credit' : 'agent_debit',
      delta > 0 ? 'تمت إضافة رصيد لوكالتك' : 'تم خصم رصيد من وكالتك',
      `${Math.abs(delta)} ${params.currency === 'gold' ? 'ذهب' : 'كونز'} — رصيدك الآن ${next}`,
      { currency: params.currency, amount: Math.abs(delta), balance: next }
    );
    return { balanceAfter: next };
  });
}

export async function payoutCommission(params: {
  agentId: string;
  amount: number;
  note?: string | null;
}): Promise<{ due: number; paid: number }> {
  const amount = parseAmount(params.amount);
  return tx(async (c) => {
    const agent = await lockAgent(c, params.agentId);
    const due = Number(agent.total_commission) - Number(agent.paid_commission);
    if (amount > due) {
      throw new HttpError(400, 'The payout is larger than the due commission', 'payout_exceeds_due', {
        due,
      });
    }
    const paid = Number(agent.paid_commission) + amount;
    await c.query('UPDATE agents SET paid_commission = $2, updated_at = now() WHERE user_id = $1', [
      params.agentId,
      paid,
    ]);
    await writeLedger(c, {
      agentId: params.agentId,
      kind: 'payout',
      currency: 'coins',
      amount: -amount,
      balanceAfter: Number(agent.coins_balance),
      refType: 'commission_payout',
      refId: null,
      note: params.note ?? null,
    });
    await notifyWith(
      c,
      params.agentId,
      'agent_payout',
      'تمت تسوية أرباحك',
      `تم صرف ${amount} كونز من أرباحك المستحقة.`,
      { amount, due: due - amount }
    );
    return { due: due - amount, paid };
  });
}

export async function messageAgent(agentId: string, title: string, body: string): Promise<void> {
  await notify(agentId, 'agent_message', title, body);
}

/* --------------------------------------------------------------- recharge ---- */

interface RechargeParams {
  agentId: string;
  userId: string;
  packageId: string | null;
  currency: AgentCurrency;
  amount: number;
  costCoins: number;
  idempotencyKey: string;
  note?: string | null;
  /** Only a direct recharge needs the double-tap window; a request is already unique. */
  guardDoubleTap?: boolean;
}

async function runRecharge(c: PoolClient, params: RechargeParams) {
  const agent = await lockAgent(c, params.agentId);
  if (agent.status !== 'active') {
    throw new HttpError(403, 'This agency is not active', 'agent_inactive');
  }
  if (params.userId === params.agentId) {
    throw new HttpError(400, 'You cannot recharge your own account', 'self_recharge');
  }

  const duplicate = await c.query(
    'SELECT id FROM agent_recharges WHERE agent_id = $1 AND idempotency_key = $2',
    [params.agentId, params.idempotencyKey]
  );
  if (duplicate.rowCount) {
    throw new HttpError(409, 'This recharge was already processed', 'duplicate_recharge');
  }
  // A second identical direct recharge seconds after the first is a double tap, not a sale.
  if (params.guardDoubleTap) {
    const recent = await c.query(
      `SELECT id FROM agent_recharges
        WHERE agent_id = $1 AND user_id = $2 AND currency = $3 AND amount = $4
          AND created_at > now() - interval '5 seconds' LIMIT 1`,
      [params.agentId, params.userId, params.currency, params.amount]
    );
    if (recent.rowCount) {
      throw new HttpError(409, 'Duplicate recharge blocked', 'duplicate_recharge');
    }
  }

  const cost = Math.trunc(params.costCoins);
  const balance = Number(agent.coins_balance);
  if (cost > balance) {
    throw new HttpError(402, 'Your recharge balance is not enough', 'insufficient_agent_balance', {
      balance,
      required: cost,
    });
  }
  const commission = Math.floor((cost * commissionRate(agent)) / 100);
  const balanceAfter = balance - cost;

  const inserted = await c.query<{ id: string; created_at: string }>(
    `INSERT INTO agent_recharges
       (agent_id, user_id, package_id, currency, amount, cost_coins, commission_coins, idempotency_key, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, created_at`,
    [
      params.agentId,
      params.userId,
      params.packageId,
      params.currency,
      params.amount,
      cost,
      commission,
      params.idempotencyKey,
      params.note ?? null,
    ]
  );
  const rechargeId = inserted.rows[0].id;

  await c.query(
    `UPDATE agents SET coins_balance = $2, total_sales_coins = total_sales_coins + $3,
       total_commission = total_commission + $4, updated_at = now() WHERE user_id = $1`,
    [params.agentId, balanceAfter, cost, commission]
  );
  await writeLedger(c, {
    agentId: params.agentId,
    kind: 'recharge',
    currency: 'coins',
    amount: -cost,
    balanceAfter,
    refType: 'agent_recharge',
    refId: rechargeId,
    note: params.note ?? null,
    actor: 'agent',
  });
  if (commission > 0) {
    await writeLedger(c, {
      agentId: params.agentId,
      kind: 'commission',
      currency: 'coins',
      amount: commission,
      balanceAfter,
      refType: 'agent_recharge',
      refId: rechargeId,
      note: 'عمولة شحن',
      actor: 'system',
    });
  }

  if (params.currency === 'gold') {
    await moveGold(c, {
      userId: params.userId,
      amount: params.amount,
      type: 'agent_recharge',
      refType: 'agent_recharge',
      refId: rechargeId,
      meta: { agentId: params.agentId, currency: params.currency },
    });
  } else {
    await moveCoins(c, {
      userId: params.userId,
      amount: params.amount,
      type: 'agent_recharge',
      refType: 'agent_recharge',
      refId: rechargeId,
      meta: { agentId: params.agentId, currency: params.currency },
    });
  }

  await notifyWith(
    c,
    params.userId,
    'agent_recharge',
    'تم شحن حسابك',
    `أضاف وكيل الشحن ${params.amount} ${params.currency === 'gold' ? 'ذهب' : 'كونز'} إلى حسابك.`,
    {
      rechargeId,
      agentId: params.agentId,
      amount: params.amount,
      currency: params.currency,
    }
  );
  await notifyWith(
    c,
    params.agentId,
    'agent_sale',
    'عملية شحن ناجحة',
    `شحنت ${params.amount} ${params.currency === 'gold' ? 'ذهب' : 'كونز'} بقيمة ${cost} كونز.`,
    { rechargeId, userId: params.userId, amount: params.amount, currency: params.currency }
  );

  return {
    id: rechargeId,
    createdAt: inserted.rows[0].created_at,
    amount: params.amount,
    currency: params.currency,
    costCoins: cost,
    commissionCoins: commission,
    balanceAfter,
  };
}

/** Direct recharge performed by the agent after checking the receiver. */
export async function recharge(params: RechargeParams) {
  return tx((c) => runRecharge(c, { ...params, guardDoubleTap: true }));
}

/** Price quote for the agent panel: package + amount → cost and commission preview. */
export async function quote(packageId: string, amount: number) {
  const pack = await packageFor(packageId);
  const cost = quoteFor(pack, amount);
  return {
    package: pack,
    amount,
    costCoins: cost,
    currency: pack.currency,
  };
}

/* --------------------------------------------------------------- requests ---- */

export async function createRequest(params: {
  userId: string;
  agentId: string;
  packageId: string;
  amount: number;
  note?: string | null;
}) {
  const agent = await agentFor(params.agentId);
  if (!agent || agent.status !== 'active') {
    throw new HttpError(404, 'This agent is not available', 'agent_unavailable');
  }
  if (params.userId === params.agentId) {
    throw new HttpError(400, 'You cannot request a recharge from yourself', 'self_recharge');
  }
  const pack = await packageFor(params.packageId);
  const amount = parseAmount(params.amount);
  const cost = quoteFor(pack, amount);

  return tx(async (c) => {
    const pending = await c.query(
      `SELECT id FROM agent_requests WHERE user_id = $1 AND status = 'pending' LIMIT 1`,
      [params.userId]
    );
    if (pending.rowCount) {
      throw new HttpError(409, 'You already have a pending request', 'request_pending');
    }
    const { rows } = await c.query<{ id: string; created_at: string }>(
      `INSERT INTO agent_requests (agent_id, user_id, package_id, currency, amount, cost_coins, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, created_at`,
      [params.agentId, params.userId, pack.id, pack.currency, amount, cost, params.note ?? null]
    );
    await notifyWith(
      c,
      params.agentId,
      'agent_request',
      'طلب شحن جديد',
      `طلب جديد: ${amount} ${pack.currency === 'gold' ? 'ذهب' : 'كونز'} — القيمة ${cost} كونز.`,
      { requestId: rows[0].id, userId: params.userId, amount, currency: pack.currency, costCoins: cost }
    );
    return { id: rows[0].id, createdAt: rows[0].created_at, amount, costCoins: cost };
  });
}

export async function resolveRequest(params: {
  agentId: string;
  requestId: string;
  action: 'complete' | 'reject';
  agentNote?: string | null;
}) {
  return tx(async (c) => {
    const { rows } = await c.query<{
      id: string;
      agent_id: string;
      user_id: string;
      package_id: string | null;
      currency: AgentCurrency;
      amount: number;
      cost_coins: number;
      status: string;
    }>('SELECT * FROM agent_requests WHERE id = $1 FOR UPDATE', [params.requestId]);
    const request = rows[0];
    if (!request || request.agent_id !== params.agentId) {
      throw new HttpError(404, 'Request not found', 'request_missing');
    }
    if (request.status !== 'pending') {
      throw new HttpError(409, 'This request is already handled', 'request_handled');
    }

    if (params.action === 'reject') {
      await c.query(
        `UPDATE agent_requests SET status = 'rejected', agent_note = $2, resolved_at = now() WHERE id = $1`,
        [request.id, params.agentNote ?? null]
      );
      await notifyWith(
        c,
        request.user_id,
        'agent_request_rejected',
        'تم رفض طلب الشحن',
        params.agentNote || 'تم رفض طلب الشحن من قبل الوكيل.',
        { requestId: request.id, agentId: params.agentId }
      );
      return { status: 'rejected' };
    }

    const result = await runRecharge(c, {
      agentId: params.agentId,
      userId: request.user_id,
      packageId: request.package_id,
      currency: request.currency,
      amount: Number(request.amount),
      costCoins: Number(request.cost_coins),
      idempotencyKey: `request:${request.id}`,
      note: params.agentNote ?? null,
    });
    await c.query(
      `UPDATE agent_requests SET status = 'completed', recharge_id = $2, agent_note = $3, resolved_at = now()
       WHERE id = $1`,
      [request.id, result.id, params.agentNote ?? null]
    );
    return { status: 'completed', recharge: result };
  });
}

export async function cancelRequest(userId: string, requestId: string) {
  return tx(async (c) => {
    const { rows } = await c.query<{ id: string; agent_id: string; status: string }>(
      'SELECT id, agent_id, status FROM agent_requests WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [requestId, userId]
    );
    const request = rows[0];
    if (!request) throw new HttpError(404, 'Request not found', 'request_missing');
    if (request.status !== 'pending') {
      throw new HttpError(409, 'This request is already handled', 'request_handled');
    }
    await c.query(
      `UPDATE agent_requests SET status = 'cancelled', resolved_at = now() WHERE id = $1`,
      [request.id]
    );
    await notifyWith(
      c,
      request.agent_id,
      'agent_request_cancelled',
      'تم إلغاء طلب شحن',
      'ألغى العميل طلب الشحن.',
      { requestId: request.id }
    );
    return { status: 'cancelled' };
  });
}

/* ------------------------------------------------------------------ reads ---- */

const RECHARGE_SELECT = `
  SELECT r.id, r.currency, r.amount, r.cost_coins, r.commission_coins, r.status, r.note,
         r.created_at, r.package_id,
         u.id AS user_id, u.username, u.display_name, u.avatar_url
    FROM agent_recharges r JOIN users u ON u.id = r.user_id`;

function serializeRecharge(row: Record<string, unknown>) {
  return {
    id: row.id,
    currency: row.currency,
    amount: Number(row.amount),
    costCoins: Number(row.cost_coins),
    commissionCoins: Number(row.commission_coins),
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    packageId: row.package_id,
    user: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
  };
}

export async function agentRecharges(agentId: string, limit = 50) {
  const rows = await q(`${RECHARGE_SELECT} WHERE r.agent_id = $1 ORDER BY r.created_at DESC LIMIT $2`, [
    agentId,
    limit,
  ]);
  return rows.map(serializeRecharge);
}

export async function agentRequests(agentId: string, limit = 50) {
  const rows = await q(
    `SELECT ar.id, ar.currency, ar.amount, ar.cost_coins, ar.status, ar.note, ar.agent_note,
            ar.created_at, ar.resolved_at,
            u.id AS user_id, u.username, u.display_name, u.avatar_url
       FROM agent_requests ar JOIN users u ON u.id = ar.user_id
      WHERE ar.agent_id = $1 ORDER BY (ar.status = 'pending') DESC, ar.created_at DESC LIMIT $2`,
    [agentId, limit]
  );
  return rows.map((row) => ({
    id: row.id,
    currency: row.currency,
    amount: Number(row.amount),
    costCoins: Number(row.cost_coins),
    status: row.status,
    note: row.note,
    agentNote: row.agent_note,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    user: {
      id: row.user_id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
    },
  }));
}

export async function agentLedger(agentId: string, limit = 60) {
  const rows = await q(
    `SELECT id, kind, currency, amount, balance_after, ref_type, ref_id, note, actor, created_at
       FROM agent_ledger WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [agentId, limit]
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    currency: row.currency,
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    refType: row.ref_type,
    refId: row.ref_id,
    note: row.note,
    actor: row.actor,
    createdAt: row.created_at,
  }));
}

export async function agentStats(agentId: string) {
  const row = await one<{
    today: string;
    week: string;
    month: string;
    total: string;
    count: string;
    customers: string;
  }>(
    `SELECT COALESCE(SUM(cost_coins) FILTER (WHERE created_at >= date_trunc('day', now())), 0)::text AS today,
            COALESCE(SUM(cost_coins) FILTER (WHERE created_at >= now() - interval '7 days'), 0)::text AS week,
            COALESCE(SUM(cost_coins) FILTER (WHERE created_at >= now() - interval '30 days'), 0)::text AS month,
            COALESCE(SUM(cost_coins), 0)::text AS total,
            count(*)::text AS count,
            count(DISTINCT user_id)::text AS customers
       FROM agent_recharges WHERE agent_id = $1`,
    [agentId]
  );
  const requests = await one<{ pending: string; completed: string; rejected: string; cancelled: string }>(
    `SELECT count(*) FILTER (WHERE status = 'pending')::text AS pending,
            count(*) FILTER (WHERE status = 'completed')::text AS completed,
            count(*) FILTER (WHERE status = 'rejected')::text AS rejected,
            count(*) FILTER (WHERE status = 'cancelled')::text AS cancelled
       FROM agent_requests WHERE agent_id = $1`,
    [agentId]
  );
  return {
    todaySales: Number(row?.today || 0),
    weekSales: Number(row?.week || 0),
    monthSales: Number(row?.month || 0),
    totalSales: Number(row?.total || 0),
    recharges: Number(row?.count || 0),
    customers: Number(row?.customers || 0),
    requests: {
      pending: Number(requests?.pending || 0),
      completed: Number(requests?.completed || 0),
      rejected: Number(requests?.rejected || 0),
      cancelled: Number(requests?.cancelled || 0),
    },
  };
}

/** Everything the agent panel shows, in one payload. */
export async function agentPanel(agentId: string) {
  const agent = await requireAgent(agentId);
  const user = await one<{ id: string; username: string; display_name: string; avatar_url: string | null }>(
    'SELECT id, username, display_name, avatar_url FROM users WHERE id = $1',
    [agentId]
  );
  const packages = await q<AgentPackageRow>(
    'SELECT * FROM agent_packages WHERE is_active = true ORDER BY sort_order, amount'
  );
  const [stats, recharges, requests, ledger] = await Promise.all([
    agentStats(agentId),
    agentRecharges(agentId, 40),
    agentRequests(agentId, 40),
    agentLedger(agentId, 40),
  ]);
  return {
    agent: {
      id: agent.user_id,
      status: agent.status,
      commissionPercent: commissionRate(agent),
      coinsBalance: Number(agent.coins_balance),
      goldBalance: Number(agent.gold_balance),
      totalCommission: Number(agent.total_commission),
      paidCommission: Number(agent.paid_commission),
      dueCommission: Number(agent.total_commission) - Number(agent.paid_commission),
      note: agent.note,
      createdAt: agent.created_at,
    },
    user: user
      ? {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
        }
      : null,
    packages: packages.map((pack) => ({
      id: pack.id,
      name: pack.name,
      currency: pack.currency,
      amount: Number(pack.amount),
      costCoins: Number(pack.cost_coins),
    })),
    stats,
    recharges,
    requests,
    ledger,
  };
}

/** Public list of agencies the admin approved — no balances, no commission rates. */
export async function officialAgents() {
  return q<{
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
    last_seen_at: string | null;
    since: string;
  }>(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.last_seen_at, a.created_at AS since
       FROM agents a JOIN users u ON u.id = a.user_id
      WHERE a.status = 'active' AND u.is_banned = false
      ORDER BY a.created_at DESC`
  );
}
