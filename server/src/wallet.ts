import type { PoolClient } from 'pg';
import { HttpError } from './utils';

export interface WalletRow {
  user_id: string;
  balance: number;
  reserved: number;
  earned: number;
  spent: number;
}

export async function ensureWallet(c: PoolClient, userId: string): Promise<void> {
  await c.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [
    userId,
  ]);
}

/** Row-locks the wallet so concurrent calls/orders can never race the balance. */
export async function lockWallet(c: PoolClient, userId: string): Promise<WalletRow> {
  await ensureWallet(c, userId);
  const { rows } = await c.query<WalletRow>(
    'SELECT user_id, balance, reserved, earned, spent FROM wallets WHERE user_id = $1 FOR UPDATE',
    [userId]
  );
  return rows[0];
}

export interface LedgerEntry {
  userId: string;
  amount: number;
  type: string;
  refType?: string | null;
  refId?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Applies `amount` to the balance and writes the ledger row in the same statement pair.
 * Repeated references are ignored (idempotent), so a retried request can never pay twice.
 */
export async function moveCoins(
  c: PoolClient,
  entry: LedgerEntry
): Promise<{ balanceAfter: number; applied: boolean }> {
  const wallet = await lockWallet(c, entry.userId);
  const balanceAfter = wallet.balance + entry.amount;
  if (balanceAfter < 0) {
    throw new HttpError(402, 'Insufficient coins', 'insufficient_coins', {
      balance: wallet.balance,
      required: Math.abs(entry.amount),
    });
  }

  const insert = await c.query(
    `INSERT INTO transactions (user_id, type, amount, balance_after, ref_type, ref_id, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (user_id, type, ref_id) DO NOTHING
     RETURNING id`,
    [
      entry.userId,
      entry.type,
      entry.amount,
      balanceAfter,
      entry.refType ?? null,
      entry.refId ?? null,
      JSON.stringify(entry.meta ?? {}),
    ]
  );
  if (!insert.rowCount) return { balanceAfter: wallet.balance, applied: false };

  await c.query('UPDATE wallets SET balance = $2, updated_at = now() WHERE user_id = $1', [
    entry.userId,
    balanceAfter,
  ]);
  return { balanceAfter, applied: true };
}

/** Informational ledger row for coins that already left the balance when they were reserved. */
export async function recordLedger(
  c: PoolClient,
  entry: LedgerEntry & { balanceAfter: number }
): Promise<void> {
  await c.query(
    `INSERT INTO transactions (user_id, type, amount, balance_after, ref_type, ref_id, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (user_id, type, ref_id) DO NOTHING`,
    [
      entry.userId,
      entry.type,
      entry.amount,
      entry.balanceAfter,
      entry.refType ?? null,
      entry.refId ?? null,
      JSON.stringify(entry.meta ?? {}),
    ]
  );
}
