import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { GiftAnimation, type GiftVisual } from './GiftAnimation';

export interface GiftItem extends Omit<GiftVisual, 'price' | 'rarity'> {
  id: string;
  slug: string;
  nameEn: string;
  description: string;
  price: number;
  rarity: string;
  recipientPercent: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface GiftMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  type: 'gift';
  attachmentUrl: null;
  attachmentName: null;
  createdAt: string;
  readAt: string | null;
  mine: boolean;
  gift: {
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
  };
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

export function GiftShop({
  open,
  onClose,
  conversationId,
  peerName,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  peerName: string;
  onSent: (message: GiftMessage, gift: GiftItem) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [defaultPercent, setDefaultPercent] = useState(60);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GiftItem | null>(null);
  const [sending, setSending] = useState(false);
  const requestRef = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<{
        gifts: GiftItem[];
        balance: number;
        defaultRecipientPercent: number;
        giftsEnabled: boolean;
      }>('/gifts');
      setGifts(response.gifts);
      setBalance(response.balance);
      setDefaultPercent(response.defaultRecipientPercent);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    requestRef.current = '';
    void load();
  }, [open, load]);

  const send = async () => {
    if (!selected || sending) return;
    if (balance < selected.price) {
      toast.push(t('insufficientCoins'), 'error');
      return;
    }
    if (!requestRef.current) requestRef.current = newRequestId();
    setSending(true);
    try {
      const response = await api<{ message: GiftMessage; balance: number }>('/gifts/send', {
        method: 'POST',
        body: {
          giftId: selected.id,
          conversationId,
          requestId: requestRef.current,
        },
      });
      requestRef.current = '';
      setBalance(response.balance ?? balance - selected.price);
      onSent(response.message, selected);
      onClose();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const percent = selected
    ? selected.recipientPercent === null
      ? defaultPercent
      : selected.recipientPercent
    : defaultPercent;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={selected ? selected.name : t('giftShop')}
    >
      <div className="gift-shop">
        <div className="gift-shop-head">
          {selected ? (
            <button className="icon-btn plain" onClick={() => setSelected(null)} aria-label="back">
              <Icon name="arrowRight" size={18} />
            </button>
          ) : (
            <span className="tiny muted">{t('giftShopHint')}</span>
          )}
          <span className="spacer" />
          <span className="pill pill-gold">
            <Icon name="coins" size={13} /> {formatCoins(balance)}
          </span>
        </div>

        {loading ? (
          <Spinner label={t('loading')} />
        ) : selected ? (
          <div className="gift-detail">
            <div className="gift-detail-stage">
              <GiftAnimation gift={selected} />
              <span className={`pill rarity-${selected.rarity} gift-rarity`}>
                {RARITY_LABEL[selected.rarity] ?? selected.rarity}
              </span>
            </div>
            <div className="gift-detail-copy">
              <h3>{selected.name}</h3>
              <p className="tiny muted">{selected.description || selected.nameEn}</p>
              <div className="gift-detail-facts">
                <div>
                  <span className="tiny muted">{t('giftPrice')}</span>
                  <b className="amount">
                    <Icon name="coins" size={14} /> {formatCoins(selected.price)}
                  </b>
                </div>
                <div>
                  <span className="tiny muted">{t('giftRecipientShare')}</span>
                  <b className="plus">
                    +{formatCoins(Math.floor((selected.price * percent) / 100))} ({percent}%)
                  </b>
                </div>
              </div>
              <p className="tiny muted">{t('giftToPeer', { name: peerName })}</p>
            </div>
            {balance < selected.price ? (
              <button
                className="btn btn-gold btn-block"
                onClick={() => {
                  onClose();
                  navigate('/wallet');
                }}
              >
                <Icon name="plus" size={16} /> {t('buyCoins')}
              </button>
            ) : (
              <button className="btn btn-primary btn-block gift-send-btn" onClick={() => void send()} disabled={sending}>
                {sending ? <span className="spinner" /> : <Icon name="gift" size={18} />}
                {t('sendGift')}
              </button>
            )}
          </div>
        ) : (
          <div className="gift-grid">
            {gifts.map((gift) => (
              <button
                key={gift.id}
                className={`gift-card ${balance < gift.price ? 'locked' : ''}`}
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
      </div>
    </Sheet>
  );
}
