import type { PoolClient } from 'pg';
import { getProfitWallet, moveProfit } from './gifts';
import { getSettings, type AppSettings, type WithdrawalMethod } from './settings';
import { HttpError } from './utils';

/**
 * BEANS → money payouts.
 *
 * A request freezes the rate, the fee and the net amount at creation time, so a
 * later change in the admin panel can never alter an open request. The beans are
 * moved from `available` to `pending` immediately (they cannot be spent twice);
 * a rejection releases them back and a confirmed payment settles them.
 */

export const PAYOUT_CURRENCIES = ['IQD', 'USD'] as const;
export type PayoutCurrency = (typeof PAYOUT_CURRENCIES)[number];

export function enabledMethods(settings: AppSettings): WithdrawalMethod[] {
  return settings.withdrawal_methods.filter((method) => method.enabled);
}

function money(value: number, currency: PayoutCurrency): number {
  return currency === 'USD' ? Math.round(value * 100) / 100 : Math.round(value);
}

export interface WithdrawalQuote {
  currency: PayoutCurrency;
  /** USD: beans per 1 USD. IQD: IQD per 1 bean. */
  rate: number;
  /** Amount before the fee, in the chosen currency. */
  gross: number;
  feePercent: number;
  feeAmount: number;
  /** Amount the user actually receives. */
  net: number;
}

/** Pure calculation used by the API and by the client's live preview. */
export function quoteWithdrawal(
  settings: AppSettings,
  beans: number,
  currency: PayoutCurrency
): WithdrawalQuote {
  const rate = currency === 'USD' ? settings.beans_per_usd : settings.bean_to_iqd_rate;
  if (!(rate > 0)) {
    throw new HttpError(400, 'The withdrawal rate is not configured', 'rate_unavailable');
  }
  const raw = currency === 'USD' ? beans / rate : beans * rate;
  const gross = money(raw, currency);
  const feePercent = Math.min(100, Math.max(0, Number(settings.withdrawal_fee_percent) || 0));
  const feeAmount = money((gross * feePercent) / 100, currency);
  return { currency, rate, gross, feePercent, feeAmount, net: Math.max(0, gross - feeAmount) };
}

export interface CreateWithdrawalParams {
  userId: string;
  beans: number;
  currency: string;
  method: string;
  details: string;
}

/** Validates and creates a payout request, moving the beans into `pending`. */
export async function createWithdrawal(c: PoolClient, params: CreateWithdrawalParams) {
  const settings = await getSettings();
  const beans = Math.trunc(Number(params.beans || 0));
  if (!Number.isFinite(beans) || beans <= 0) {
    throw new HttpError(400, 'Enter a valid amount', 'invalid_amount');
  }
  if (beans < settings.min_withdrawal_beans) {
    throw new HttpError(
      400,
      `Minimum withdrawal is ${settings.min_withdrawal_beans} beans`,
      'below_minimum',
      { min: settings.min_withdrawal_beans }
    );
  }
  if (settings.max_withdrawal_beans > 0 && beans > settings.max_withdrawal_beans) {
    throw new HttpError(
      400,
      `Maximum withdrawal is ${settings.max_withdrawal_beans} beans`,
      'above_maximum',
      { max: settings.max_withdrawal_beans }
    );
  }
  const currency = String(params.currency || 'IQD').toUpperCase() as PayoutCurrency;
  if (!PAYOUT_CURRENCIES.includes(currency)) {
    throw new HttpError(400, 'Unsupported currency', 'invalid_currency');
  }
  const method = String(params.method || '').trim().toLowerCase();
  if (!enabledMethods(settings).some((item) => item.id === method)) {
    throw new HttpError(400, 'This payment method is not available', 'invalid_method');
  }
  const details = String(params.details || '').trim().slice(0, 400);
  if (details.length < 4) {
    throw new HttpError(400, 'Enter the payout details', 'missing_details');
  }

  const quote = quoteWithdrawal(settings, beans, currency);
  const wallet = await getProfitWallet(params.userId);

  const created = await c.query(
    `INSERT INTO withdrawal_requests
       (user_id, coins, amount_iqd, amount, currency, payment_method, payout_details, source,
        status, rate, fee_percent, fee_amount, net_amount, balance_before)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'profit', 'pending', $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      params.userId,
      beans,
      currency === 'IQD' ? quote.gross : money(beans * settings.bean_to_iqd_rate, 'IQD'),
      quote.gross,
      currency,
      method,
      details,
      quote.rate,
      quote.feePercent,
      quote.feeAmount,
      quote.net,
      wallet.available,
    ]
  );
  const row = created.rows[0];

  await moveProfit(c, {
    userId: params.userId,
    type: 'withdrawal_hold',
    amount: -beans,
    hold: beans,
    refType: 'withdrawal_request',
    refId: row.id,
    meta: {
      beans,
      currency,
      method,
      gross: quote.gross,
      feePercent: quote.feePercent,
      feeAmount: quote.feeAmount,
      net: quote.net,
      rate: quote.rate,
    },
  });

  return { withdrawal: row, quote };
}

/** Shape returned to the app for a payout request row. */
export function serializeWithdrawal(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    beans: Number(row.coins || 0),
    amount: Number(row.amount || 0),
    amountIqd: Number(row.amount_iqd || 0),
    currency: String(row.currency || 'IQD'),
    rate: Number(row.rate || 0),
    feePercent: Number(row.fee_percent || 0),
    feeAmount: Number(row.fee_amount || 0),
    net: Number(row.net_amount || 0),
    method: String(row.payment_method || ''),
    details: String(row.payout_details || ''),
    status: String(row.status || 'pending'),
    note: row.note ? String(row.note) : null,
    rejectReason: row.reject_reason ? String(row.reject_reason) : null,
    transferRef: row.transfer_ref ? String(row.transfer_ref) : null,
    proofUrl: row.proof_url ? String(row.proof_url) : null,
    balanceBefore: Number(row.balance_before || 0),
    createdAt: row.created_at,
    processedAt: row.processed_at ?? null,
  };
}
