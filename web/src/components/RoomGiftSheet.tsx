import { useCallback, useEffect, useRef, useState } from 'react';
import { api, assetUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { GiftCatalog, type GiftCategory } from './GiftCatalog';
import { GiftCover } from './GiftAnimation';
import { GiftBagGrid, type BagGiftItem } from './GiftBag';
import { CurrencyIcon } from './CurrencyIcon';
import { LuckyClover } from './room/LuckyClover';
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

/** What the «أرسل هدية» bar needs to repeat the last send. */
export interface RepeatGiftInfo {
  gift: GiftItem;
  recipient: RoomSpeaker;
  quantity: number;
  currency: 'diamond' | 'gold';
  balance: number;
}

export interface LuckyGiftInfo {
  enabled: boolean;
  price: number;
  prizes: number[];
}

/** «الهدية المجانية اليومية»: one claim per Baghdad day, set from the admin panel. */
export interface DailyFreeGift {
  enabled: boolean;
  giftId: string | null;
  giftName: string | null;
  claimed: boolean;
}

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
  initialTab = 'gifts',
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
  speakers: RoomSpeaker[];
  onSent: (message: RoomMessageData, repeat?: RepeatGiftInfo) => void;
  /** Preselects the person whose profile card opened the gift shop. */
  initialRecipientId?: string | null;
  /** «هدايا اليوم» opens straight on the daily section when the floating ad is tapped. */
  initialTab?: 'gifts' | 'daily';
}) {
  const { t } = useI18n();
  const toast = useToast();
  const { me } = useAuth();
  const [gifts, setGifts] = useState<GiftItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [goldBalance, setGoldBalance] = useState(0);
  const [tab, setTab] = useState<'gifts' | 'daily' | 'bag' | 'lucky'>('gifts');
  const [bag, setBag] = useState<BagGiftItem[]>([]);
  const [fromBag, setFromBag] = useState(false);
  const [category, setCategory] = useState<GiftCategory>('legendary');
  const [lucky, setLucky] = useState<LuckyGiftInfo | null>(null);
  const [dailyGifts, setDailyGifts] = useState<GiftItem[]>([]);
  const [dailyResetsAt, setDailyResetsAt] = useState<string | null>(null);
  const [freeGift, setFreeGift] = useState<DailyFreeGift | null>(null);
  const [claimingFree, setClaimingFree] = useState(false);
  const [buyingBox, setBuyingBox] = useState(false);
  const [dailyAdminOpen, setDailyAdminOpen] = useState(false);
  const [togglingDailyId, setTogglingDailyId] = useState('');
  const [clock, setClock] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [recipientId, setRecipientId] = useState('');
  const [selected, setSelected] = useState<GiftItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [sending, setSending] = useState(false);
  const [sendingLucky, setSendingLucky] = useState(false);
  const requestRef = useRef('');
  // `speakers` is a fresh array on every render of the room, so depend on the id
  // string instead — otherwise the effect re-fetches the gift list in a loop.
  const firstSpeakerId = speakers[0]?.id ?? '';

  const loadShop = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<{
        gifts: GiftItem[];
        bag?: BagGiftItem[];
        balance: number;
        goldBalance: number;
        luckyGift?: LuckyGiftInfo;
        dailyGifts?: GiftItem[];
        dailyResetsAt?: string;
        dailyFreeGift?: DailyFreeGift;
      }>('/gifts');
      setGifts(response.gifts);
      setBag(response.bag ?? []);
      setBalance(response.balance);
      setGoldBalance(response.goldBalance ?? 0);
      setLucky(response.luckyGift ?? null);
      setDailyGifts(response.dailyGifts ?? []);
      setDailyResetsAt(response.dailyResetsAt ?? null);
      setFreeGift(response.dailyFreeGift ?? null);
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
    setQuantity(1);
    setTab(initialTab);
    setCategory('legendary');
    setRecipientId((current) => initialRecipientId || current || firstSpeakerId);
    requestRef.current = '';
    void loadShop();
  }, [open, firstSpeakerId, initialRecipientId, initialTab, loadShop]);

  // The «هدايا اليوم» countdown ticks only while that section is on screen.
  useEffect(() => {
    if (!open || tab !== 'daily') return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, tab]);

  // The gift's own currency decides the wallet: gold only for the gifts the
  // admin marked as gold, diamonds for everything else.
  const payCurrency: 'diamond' | 'gold' = selected?.currency === 'gold' ? 'gold' : 'diamond';
  const activeBalance = payCurrency === 'gold' ? goldBalance : balance;
  const dailyRemaining = Math.max(
    0,
    (dailyResetsAt ? new Date(dailyResetsAt).getTime() : 0) - clock
  );
  const dailyCountdown = [
    Math.floor(dailyRemaining / 3_600_000),
    Math.floor((dailyRemaining % 3_600_000) / 60_000),
    Math.floor((dailyRemaining % 60_000) / 1000),
  ]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
  const bagTotal = bag.reduce((sum, item) => sum + item.quantity, 0);
  const selectedBagLeft =
    selected && fromBag ? bag.find((item) => item.id === selected.id)?.quantity ?? 0 : 0;

  const send = useCallback(async () => {
    if (!selected || !recipientId || sending) return;
    const bagLeft = fromBag ? bag.find((item) => item.id === selected.id)?.quantity ?? 0 : 0;
    if (fromBag) {
      if (bagLeft < quantity) {
        toast.push(t('giftBagEmpty'), 'error');
        return;
      }
    } else if (activeBalance < selected.price * quantity) {
      toast.push(t('insufficientCoins'), 'error');
      return;
    }
    if (!requestRef.current) requestRef.current = newRequestId();
    setSending(true);
    try {
      const response = await api<{ message: RoomMessageData }>(`/rooms/${roomId}/gifts`, {
        method: 'POST',
        body: {
          giftId: selected.id,
          recipientId,
          requestId: requestRef.current,
          quantity,
          currency: fromBag ? 'diamond' : payCurrency,
          fromBag,
        },
      });
      requestRef.current = '';
      let nextBalance = activeBalance;
      if (fromBag) {
        setBag((current) =>
          current
            .map((item) =>
              item.id === selected.id ? { ...item, quantity: item.quantity - quantity } : item
            )
            .filter((item) => item.quantity > 0)
        );
      } else {
        nextBalance = activeBalance - selected.price * quantity;
        if (payCurrency === 'gold') {
          setGoldBalance(nextBalance);
        } else {
          setBalance(nextBalance);
        }
      }
      const recipient =
        speakers.find((speaker) => speaker.id === recipientId) ?? {
          id: recipientId,
          displayName: '',
          avatarUrl: null,
        };
      // A bag gift was already paid for; the «أرسل المزيد» bar would charge
      // diamonds again, so it is only offered for paid sends.
      onSent(
        response.message,
        fromBag
          ? undefined
          : { gift: selected, recipient, quantity, currency: payCurrency, balance: nextBalance }
      );
      setSelected(null);
      onClose();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }, [
    activeBalance,
    bag,
    payCurrency,
    fromBag,
    onClose,
    onSent,
    quantity,
    recipientId,
    roomId,
    selected,
    sending,
    speakers,
    t,
    toast,
  ]);

  // One lucky try: the server charges, draws and credits; the room gets the overlay.
  const sendLucky = useCallback(async () => {
    if (!lucky || sendingLucky) return;
    if (balance < lucky.price) {
      toast.push(t('insufficientCoins'), 'error');
      return;
    }
    setSendingLucky(true);
    try {
      const response = await api<{ spin: { id: string; cost: number; prize: number } }>(
        `/rooms/${roomId}/lucky-gifts`,
        { method: 'POST', body: { requestId: newRequestId() } }
      );
      setBalance((current) => current - response.spin.cost + response.spin.prize);
      onClose();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSendingLucky(false);
    }
  }, [balance, lucky, onClose, roomId, sendingLucky, t, toast]);

  // One free gift per Baghdad day; the server's claim row stops a second one.
  const claimFree = useCallback(async () => {
    if (claimingFree || !freeGift?.enabled || freeGift.claimed) return;
    setClaimingFree(true);
    try {
      const response = await api<{
        claimed: boolean;
        gift: { name: string };
        bag: BagGiftItem[];
        resetsAt: string;
      }>('/gifts/daily-free', { method: 'POST', body: {} });
      setBag(response.bag ?? []);
      setDailyResetsAt(response.resetsAt);
      setFreeGift((current) => (current ? { ...current, claimed: true } : current));
      toast.push(
        response.claimed
          ? `أضفنا «${response.gift.name}» إلى جنطة الهدايا`
          : 'استلمت هديتك المجانية لهذا اليوم',
        response.claimed ? 'success' : 'error'
      );
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setClaimingFree(false);
    }
  }, [claimingFree, freeGift, toast]);

  // «هدية عشوائية»: the server charges once, picks a random gift and drops it in the bag.
  const buyRandomBox = useCallback(async () => {
    if (buyingBox) return;
    setBuyingBox(true);
    try {
      const response = await api<{ giftName: string; balance: number; bagQuantity: number }>(
        '/room-ads/random-gift',
        { method: 'POST', body: { requestId: newRequestId() } }
      );
      setBalance(response.balance);
      const fresh = await api<{ bag?: BagGiftItem[] }>('/gifts');
      setBag(fresh.bag ?? []);
      toast.push(`فتحت الصندوق: «${response.giftName}» أضيفت إلى جنطتك`, 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBuyingBox(false);
    }
  }, [buyingBox, toast]);

  // «هدايا اليوم» is one list for the whole app: what an admin adds from their
  // own room shows in every other room too.
  const toggleDaily = useCallback(
    async (gift: GiftItem) => {
      if (togglingDailyId) return;
      setTogglingDailyId(gift.id);
      try {
        await api(`/admin/gifts/${gift.id}`, {
          method: 'PATCH',
          body: { isDaily: !gift.isDaily },
        });
        await loadShop();
        toast.push(
          gift.isDaily
            ? `أزلنا «${gift.name}» من هدايا اليوم`
            : `أضفنا «${gift.name}» إلى هدايا اليوم في كل الغرف`,
          'success'
        );
      } catch (error) {
        toast.push((error as Error).message, 'error');
      } finally {
        setTogglingDailyId('');
      }
    },
    [togglingDailyId, loadShop, toast]
  );

  return (
    <Sheet open={open} onClose={onClose} title={t('giftShop')}>
      <div className="gift-shop">
        <div className="gift-shop-head">
          <span className="tiny muted">{tab === 'lucky' ? 'هدايا الحظ' : t('roomGiftTo')}</span>
          <span className="spacer" />
          <span className="pill pill-gold">
            <CurrencyIcon code={payCurrency === 'gold' ? 'GOLD' : 'DIAMOND'} size={13} />{' '}
            {formatCoins(activeBalance)}
          </span>
        </div>

        <div className="seg" style={{ marginBottom: 10 }}>
          <button
            className={tab === 'daily' ? 'active' : ''}
            onClick={() => {
              setTab('daily');
              setSelected(null);
              setFromBag(false);
            }}
          >
            هدايا اليوم
          </button>
          <button
            className={tab === 'gifts' ? 'active' : ''}
            onClick={() => {
              setTab('gifts');
              setSelected(null);
              setFromBag(false);
            }}
          >
            الهدايا
          </button>
          <button
            className={tab === 'bag' ? 'active' : ''}
            onClick={() => {
              setTab('bag');
              setSelected(null);
              setFromBag(false);
            }}
          >
            {t('giftTabBag')}
            {bagTotal > 0 ? ` · ${bagTotal}` : ''}
          </button>
          {lucky?.enabled ? (
            <button className={tab === 'lucky' ? 'active' : ''} onClick={() => setTab('lucky')}>
              🍀 هدايا الحظ
            </button>
          ) : null}
        </div>

        {tab === 'lucky' && lucky ? (
          <div className="lucky-shop">
            <div className="lucky-shop-hero">
              <span className="lucky-shop-orb">
                <LuckyClover size={58} />
              </span>
              <div className="lucky-shop-copy">
                <b>هدايا الحظ</b>
                <span className="tiny muted">
                  فقاعة ذهبية تنفجر بجائزة فورية تُضاف إلى رصيدك، ويشاهدها كل من في الغرفة
                </span>
              </div>
            </div>

            <div className="lucky-shop-prizes">
              {lucky.prizes.map((amount) => (
                <span key={amount} className={`lucky-prize-chip${amount === 0 ? ' empty' : ''}`}>
                  {amount === 0 ? 'لا شيء' : `+${formatCoins(amount)}`}
                  {amount > 0 ? <CurrencyIcon code="DIAMOND" size={11} /> : null}
                </span>
              ))}
            </div>

            <p className="tiny muted center">الجوائز تُسحب على الخادم حسب احتمالات لوحة الإدارة</p>

            <button
              className="btn btn-gold btn-block"
              onClick={() => void sendLucky()}
              disabled={sendingLucky || balance < lucky.price}
            >
              {sendingLucky ? (
                <span className="spinner" />
              ) : (
                <span className="lucky-btn-mark">
                  <LuckyClover size={18} />
                </span>
              )}
              جرّب حظك · {formatCoins(lucky.price)}
              <CurrencyIcon code="DIAMOND" size={13} />
            </button>
          </div>
        ) : (
          <>
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
            ) : tab === 'bag' ? (
              <GiftBagGrid
                items={bag}
                selectedId={selected?.id}
                onSelect={(gift) => {
                  setSelected(gift as unknown as GiftItem);
                  setFromBag(true);
                  setQuantity(1);
                }}
              />
            ) : tab === 'daily' ? (
              <div className="daily-gifts">
                <div className="daily-gifts-head">
                  <span className="daily-gifts-title">
                    <Icon name="gift" size={14} /> هدايا اليوم المحدودة
                  </span>
                  <span className="daily-gifts-timer" dir="ltr">
                    {dailyCountdown}
                  </span>
                </div>
                <p className="tiny muted daily-gifts-note">
                  ينتهي العرض بعد — تتجدد هدايا اليوم عند منتصف الليل بتوقيت بغداد
                </p>
                {freeGift?.enabled ? (
                  <button
                    type="button"
                    className="btn btn-gold btn-block"
                    onClick={() => void claimFree()}
                    disabled={claimingFree || freeGift.claimed}
                  >
                    {claimingFree ? <span className="spinner" /> : <Icon name="gift" size={16} />}
                    {freeGift.claimed
                      ? 'استلمت هديتك المجانية اليوم'
                      : `استلم «${freeGift.giftName}» مجاناً`}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  onClick={() => void buyRandomBox()}
                  disabled={buyingBox}
                >
                  {buyingBox ? <span className="spinner" /> : <Icon name="gift" size={16} />}
                  هدية عشوائية من المتجر
                </button>
                {me?.user.isAdmin ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-block"
                      onClick={() => setDailyAdminOpen((current) => !current)}
                    >
                      <Icon name="settings" size={16} />
                      إدارة هدايا اليوم — تظهر في كل الغرف
                    </button>
                    {dailyAdminOpen ? (
                      <div className="daily-admin-list">
                        {gifts.map((gift) => (
                          <button
                            key={gift.id}
                            type="button"
                            className={`daily-admin-item ${gift.isDaily ? 'on' : ''}`}
                            onClick={() => void toggleDaily(gift)}
                            disabled={togglingDailyId === gift.id}
                          >
                            <GiftCover gift={gift} className="daily-admin-art" />
                            <span className="daily-admin-name">{gift.name}</span>
                            <span className="daily-admin-state">
                              {gift.isDaily ? '✓ مضاف' : 'إضافة'}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
                <div className="gift-grid">
                  {dailyGifts.map((gift) => (
                    <button
                      key={gift.id}
                      type="button"
                      className={`gift-card ${
                        (gift.currency === 'gold' ? goldBalance : balance) < gift.price ? 'locked' : ''
                      } ${selected?.id === gift.id && !fromBag ? 'selected' : ''}`}
                      onClick={() => {
                        setSelected(gift);
                        setFromBag(false);
                      }}
                    >
                      <span className="gift-rarity-pill rarity-legendary">اليوم</span>
                      <GiftCover gift={gift} className="gift-card-art" />
                      <span className="gift-card-name">{gift.name}</span>
                      <span className="gift-card-price">
                        <CurrencyIcon code={gift.currency === 'gold' ? 'GOLD' : 'DIAMOND'} size={12} />{' '}
                        {formatCoins(gift.price)}
                      </span>
                    </button>
                  ))}
                  {dailyGifts.length === 0 ? (
                    <div className="empty" style={{ gridColumn: '1 / -1' }}>
                      <Icon name="gift" size={22} />
                      <span className="tiny">لا توجد هدايا محدودة اليوم — تصفح بقية الهدايا</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <GiftCatalog
                gifts={gifts}
                balance={balance}
                goldBalance={goldBalance}
                category={category}
                onCategoryChange={setCategory}
                selectedId={selected?.id}
                onSelect={(gift) => {
                  setSelected(gift);
                  setFromBag(false);
                }}
              />
            )}

            <div className="gift-qty">
              <span className="gift-qty-label">
                عدد الهدايا
                {fromBag && selected ? ` · ${t('giftBagLeft', { count: selectedBagLeft })}` : ''}
              </span>
              <div className="gift-qty-row">
                {QUANTITIES.map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={`gift-qty-chip${quantity === count ? ' active' : ''}`}
                    onClick={() => setQuantity(count)}
                    disabled={fromBag && count > selectedBagLeft}
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
              {fromBag ? t('giftBagSend') : t('sendGift')}
              {selected && !fromBag ? ` · ${formatCoins(selected.price * quantity)}` : ''}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
