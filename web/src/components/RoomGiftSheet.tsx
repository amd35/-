import { useCallback, useEffect, useRef, useState } from 'react';
import { api, assetUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { GiftAnimation } from './GiftAnimation';
import type { GiftItem } from './GiftShop';

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
}

export interface RoomMessageData {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  body: string;
  type: string;
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
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
  speakers: RoomSpeaker[];
  onSent: (message: RoomMessageData) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const [selected, setSelected] = useState<GiftItem | null>(null);
  const [sending, setSending] = useState(false);
  const requestRef = useRef('');

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setRecipientId((current) => current || speakers[0]?.id || '');
    requestRef.current = '';
    setLoading(true);
    api<{ gifts: GiftItem[]; balance: number }>('/gifts')
      .then((response) => {
        setGifts(response.gifts);
        setBalance(response.balance);
      })
      .catch((error: Error) => toast.push(error.message, 'error'))
      .finally(() => setLoading(false));
  }, [open, speakers, toast]);

  const send = useCallback(async () => {
    if (!selected || !recipientId || sending) return;
    if (balance < selected.price) {
      toast.push(t('insufficientCoins'), 'error');
      return;
    }
    if (!requestRef.current) requestRef.current = newRequestId();
    setSending(true);
    try {
      const response = await api<{ message: RoomMessageData }>(`/rooms/${roomId}/gifts`, {
        method: 'POST',
        body: { giftId: selected.id, recipientId, requestId: requestRef.current },
      });
      requestRef.current = '';
      setBalance((current) => current - selected.price);
      onSent(response.message);
      setSelected(null);
      onClose();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }, [balance, onClose, onSent, recipientId, roomId, selected, sending, t, toast]);

  return (
    <Sheet open={open} onClose={onClose} title={t('giftShop')}>
      <div className="gift-shop">
        <div className="gift-shop-head">
          <span className="tiny muted">{t('roomGiftTo')}</span>
          <span className="spacer" />
          <span className="pill pill-gold">
            <Icon name="coins" size={13} /> {formatCoins(balance)}
          </span>
        </div>

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
                className={`gift-card ${balance < gift.price ? 'locked' : ''} ${selected?.id === gift.id ? 'selected' : ''}`}
                onClick={() => setSelected(gift)}
              >
                <span className={`gift-rarity-pill rarity-${gift.rarity}`}>
                  {RARITY_LABEL[gift.rarity] ?? gift.rarity}
                </span>
                <GiftAnimation gift={gift} className="gift-card-art" />
                <span className="gift-card-name">{gift.name}</span>
                <span className="gift-card-price">
                  <Icon name="coins" size={12} /> {formatCoins(gift.price)}
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

        <button
          className="btn btn-primary btn-block"
          onClick={() => void send()}
          disabled={!selected || !recipientId || sending}
        >
          {sending ? <span className="spinner" /> : <Icon name="gift" size={18} />}
          {t('sendGift')}
        </button>
      </div>
    </Sheet>
  );
}
