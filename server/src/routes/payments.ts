import crypto from 'node:crypto';
import { Router } from 'express';
import { confirmOrder } from '../orders';
import { emitToUser } from '../realtime';
import { notify } from '../notify';
import { HttpError, asyncHandler } from '../utils';

const router = Router();

/**
 * Server-to-server payment callback. The signature is an HMAC-SHA256 of the raw body
 * using PAYMENT_WEBHOOK_SECRET, so a payment is only ever credited on a trusted call.
 */
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) {
      throw new HttpError(503, 'Payment webhook is not configured', 'webhook_not_configured');
    }
    const signature = String(req.headers['x-signature'] || '');
    const raw = JSON.stringify(req.body ?? {});
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const valid =
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) throw new HttpError(401, 'Invalid signature', 'invalid_signature');

    const orderId = String(req.body?.orderId || '');
    const status = String(req.body?.status || '');
    const providerRef = req.body?.providerRef ? String(req.body.providerRef) : null;
    if (!orderId) throw new HttpError(400, 'Missing orderId', 'missing_order');
    if (status !== 'paid') {
      res.json({ ok: true, ignored: true });
      return;
    }

    const result = await confirmOrder(orderId, providerRef, 'provider_webhook');
    if (result.credited) {
      emitToUser(result.order.user_id, 'wallet:update', { balance: result.balanceAfter });
      await notify(
        result.order.user_id,
        'recharge_confirmed',
        'تم شحن الكونز',
        `أضيف ${result.order.coins} كونز إلى محفظتك`,
        { coins: result.order.coins, orderId }
      );
    }
    res.json({ ok: true, credited: result.credited });
  })
);

export default router;
