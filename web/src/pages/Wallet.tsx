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
import { GiftCodeButton } from '../components/GiftCodeSheet';

interface WalletData {
  wallet: { balance: number; reserved: number; earned: number; spent: number };
  transactions: {
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    createdAt: string;
    meta: Record<string, unknown>;
  }[];
  earnings: { total: number; calls: number };
  withdrawals: {
    id: string;
    coins: number;
    amountIqd: number;
    status: string;
    note: string | null;
    createdAt: string;
  }[];
  minWithdrawalCoins: number;
  coinToIqdRate: number;
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

const TX_LABELS: Record<string, string> = {
  call_charge: 'خصم مكالمة',
  call_reserve: 'حجز مكالمة',
  call_refund: 'إرجاع رصيد',
  earning: 'أرباح مكالمة',
  recharge: 'شحن كونز',
  withdrawal: 'طلب سحب',
  withdrawal_refund: 'إرجاع سحب',
  admin_adjust: 'تعديل إداري',
  gift_code: 'كود هدية',
  gift_send: 'إرسال هدية',
};

export default function Wallet() {
  const { t, lang } = useI18n();
  const { me, refresh } = useAuth();
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
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawCoins, setWithdrawCoins] = useState('');
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

  // Keep the wallet counters (balance / earned / spent / transactions) live instead of
  // showing the values captured when the page opened.
  useEffect(() => {
    const offWallet = on('wallet:update', () => void load(true));
    const offFree = on('free:update', () => void load(true));
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      offWallet();
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

  const submitWithdrawal = async () => {
    setBusy(true);
    try {
      await api('/wallet/withdrawals', {
        method: 'POST',
        body: { coins: Number(withdrawCoins) },
      });
      toast.push(t('withdrawRequest'), 'success');
      setWithdrawOpen(false);
      setWithdrawCoins('');
      await load();
      await refresh();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const wallet = data?.wallet ?? me?.wallet ?? { balance: 0, reserved: 0, earned: 0, spent: 0 };

  return (
    <AppShell title={t('wallet')} active="wallet">
      <div className="page page-tight">
        <section className="wallet-hero">
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <span className="tiny muted">{t('balance')}</span>
            <span className="pill pill-gold">
              <Icon name="coins" size={13} /> {t('coins')}
            </span>
          </div>
          <div className="balance">
            <strong>{formatCoins(wallet.balance)}</strong>
            <span className="muted tiny">
              ≈ {formatCoins(wallet.balance * (data?.coinToIqdRate ?? 5))} IQD
            </span>
          </div>
          <div className="wallet-split">
            <div>
              <span>{t('reserved')}</span>
              <b>{formatCoins(wallet.reserved)}</b>
            </div>
            <div>
              <span>{t('earnings')}</span>
              <b>{formatCoins(wallet.earned)}</b>
            </div>
            <div>
              <span>{t('spent')}</span>
              <b>{formatCoins(wallet.spent)}</b>
            </div>
          </div>
          <div className="inline" style={{ marginTop: 14, gap: 8 }}>
            <button className="btn btn-gold btn-sm grow" onClick={() => document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth' })}>
              <Icon name="plus" size={15} /> {t('recharge')}
            </button>
            <button className="btn btn-outline btn-sm grow" onClick={() => setWithdrawOpen(true)}>
              <Icon name="wallet" size={15} /> {t('withdraw')}
            </button>
          </div>
          <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => navigate('/earnings')}>
            <Icon name="gift" size={15} /> {t('giftEarnings')}
          </button>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            {t('walletReservedHint')}
          </p>
          <GiftCodeButton block onRedeemed={() => void load()} />
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
                  <span className="coins">{formatCoins(pack.totalCoins)}</span>
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
                      {formatCoins(order.coins)} {t('coins')} • {formatCoins(order.amount)}{' '}
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
            <span className="tiny muted">
              {t('earnings')}: {formatCoins(data?.earnings.total ?? 0)}
            </span>
          </div>
          {loading ? (
            <Spinner />
          ) : (data?.transactions.length ?? 0) === 0 ? (
            <EmptyState icon="wallet" title={t('noResults')} />
          ) : (
            <div className="list">
              {data?.transactions.map((transaction) => (
                <div key={transaction.id} className="row static">
                  <div className="icon-btn plain">
                    <Icon
                      name={
                        transaction.amount >= 0
                          ? transaction.type === 'earning'
                            ? 'gift'
                            : 'coins'
                          : 'phone'
                      }
                      size={18}
                    />
                  </div>
                  <div className="row-main">
                    <div className="row-title">
                      {TX_LABELS[transaction.type] ?? transaction.type}
                    </div>
                    <div className="row-sub">{formatTimeAgo(transaction.createdAt, lang)}</div>
                  </div>
                  <div className="row-meta">
                    <span className={`amount ${transaction.amount >= 0 ? 'plus' : 'minus'}`}>
                      {transaction.amount >= 0 ? '+' : ''}
                      {formatCoins(transaction.amount)}
                    </span>
                    <span className="tiny">{formatCoins(transaction.balanceAfter)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {(data?.withdrawals.length ?? 0) > 0 ? (
          <section className="stack">
            <div className="section-head">
              <h2>{t('withdrawals')}</h2>
            </div>
            <div className="list">
              {data?.withdrawals.map((withdrawal) => (
                <div key={withdrawal.id} className="row static">
                  <div className="row-main">
                    <div className="row-title">
                      {formatCoins(withdrawal.coins)} {t('coins')} • {formatCoins(withdrawal.amountIqd)} IQD
                    </div>
                    <div className="row-sub">{formatTimeAgo(withdrawal.createdAt, lang)}</div>
                  </div>
                  <span
                    className={`pill ${
                      withdrawal.status === 'approved'
                        ? 'pill-green'
                        : withdrawal.status === 'pending'
                          ? 'pill-gold'
                          : 'pill-red'
                    }`}
                    style={{ fontSize: 10 }}
                  >
                    {withdrawal.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <Sheet
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setCreatedOrder(null);
        }}
        title={selected ? `${selected.name} • ${formatCoins(selected.totalCoins)} ${t('coins')}` : ''}
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
                <span className="muted tiny">{t('coins')}</span>
                <strong>
                  {formatCoins(selected.totalCoins)} {t('coins')}
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

      <Sheet open={withdrawOpen} onClose={() => setWithdrawOpen(false)} title={t('withdrawRequest')}>
        <div className="stack">
          <div className="field">
            <label>{t('coins')}</label>
            <input
              className="input"
              type="number"
              value={withdrawCoins}
              onChange={(event) => setWithdrawCoins(event.target.value)}
              placeholder={String(data?.minWithdrawalCoins ?? 1000)}
              dir="ltr"
            />
            <span className="hint">
              {t('minWithdraw')}: {formatCoins(data?.minWithdrawalCoins ?? 1000)} {t('coins')}
            </span>
          </div>
          <div className="tiny muted">
            ≈ {formatCoins(Number(withdrawCoins || 0) * (data?.coinToIqdRate ?? 5))} IQD
          </div>
          <button className="btn btn-primary btn-block" onClick={() => void submitWithdrawal()} disabled={busy}>
            {t('withdraw')}
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}
