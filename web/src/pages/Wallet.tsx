import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useRealtime } from '../lib/realtime';
import {
  EmptyState,
  formatCoins,
  formatTimeAgo,
  Icon,
  Sheet,
  Spinner,
  useToast,
} from '../lib/ui';
import { AppShell } from '../components/AppShell';
import { CurrencyIcon } from '../components/CurrencyIcon';
import { GiftCodeButton } from '../components/GiftCodeSheet';

interface LedgerRow {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  createdAt: string;
}

interface WalletData {
  wallet: { balance: number; reserved: number; earned: number; spent: number; gold?: number };
  currencies: {
    diamond: { code: string; balance: number; reserved: number; earned: number; spent: number };
  };
  transactions: LedgerRow[];
  earnings: { total: number; calls: number };
}

interface Package {
  id: string;
  name: string;
  coins: number;
  bonusCoins: number;
  totalCoins: number;
  priceIqd: number;
  priceUsdCents: number;
}

interface Method {
  id: string;
  label: string;
  labelEn: string;
  enabled: boolean;
  note: string;
}

interface Order {
  id: string;
  coins: number;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  package_name: string | null;
}

const DIAMOND_LABELS: Record<string, string> = {
  call_charge: 'خصم مكالمة',
  call_reserve: 'حجز مكالمة',
  call_refund: 'إرجاع رصيد',
  earning: 'أرباح مكالمة',
  recharge: 'شحن ماس',
  admin_adjust: 'تعديل إداري',
  gift_code: 'كود هدية',
  gift_send: 'إرسال هدية',
  agent_recharge: 'شحن من وكيل',
};

export default function Wallet() {
  const { t, lang } = useI18n();
  const { me } = useAuth();
  const { on } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState<WalletData | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Package | null>(null);
  const [currency, setCurrency] = useState<'IQD' | 'USD'>('IQD');
  const [provider, setProvider] = useState('manual');
  const [busy, setBusy] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [wallet, packageData, orderData] = await Promise.all([
        api<WalletData>('/wallet'),
        api<{ packages: Package[]; paymentMethods: Method[] }>('/wallet/packages'),
        api<{ orders: Order[] }>('/wallet/orders'),
      ]);
      setData(wallet);
      setPackages(packageData.packages);
      setMethods(packageData.paymentMethods);
      setOrders(orderData.orders);
      const enabled = packageData.paymentMethods.find((method) => method.enabled);
      if (enabled) setProvider(enabled.id);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const offWallet = on('wallet:update', () => void load(true));
    const offProfit = on('profit:update', () => void load(true));
    const offFree = on('free:update', () => void load(true));
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      offWallet();
      offProfit();
      offFree();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [on, load]);

  const createOrder = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await api<{ order: Order }>('/wallet/orders', {
        method: 'POST',
        body: { packageId: selected.id, currency, provider },
      });
      setCreatedOrder(response.order);
      toast.push(t('orderPending'), 'info');
      await load();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async (order: Order) => {
    try {
      await api(`/wallet/orders/${order.id}/mark-paid`, {
        method: 'POST',
        body: { note: 'user reported payment' },
      });
      toast.push(t('orderPending'), 'success');
      await load();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const currencies = data?.currencies;
  const diamond = currencies?.diamond ?? {
    balance: data?.wallet.balance ?? me?.wallet?.balance ?? 0,
    reserved: data?.wallet.reserved ?? 0,
    earned: data?.wallet.earned ?? 0,
    spent: data?.wallet.spent ?? 0,
  };
  const ledgerRows = data?.transactions ?? [];
  const ledgerLabels = DIAMOND_LABELS;

  return (
    <AppShell title={t('wallet')} active="wallet">
      <div className="page page-tight">
        <section className="wallet-hero">
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <span className="tiny muted">{lang === 'ar' ? 'محفظة يلا فون' : 'Yalla Phone wallet'}</span>
            <span className="pill pill-gold">
              <Icon name="wallet" size={13} /> {lang === 'ar' ? 'الماس' : 'Diamond'}
            </span>
          </div>
          <div className="balance">
            <CurrencyIcon code="DIAMOND" size={30} />
            <strong>{formatCoins(diamond.balance)}</strong>
            <span className="muted tiny">{lang === 'ar' ? 'ماس' : 'Diamond'}</span>
          </div>
          <div className="wallet-split is-single">
            <div>
              <span>{t('reserved')}</span>
              <b>{formatCoins(diamond.reserved)}</b>
            </div>
          </div>
          <div className="inline" style={{ marginTop: 14, gap: 8 }}>
            <button className="btn btn-gold btn-sm grow" onClick={() => document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth' })}>
              <Icon name="plus" size={15} /> {t('recharge')}
            </button>
            <button className="btn btn-outline btn-sm grow" onClick={() => navigate('/earnings')}>
              <Icon name="gift" size={15} /> {t('earnings')}
            </button>
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            {lang === 'ar'
              ? 'الماس لإرسال الهدايا. أرباح الهدايا بالفاصوليا في قسم الأرباح.'
              : 'Diamond is for sending gifts. Gift profits in beans live in the earnings section.'}
          </p>
          <GiftCodeButton block onRedeemed={() => void load()} />
        </section>

        <section className="stack">
          <div className="section-head">
            <h2>{lang === 'ar' ? 'عملة الهدايا' : 'Gift currency'}</h2>
            <span className="tiny muted">{lang === 'ar' ? 'الماس لإرسال الهدايا' : 'Diamond is for gifts'}</span>
          </div>
          <div className="currency-grid is-single">
            <div className="currency-card diamond">
              <CurrencyIcon code="DIAMOND" size={26} />
              <span>{lang === 'ar' ? 'DIAMOND · الماس' : 'DIAMOND'}</span>
              <b>{formatCoins(diamond.balance)}</b>
              <span className="tiny muted">{lang === 'ar' ? 'هدايا الغرف والدردشة' : 'Room & chat gifts'}</span>
            </div>
          </div>
        </section>

        <section className="stack" id="packages">
          <div className="section-head">
            <h2>{t('packages')}</h2>
            <span className="tiny muted">{t('rechargeNote')}</span>
          </div>
          {loading ? (
            <Spinner />
          ) : (
            <div className="packages">
              {packages.map((pack) => (
                <div
                  key={pack.id}
                  className="pack"
                  onClick={() => {
                    setSelected(pack);
                    setCreatedOrder(null);
                  }}
                >
                  {pack.bonusCoins > 0 ? <span className="bonus">+{pack.bonusCoins}</span> : null}
                  <span className="coins">
                    <Icon name="coins" size={17} /> {formatCoins(pack.totalCoins)}
                  </span>
                  <span className="tiny muted">{pack.name}</span>
                  <span className="price">
                    {formatCoins(currency === 'USD' ? pack.priceUsdCents / 100 : pack.priceIqd)}{' '}
                    {currency === 'USD' ? 'USD' : 'IQD'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {orders.length > 0 ? (
          <section className="stack">
            <div className="section-head">
              <h2>{t('orders')}</h2>
            </div>
            <div className="list">
              {orders.map((order) => (
                <div key={order.id} className="row static">
                  <div className="icon-btn plain">
                    <Icon name="card" size={19} />
                  </div>
                  <div className="row-main">
                    <div className="row-title">
                      {formatCoins(order.coins)} {lang === 'ar' ? 'ماس' : 'diamond'} • {formatCoins(order.amount)}{' '}
                      {order.currency}
                    </div>
                    <div className="row-sub">
                      {order.package_name ?? order.provider} • {formatTimeAgo(order.created_at, lang)}
                    </div>
                  </div>
                  <div className="row-meta">
                    <span
                      className={`pill ${
                        order.status === 'paid'
                          ? 'pill-green'
                          : order.status === 'pending'
                            ? 'pill-gold'
                            : 'pill-red'
                      }`}
                      style={{ fontSize: 10, padding: '2px 8px' }}
                    >
                      {order.status === 'paid'
                        ? t('orderPaid')
                        : order.status === 'pending'
                          ? t('orderPending')
                          : t('orderFailed')}
                    </span>
                    {order.status === 'pending' ? (
                      <button className="btn btn-ghost btn-xs" onClick={() => void markPaid(order)}>
                        {t('confirm')}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="stack">
          <div className="section-head">
            <h2>{t('recentTransactions')}</h2>
          </div>
          {loading ? (
            <Spinner />
          ) : ledgerRows.length === 0 ? (
            <EmptyState icon="wallet" title={t('noResults')} />
          ) : (
            <div className="list">
              {ledgerRows.map((transaction) => (
                <div key={transaction.id} className="row static">
                  <div className="icon-btn plain">
                    <CurrencyIcon code="DIAMOND" size={18} />
                  </div>
                  <div className="row-main">
                    <div className="row-title">{ledgerLabels[transaction.type] ?? transaction.type}</div>
                    <div className="row-sub">
                      {formatTimeAgo(transaction.createdAt, lang)} ·{' '}
                      <span dir="ltr">#{transaction.id.slice(0, 8)}</span>
                    </div>
                    <div className="tiny muted">
                      {lang === 'ar' ? 'قبل' : 'before'} {formatCoins(transaction.balanceBefore)} →{' '}
                      {lang === 'ar' ? 'بعد' : 'after'} {formatCoins(transaction.balanceAfter)}
                    </div>
                  </div>
                  <div className="row-meta">
                    <span className={`amount ${transaction.amount >= 0 ? 'plus' : 'minus'}`}>
                      {transaction.amount >= 0 ? '+' : ''}
                      {formatCoins(transaction.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      <Sheet
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setCreatedOrder(null);
        }}
        title={selected ? `${selected.name} • ${formatCoins(selected.totalCoins)} ${lang === 'ar' ? 'ماس' : 'diamond'}` : ''}
      >
        {selected ? (
          <div className="stack">
            <div className="seg">
              <button className={currency === 'IQD' ? 'active' : ''} onClick={() => setCurrency('IQD')}>
                IQD
              </button>
              <button className={currency === 'USD' ? 'active' : ''} onClick={() => setCurrency('USD')}>
                USD
              </button>
            </div>

            <div className="field">
              <label>{t('paymentMethod')}</label>
              <div className="stack">
                {methods.map((method) => (
                  <button
                    key={method.id}
                    className={`row ${provider === method.id ? '' : 'static'}`}
                    style={{
                      borderColor: provider === method.id ? 'rgba(214,51,132,0.6)' : undefined,
                      opacity: method.enabled ? 1 : 0.45,
                      background: 'transparent',
                      textAlign: 'start',
                    }}
                    disabled={!method.enabled}
                    onClick={() => setProvider(method.id)}
                  >
                    <div className="row-main">
                      <div className="row-title">{lang === 'ar' ? method.label : method.labelEn}</div>
                      <div className="row-sub">{method.note}</div>
                    </div>
                    {provider === method.id ? <Icon name="check" size={17} /> : null}
                  </button>
                ))}
              </div>
            </div>

            <div className="card-flat">
              <div className="inline" style={{ justifyContent: 'space-between' }}>
                <span className="muted tiny">{t('total')}</span>
                <strong>
                  {formatCoins(currency === 'USD' ? selected.priceUsdCents / 100 : selected.priceIqd)}{' '}
                  {currency}
                </strong>
              </div>
              <div className="inline" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                <span className="muted tiny">{lang === 'ar' ? 'الماس' : 'diamond'}</span>
                <strong>
                  {formatCoins(selected.totalCoins)} {lang === 'ar' ? 'ماس' : 'diamond'}
                </strong>
              </div>
            </div>

            {createdOrder ? (
              <div className="card-flat stack">
                <div className="tiny muted">{t('rechargeNote')}</div>
                <div className="tiny">
                  {t('id')}: <span dir="ltr">{createdOrder.id.slice(0, 8)}</span>
                </div>
                <button className="btn btn-primary btn-block" onClick={() => void markPaid(createdOrder)}>
                  {t('confirm')}
                </button>
              </div>
            ) : (
              <button className="btn btn-primary btn-block" onClick={() => void createOrder()} disabled={busy}>
                {busy ? <span className="spinner" /> : t('recharge')}
              </button>
            )}
          </div>
        ) : null}
      </Sheet>

    </AppShell>
  );
}
