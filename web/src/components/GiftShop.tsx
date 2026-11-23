import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { GiftAnimation, GiftCover, type GiftVisual } from './GiftAnimation';
import { GiftCatalog, type GiftCategory } from './GiftCatalog';
import { CurrencyIcon } from './CurrencyIcon';

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
  const [goldBalance, setGoldBalance] = useState(0);
  const [goldGiftsEnabled, setGoldGiftsEnabled] = useState(false);
  const [currency, setCurrency] = useState<'diamond' | 'gold'>('diamond');
  const [defaultPercent, setDefaultPercent] = useState(60);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GiftItem | null>(null);
  const [category, setCategory] = useState<GiftCategory>('gifts');
  const [sending, setSending] = useState(false);
  const requestRef = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<{
        gifts: GiftItem[];
        balance: number;
        goldBalance: number;
        defaultRecipientPercent: number;
        giftsEnabled: boolean;
        goldGiftsEnabled: boolean;
      }>('/gifts');
      setGifts(response.gifts);
      setBalance(response.balance);
      setGoldBalance(response.goldBalance ?? 0);
      setGoldGiftsEnabled(Boolean(response.goldGiftsEnabled));
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
    setCategory('gifts');
    requestRef.current = '';
    void load();
  }, [open, load]);

  const activeBalance = currency === 'gold' ? goldBalance : balance;

  const send = async () => {
    if (!selected || sending) return;
    if (activeBalance < selected.price) {
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
          currency,
        },
      });
      requestRef.current = '';
      if (currency === 'gold') {
        setGoldBalance(response.balance ?? goldBalance - selected.price);
      } else {
        setBalance(response.balance ?? balance - selected.price);
      }
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

        {loading ? (
          <Spinner label={t('loading')} />
        ) : selected ? (
          <div className="gift-detail">
            <div className="gift-detail-stage">
              <GiftCover gift={selected} />
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
                    <CurrencyIcon code={currency === 'gold' ? 'GOLD' : 'DIAMOND'} size={14} /> {formatCoins(selected.price)}
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
            {activeBalance < selected.price ? (
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
          <GiftCatalog
            gifts={gifts}
            balance={activeBalance}
            currency={currency}
            category={category}
            onCategoryChange={setCategory}
            onSelect={setSelected}
          />
        )}
      </div>
    </Sheet>
  );
}
