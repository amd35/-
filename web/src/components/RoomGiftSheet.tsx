import { useCallback, useEffect, useRef, useState } from 'react';
import { api, assetUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { GiftCover } from './GiftAnimation';
import { CurrencyIcon } from './CurrencyIcon';
import type { GiftItem } from './GiftShop';
import type { RankInfo } from './RankBadge';

export interface RoomGiftInfo {
  id: string;
  name: string;
  nameEn: string;
  slug: string | null;
  design: string | null;
  videoUrl: string | null;
  coverUrl: string | null;
  rarity: string;
  price: number;
  recipientCoins: number;
  quantity?: number;
}

export interface RoomMessageData {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  body: string;
  type: string;
  isAnnouncement?: boolean;
  rank?: RankInfo | null;
  createdAt: string;
  gift: RoomGiftInfo | null;
}

export interface RoomSpeaker {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

const RARITY_LABEL: Record<string, string> = {
  common: 'عادي',
  rare: 'نادر',
  epic: 'ملحمي',
  legendary: 'أسطوري',
  vip: 'VIP',
};

/** Quick quantity picks for one gift send. */
const QUANTITIES = [1, 7, 17, 77, 777, 999, 1000, 2000];

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Picks a person on a mic, then a gift from the catalog, and sends it into the room. */
export function RoomGiftSheet({
  open,
  onClose,
  roomId,
  speakers,
  onSent,
  initialRecipientId,
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
  speakers: RoomSpeaker[];
  onSent: (message: RoomMessageData) => void;
  /** Preselects the person whose profile card opened the gift shop. */
  initialRecipientId?: string | null;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [goldBalance, setGoldBalance] = useState(0);
  const [goldGiftsEnabled, setGoldGiftsEnabled] = useState(false);
  const [currency, setCurrency] = useState<'diamond' | 'gold'>('diamond');
  const [loading, setLoading] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const [selected, setSelected] = useState<GiftItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [sending, setSending] = useState(false);
  const requestRef = useRef('');
  // `speakers` is a fresh array on every render of the room, so depend on the id
  // string instead — otherwise the effect re-fetches the gift list in a loop.
  const firstSpeakerId = speakers[0]?.id ?? '';

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setQuantity(1);
    setRecipientId((current) => initialRecipientId || current || firstSpeakerId);
    requestRef.current = '';
    setLoading(true);
    api<{ gifts: GiftItem[]; balance: number; goldBalance: number; goldGiftsEnabled: boolean }>('/gifts')
      .then((response) => {
        setGifts(response.gifts);
        setBalance(response.balance);
        setGoldBalance(response.goldBalance ?? 0);
        setGoldGiftsEnabled(Boolean(response.goldGiftsEnabled));
      })
      .catch((error: Error) => toast.push(error.message, 'error'))
      .finally(() => setLoading(false));
  }, [open, firstSpeakerId, initialRecipientId, toast]);

  const activeBalance = currency === 'gold' ? goldBalance : balance;

  const send = useCallback(async () => {
    if (!selected || !recipientId || sending) return;
    if (activeBalance < selected.price * quantity) {
      toast.push(t('insufficientCoins'), 'error');
      return;
    }
    if (!requestRef.current) requestRef.current = newRequestId();
    setSending(true);
    try {
      const response = await api<{ message: RoomMessageData }>(`/rooms/${roomId}/gifts`, {
        method: 'POST',
        body: { giftId: selected.id, recipientId, requestId: requestRef.current, quantity, currency },
      });
      requestRef.current = '';
      if (currency === 'gold') {
        setGoldBalance((current) => current - selected.price * quantity);
      } else {
        setBalance((current) => current - selected.price * quantity);
      }
      onSent(response.message);
      setSelected(null);
      onClose();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }, [activeBalance, currency, onClose, onSent, quantity, recipientId, roomId, selected, sending, t, toast]);

  return (
    <Sheet open={open} onClose={onClose} title={t('giftShop')}>
      <div className="gift-shop">
        <div className="gift-shop-head">
          <span className="tiny muted">{t('roomGiftTo')}</span>
          <span className="spacer" />
          <span className="pill pill-gold">
            <CurrencyIcon code={currency === 'gold' ? 'GOLD' : 'DIAMOND'} size={13} /> {formatCoins(activeBalance)}
          </span>
        </div>

        {goldGiftsEnabled ? (
          <div className="seg" style={{ marginBottom: 10 }}>
            <button className={currency === 'diamond' ? 'active' : ''} onClick={() => setCurrency('diamond')}>
              الماس
            </button>
            <button className={currency === 'gold' ? 'active' : ''} onClick={() => setCurrency('gold')}>
              الذهب
            </button>
          </div>
        ) : null}

        {speakers.length === 0 ? (
          <p className="tiny muted center">{t('roomNoSpeakers')}</p>
        ) : (
          <div className="room-gift-people">
            {speakers.map((speaker) => (
              <button
                key={speaker.id}
                type="button"
                className={`room-gift-person ${recipientId === speaker.id ? 'active' : ''}`}
                onClick={() => setRecipientId(speaker.id)}
              >
                <span className="room-gift-avatar">
                  {speaker.avatarUrl ? (
                    <img src={assetUrl(speaker.avatarUrl)} alt="" />
                  ) : (
                    speaker.displayName.charAt(0)
                  )}
                </span>
                <span>{speaker.displayName}</span>
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <Spinner label={t('loading')} />
        ) : (
          <div className="gift-grid">
            {gifts.map((gift) => (
              <button
                key={gift.id}
                type="button"
                className={`gift-card ${activeBalance < gift.price ? 'locked' : ''} ${selected?.id === gift.id ? 'selected' : ''}`}
                onClick={() => setSelected(gift)}
              >
                <span className={`gift-rarity-pill rarity-${gift.rarity}`}>
                  {RARITY_LABEL[gift.rarity] ?? gift.rarity}
                </span>
                <GiftCover gift={gift} className="gift-card-art" />
                <span className="gift-card-name">{gift.name}</span>
                <span className="gift-card-price">
                  <CurrencyIcon code={currency === 'gold' ? 'GOLD' : 'DIAMOND'} size={12} /> {formatCoins(gift.price)}
                </span>
              </button>
            ))}
            {gifts.length === 0 ? (
              <div className="empty" style={{ gridColumn: '1 / -1' }}>
                <Icon name="gift" size={22} />
                <span className="tiny">{t('noResults')}</span>
              </div>
            ) : null}
          </div>
        )}

        <div className="gift-qty">
          <span className="gift-qty-label">عدد الهدايا</span>
          <div className="gift-qty-row">
            {QUANTITIES.map((count) => (
              <button
                key={count}
                type="button"
                className={`gift-qty-chip${quantity === count ? ' active' : ''}`}
                onClick={() => setQuantity(count)}
              >
                {count}
              </button>
            ))}
          </div>
        </div>

        <button
          className="btn btn-primary btn-block"
          onClick={() => void send()}
          disabled={!selected || !recipientId || sending}
        >
          {sending ? <span className="spinner" /> : <Icon name="gift" size={18} />}
          {t('sendGift')}
          {selected ? ` · ${formatCoins(selected.price * quantity)}` : ''}
        </button>
      </div>
    </Sheet>
  );
}
