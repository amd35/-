import { useCallback, useEffect, useRef, useState } from 'react';
import { api, assetUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { GiftCatalog, type GiftCategory } from './GiftCatalog';
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
  onSent: (message: RoomMessageData, repeat?: RepeatGiftInfo) => void;
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
  const [tab, setTab] = useState<'gifts' | 'lucky'>('gifts');
  const [category, setCategory] = useState<GiftCategory>('gifts');
  const [lucky, setLucky] = useState<LuckyGiftInfo | null>(null);
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

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setQuantity(1);
    setTab('gifts');
    setCategory('gifts');
    setRecipientId((current) => initialRecipientId || current || firstSpeakerId);
    requestRef.current = '';
    setLoading(true);
    api<{
      gifts: GiftItem[];
      balance: number;
      goldBalance: number;
      goldGiftsEnabled: boolean;
      luckyGift?: LuckyGiftInfo;
    }>('/gifts')
      .then((response) => {
        setGifts(response.gifts);
        setBalance(response.balance);
        setGoldBalance(response.goldBalance ?? 0);
        setGoldGiftsEnabled(Boolean(response.goldGiftsEnabled));
        setLucky(response.luckyGift ?? null);
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
      const nextBalance = activeBalance - selected.price * quantity;
      if (currency === 'gold') {
        setGoldBalance(nextBalance);
      } else {
        setBalance(nextBalance);
      }
      const recipient =
        speakers.find((speaker) => speaker.id === recipientId) ?? {
          id: recipientId,
          displayName: '',
          avatarUrl: null,
        };
      onSent(response.message, {
        gift: selected,
        recipient,
        quantity,
        currency,
        balance: nextBalance,
      });
      setSelected(null);
      onClose();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }, [
    activeBalance,
    currency,
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

  return (
    <Sheet open={open} onClose={onClose} title={t('giftShop')}>
      <div className="gift-shop">
        <div className="gift-shop-head">
          <span className="tiny muted">{tab === 'lucky' ? 'هدايا الحظ' : t('roomGiftTo')}</span>
          <span className="spacer" />
          <span className="pill pill-gold">
            <CurrencyIcon code={currency === 'gold' && tab === 'gifts' ? 'GOLD' : 'DIAMOND'} size={13} />{' '}
            {formatCoins(tab === 'gifts' && currency === 'gold' ? goldBalance : balance)}
          </span>
        </div>

        {lucky?.enabled ? (
          <div className="seg" style={{ marginBottom: 10 }}>
            <button className={tab === 'gifts' ? 'active' : ''} onClick={() => setTab('gifts')}>
              الهدايا
            </button>
            <button className={tab === 'lucky' ? 'active' : ''} onClick={() => setTab('lucky')}>
              🍀 هدايا الحظ
            </button>
          </div>
        ) : null}

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
              <GiftCatalog
                gifts={gifts}
                balance={activeBalance}
                currency={currency}
                category={category}
                onCategoryChange={setCategory}
                selectedId={selected?.id}
                onSelect={setSelected}
              />
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
          </>
        )}
      </div>
    </Sheet>
  );
}
