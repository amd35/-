import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { GiftCover, type GiftVisual } from './GiftAnimation';
import { GiftCatalog, type GiftCategory } from './GiftCatalog';
import {
  GiftBagGrid,
  GiftPackagesGrid,
  type BagGiftItem,
  type GiftPackageInfo,
} from './GiftBag';
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
  /** Shown in the «هدايا اليوم» limited section — one list for every room. */
  isDaily?: boolean;
  /** Set by the admin: `gold` for the gifts he priced in gold, else diamonds. */
  currency?: string | null;
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

type ShopTab = 'gifts' | 'packages' | 'bag';

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
  const [bag, setBag] = useState<BagGiftItem[]>([]);
  const [packages, setPackages] = useState<GiftPackageInfo[]>([]);
  const [balance, setBalance] = useState(0);
  const [goldBalance, setGoldBalance] = useState(0);
  const [defaultPercent, setDefaultPercent] = useState(60);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<GiftItem | null>(null);
  const [fromBag, setFromBag] = useState(false);
  const [category, setCategory] = useState<GiftCategory>('legendary');
  const [tab, setTab] = useState<ShopTab>('gifts');
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const requestRef = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<{
        gifts: GiftItem[];
        bag: BagGiftItem[];
        packages: GiftPackageInfo[];
        balance: number;
        goldBalance: number;
        defaultRecipientPercent: number;
        giftsEnabled: boolean;
      }>('/gifts');
      setGifts(response.gifts);
      setBag(response.bag ?? []);
      setPackages(response.packages ?? []);
      setBalance(response.balance);
      setGoldBalance(response.goldBalance ?? 0);
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
    setFromBag(false);
    setCategory('legendary');
    setTab('gifts');
    requestRef.current = '';
    void load();
  }, [open, load]);

  // The gift's own currency decides the wallet: gold only for the gifts the
  // admin marked as gold, diamonds for everything else.
  const payCurrency: 'diamond' | 'gold' = selected?.currency === 'gold' ? 'gold' : 'diamond';
  const activeBalance = payCurrency === 'gold' ? goldBalance : balance;
  const bagTotal = bag.reduce((sum, item) => sum + item.quantity, 0);
  const bagLeft = selected ? bag.find((item) => item.id === selected.id)?.quantity ?? 0 : 0;

  const switchTab = (next: ShopTab) => {
    setTab(next);
    setSelected(null);
    setFromBag(false);
  };

  const buyPackage = async (pkg: GiftPackageInfo) => {
    if (buyingId) return;
    if (balance < pkg.price) {
      toast.push(t('insufficientCoins'), 'error');
      return;
    }
    setBuyingId(pkg.id);
    try {
      const response = await api<{ bag: BagGiftItem[]; balance: number }>(
        `/gifts/packages/${pkg.id}/buy`,
        { method: 'POST', body: { requestId: newRequestId() } }
      );
      setBag(response.bag ?? []);
      setBalance(response.balance ?? balance - pkg.price);
      toast.push(t('giftBagAdded'), 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBuyingId(null);
    }
  };

  const send = async () => {
    if (!selected || sending) return;
    if (fromBag) {
      if (bagLeft <= 0) {
        toast.push(t('giftBagEmpty'), 'error');
        return;
      }
    } else if (activeBalance < selected.price) {
      toast.push(t('insufficientCoins'), 'error');
      return;
    }
    if (!requestRef.current) requestRef.current = newRequestId();
    setSending(true);
    try {
      const response = await api<{
        message: GiftMessage;
        balance: number | null;
        bagLeft: number | null;
      }>('/gifts/send', {
        method: 'POST',
        body: {
          giftId: selected.id,
          conversationId,
          requestId: requestRef.current,
          currency: fromBag ? 'diamond' : payCurrency,
          fromBag,
        },
      });
      requestRef.current = '';
      if (fromBag) {
        setBag((current) =>
          current
            .map((item) =>
              item.id === selected.id ? { ...item, quantity: item.quantity - 1 } : item
            )
            .filter((item) => item.quantity > 0)
        );
      } else if (payCurrency === 'gold') {
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
            <CurrencyIcon code={payCurrency === 'gold' && !fromBag ? 'GOLD' : 'DIAMOND'} size={13} />{' '}
            {formatCoins(fromBag ? bagLeft : activeBalance)}
          </span>
        </div>

        {!selected ? (
          <div className="seg" style={{ marginBottom: 10 }}>
            <button className={tab === 'gifts' ? 'active' : ''} onClick={() => switchTab('gifts')}>
              {t('giftTabGifts')}
            </button>
            <button
              className={tab === 'packages' ? 'active' : ''}
              onClick={() => switchTab('packages')}
            >
              {t('giftTabPackages')}
            </button>
            <button className={tab === 'bag' ? 'active' : ''} onClick={() => switchTab('bag')}>
              {t('giftTabBag')}
              {bagTotal > 0 ? ` · ${bagTotal}` : ''}
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
              {fromBag ? (
                <div className="gift-detail-facts">
                  <div>
                    <span className="tiny muted">{t('giftBagTitle')}</span>
                    <b className="amount">{t('giftBagLeft', { count: bagLeft })}</b>
                  </div>
                  <div>
                    <span className="tiny muted">{t('giftPrice')}</span>
                    <b className="plus">{t('giftBagFree')}</b>
                  </div>
                </div>
              ) : (
                <div className="gift-detail-facts">
                  <div>
                    <span className="tiny muted">{t('giftPrice')}</span>
                    <b className="amount">
                      <CurrencyIcon code={payCurrency === 'gold' ? 'GOLD' : 'DIAMOND'} size={14} /> {formatCoins(selected.price)}
                    </b>
                  </div>
                  <div>
                    <span className="tiny muted">{t('giftRecipientShare')}</span>
                    <b className="plus">
                      +{formatCoins(Math.floor((selected.price * percent) / 100))} ({percent}%)
                    </b>
                  </div>
                </div>
              )}
              <p className="tiny muted">{t('giftToPeer', { name: peerName })}</p>
            </div>
            {!fromBag && activeBalance < selected.price ? (
              payCurrency === 'gold' ? (
                <button className="btn btn-gold btn-block" disabled>
                  <CurrencyIcon code="GOLD" size={15} /> رصيد الذهب غير كافٍ
                </button>
              ) : (
                <button
                  className="btn btn-gold btn-block"
                  onClick={() => {
                    onClose();
                    navigate('/wallet');
                  }}
                >
                  <Icon name="plus" size={16} /> {t('buyCoins')}
                </button>
              )
            ) : (
              <button
                className="btn btn-primary btn-block gift-send-btn"
                onClick={() => void send()}
                disabled={sending || (fromBag && bagLeft <= 0)}
              >
                {sending ? <span className="spinner" /> : <Icon name="gift" size={18} />}
                {fromBag ? t('giftBagSend') : t('sendGift')}
              </button>
            )}
          </div>
        ) : tab === 'packages' ? (
          <GiftPackagesGrid
            packages={packages}
            balance={balance}
            buyingId={buyingId}
            onBuy={(pkg) => void buyPackage(pkg)}
          />
        ) : tab === 'bag' ? (
          <GiftBagGrid
            items={bag}
            onSelect={(gift) => {
              setSelected(gift as unknown as GiftItem);
              setFromBag(true);
            }}
          />
        ) : (
          <GiftCatalog
            gifts={gifts}
            balance={balance}
            goldBalance={goldBalance}
            category={category}
            onCategoryChange={setCategory}
            onSelect={(gift) => {
              setSelected(gift);
              setFromBag(false);
            }}
          />
        )}
      </div>
    </Sheet>
  );
}
