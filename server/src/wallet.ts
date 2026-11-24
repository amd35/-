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
    `INSERT INTO transactions
       (user_id, type, amount, balance_before, balance_after, ref_type, ref_id, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (user_id, type, ref_id) DO NOTHING
     RETURNING id`,
    [
      entry.userId,
      entry.type,
      entry.amount,
      wallet.balance,
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
  entry: LedgerEntry & { balanceAfter: number; balanceBefore?: number }
): Promise<void> {
  await c.query(
    `INSERT INTO transactions
       (user_id, type, amount, balance_before, balance_after, ref_type, ref_id, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (user_id, type, ref_id) DO NOTHING`,
    [
      entry.userId,
      entry.type,
      entry.amount,
      entry.balanceBefore ?? entry.balanceAfter - entry.amount,
      entry.balanceAfter,
      entry.refType ?? null,
      entry.refId ?? null,
      JSON.stringify(entry.meta ?? {}),
    ]
  );
}

/** Row-locks the wallet's gold balance. */
export async function lockGoldWallet(c: PoolClient, userId: string): Promise<number> {
  await ensureWallet(c, userId);
  const { rows } = await c.query<{ gold: number }>(
    'SELECT gold FROM wallets WHERE user_id = $1 FOR UPDATE',
    [userId]
  );
  return Number(rows[0].gold);
}

/**
 * Applies `amount` to the GOLD balance and writes the gold ledger row in the same
 * transaction. Repeated references are ignored, exactly like `moveCoins`.
 */
export async function moveGold(
  c: PoolClient,
  entry: LedgerEntry
): Promise<{ balanceBefore: number; balanceAfter: number; applied: boolean }> {
  const balanceBefore = await lockGoldWallet(c, entry.userId);
  const balanceAfter = balanceBefore + entry.amount;
  if (balanceAfter < 0) {
    throw new HttpError(402, 'Insufficient gold', 'insufficient_gold', {
      balance: balanceBefore,
      required: Math.abs(entry.amount),
    });
  }

  const insert = await c.query(
    `INSERT INTO gold_transactions
       (user_id, type, amount, balance_before, balance_after, ref_type, ref_id, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (user_id, type, ref_id) DO NOTHING
     RETURNING id`,
    [
      entry.userId,
      entry.type,
      entry.amount,
      balanceBefore,
      balanceAfter,
      entry.refType ?? null,
      entry.refId ?? null,
      JSON.stringify(entry.meta ?? {}),
    ]
  );
  if (!insert.rowCount) return { balanceBefore, balanceAfter: balanceBefore, applied: false };

  await c.query('UPDATE wallets SET gold = $2, updated_at = now() WHERE user_id = $1', [
    entry.userId,
    balanceAfter,
  ]);
  return { balanceBefore, balanceAfter, applied: true };
}
