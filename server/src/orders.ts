import { tx } from './db';
import { HttpError } from './utils';
import { moveCoins } from './wallet';

export interface PaymentOrderRow {
  id: string;
  user_id: string;
  package_id: string | null;
  coins: number;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  provider_ref: string | null;
  note: string | null;
  created_at: string;
  paid_at: string | null;
}

/**
 * The only place coins are ever granted for a payment. Runs in one transaction and is
 * idempotent: a repeated webhook or a double admin click can never credit twice.
 */
export async function confirmOrder(
  orderId: string,
  providerRef: string | null,
  source: string
): Promise<{ order: PaymentOrderRow; credited: boolean; balanceAfter: number | null }> {
  return tx(async (c) => {
    const { rows } = await c.query<PaymentOrderRow>(
      'SELECT * FROM payment_orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );
    const order = rows[0];
    if (!order) throw new HttpError(404, 'Order not found', 'order_not_found');
    if (order.status === 'paid') {
      return { order, credited: false, balanceAfter: null };
    }
    if (order.status !== 'pending') {
      throw new HttpError(409, 'This order can no longer be confirmed', 'order_not_pending');
    }

    const updated = await c.query<PaymentOrderRow>(
      `UPDATE payment_orders
       SET status = 'paid', paid_at = now(),
           provider_ref = COALESCE($2, provider_ref),
           note = COALESCE(note, $3)
       WHERE id = $1 RETURNING *`,
      [orderId, providerRef, source]
    );
    const moved = await moveCoins(c, {
      userId: order.user_id,
      amount: order.coins,
      type: 'recharge',
      refType: 'payment_order',
      refId: order.id,
      meta: { provider: order.provider, amount: order.amount, currency: order.currency, source },
    });
    return { order: updated.rows[0], credited: moved.applied, balanceAfter: moved.balanceAfter };
  });
}
