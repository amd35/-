import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon, useToast } from '../lib/ui';
import { CurrencyIcon } from './CurrencyIcon';
import { GiftCover } from './GiftAnimation';
import type { RepeatGiftInfo, RoomMessageData } from './RoomGiftSheet';

/** How long the bar stays open after the last send. */
const WINDOW_SECONDS = 5;

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * «أرسل هدية» bar: every tap sends one gift immediately, restarts the 5-second
 * window and counts up. Taps that arrive while a send is in flight are queued, so
 * fast tapping never drops a gift. Closing it needs no confirmation.
 */
export function GiftRepeatBar({
  roomId,
  info,
  onSent,
  onClose,
}: {
  roomId: string;
  info: RepeatGiftInfo;
  onSent: (message: RoomMessageData) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  // The bar opens right after a successful send, so it already counts one.
  const [count, setCount] = useState(1);
  const [balance, setBalance] = useState(info.balance);
  const [left, setLeft] = useState(WINDOW_SECONDS);
  const deadlineRef = useRef(Date.now() + WINDOW_SECONDS * 1000);
  const queueRef = useRef(0);
  const pumpingRef = useRef(false);
  const balanceRef = useRef(info.balance);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const sentRef = useRef(onSent);
  sentRef.current = onSent;

  const price = info.gift.price * info.quantity;

  // Countdown: the bar disappears as soon as the window lapses.
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = deadlineRef.current - Date.now();
      if (remaining <= 0) {
        setLeft(0);
        closeRef.current();
        return;
      }
      setLeft(Math.ceil(remaining / 1000));
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // Sends queued taps one after another; the server charges each one.
  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    while (queueRef.current > 0) {
      queueRef.current -= 1;
      try {
        const response = await api<{ message: RoomMessageData }>(`/rooms/${roomId}/gifts`, {
          method: 'POST',
          body: {
            giftId: info.gift.id,
            recipientId: info.recipient.id,
            requestId: newRequestId(),
            quantity: info.quantity,
            currency: info.currency,
          },
        });
        balanceRef.current -= price;
        setBalance(balanceRef.current);
        setCount((current) => current + 1);
        deadlineRef.current = Date.now() + WINDOW_SECONDS * 1000;
        setLeft(WINDOW_SECONDS);
        sentRef.current(response.message);
      } catch (error) {
        queueRef.current = 0;
        toast.push((error as Error).message, 'error');
        closeRef.current();
        break;
      }
    }
    pumpingRef.current = false;
  }, [info.currency, info.gift.id, info.quantity, info.recipient.id, price, roomId, toast]);

  const tap = () => {
    if (balanceRef.current < price) {
      toast.push(t('insufficientCoins'), 'error');
      closeRef.current();
      return;
    }
    queueRef.current += 1;
    void pump();
  };

  return (
    <div className="gift-repeat" dir="rtl" role="dialog" aria-label="إرسال هدية">
      <div className="gift-repeat-card">
        <span className="gift-repeat-art">
          <GiftCover gift={info.gift} className="gift-repeat-cover" />
        </span>

        <span className="gift-repeat-copy">
          <b>{info.gift.name}</b>
          <span className="tiny muted">إلى {info.recipient.displayName || 'المستلم'}</span>
          <span className="gift-repeat-count">أرسلت {count} هدية</span>
        </span>

        <span
          className="gift-repeat-timer"
          style={{ '--p': left / WINDOW_SECONDS } as CSSProperties}
          aria-label={`${left} ثوانٍ`}
        >
          <b>{left}</b>
          <small>ثواني</small>
        </span>

        <button type="button" className="gift-repeat-send" onClick={tap}>
          <Icon name="gift" size={18} />
          <span>أرسل المزيد</span>
        </button>
      </div>
      <p className="gift-repeat-hint">
        اضغط باستمرار لإرسال المزيد · {formatCoins(price)}
        <CurrencyIcon code={info.currency === 'gold' ? 'GOLD' : 'DIAMOND'} size={12} />
        <span className="gift-repeat-balance">رصيدك {formatCoins(Math.max(0, balance))}</span>
      </p>
    </div>
  );
}
