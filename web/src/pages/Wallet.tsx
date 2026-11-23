import { useCallback, useEffect, useMemo, useState } from 'react';
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

type LedgerTab = 'diamond' | 'beans';

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

interface PayoutRequest {
  id: string;
  beans: number;
  amount: number;
  currency: string;
  rate: number;
  feePercent: number;
  feeAmount: number;
  net: number;
  method: string;
  methodLabel?: string;
  details: string;
  status: string;
  note: string | null;
  rejectReason: string | null;
  transferRef: string | null;
  createdAt: string;
}

interface WalletData {
  wallet: { balance: number; reserved: number; earned: number; spent: number; gold?: number };
  currencies: {
    diamond: { code: string; balance: number; reserved: number; earned: number; spent: number };
    gold: { code: string; balance: number };
    beans: { code: string; available: number; pending: number; withdrawn: number; totalEarned: number };
  };
  transactions: LedgerRow[];
  goldTransactions: LedgerRow[];
  beanTransactions: LedgerRow[];
  earnings: { total: number; calls: number };
  withdrawals: PayoutRequest[];
  minWithdrawalBeans: number;
  maxWithdrawalBeans: number;
  beansPerUsd: number;
  beanToIqdRate: number;
  withdrawalFeePercent: number;
  withdrawalMethods: { id: string; label: string; labelEn: string; note: string }[];
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

const BEAN_LABELS: Record<string, string> = {
  gift_earning: 'أرباح هدية مستلمة',
  gift_host_earning: 'أرباح مالك الغرفة',
  withdrawal_hold: 'حجز مبلغ سحب',
  withdrawal_paid: 'تم دفع السحب',
  withdrawal_refund: 'إرجاع مبلغ سحب',
  admin_adjust: 'تعديل إداري',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد المراجعة',
  approved: 'مقبول',
  paid: 'تم الدفع',
  rejected: 'مرفوض',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'pill-gold',
  approved: 'pill-blue',
  paid: 'pill-green',
  rejected: 'pill-red',
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
  const [ledgerTab, setLedgerTab] = useState<LedgerTab>('diamond');
  const [selected, setSelected] = useState<Package | null>(null);
  const [currency, setCurrency] = useState<'IQD' | 'USD'>('IQD');
  const [provider, setProvider] = useState('manual');
  const [busy, setBusy] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawBeans, setWithdrawBeans] = useState('');
  const [payoutCurrency, setPayoutCurrency] = useState<'IQD' | 'USD'>('IQD');
  const [payoutMethod, setPayoutMethod] = useState('manual');
  const [payoutDetails, setPayoutDetails] = useState('');
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
      const payout = wallet.withdrawalMethods?.[0];
      if (payout) setPayoutMethod((current) => (current && wallet.withdrawalMethods.some((m) => m.id === current) ? current : payout.id));
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

  const submitWithdrawal = async () => {
    setBusy(true);
    try {
      await api('/wallet/withdrawals', {
        method: 'POST',
        body: {
          beans: Number(withdrawBeans),
          currency: payoutCurrency,
          method: payoutMethod,
          details: payoutDetails,
        },
      });
      toast.push(t('withdrawRequest'), 'success');
      setWithdrawOpen(false);
      setWithdrawBeans('');
      setPayoutDetails('');
      await load();
      await refresh();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const currencies = data?.currencies;
  const diamond = currencies?.diamond ?? {
    balance: data?.wallet.balance ?? me?.wallet?.balance ?? 0,
    reserved: data?.wallet.reserved ?? 0,
    earned: data?.wallet.earned ?? 0,
    spent: data?.wallet.spent ?? 0,
  };
  const beans = currencies?.beans ?? { available: 0, pending: 0, withdrawn: 0, totalEarned: 0 };

  const beansRequested = Math.max(0, Math.trunc(Number(withdrawBeans || 0)));
  const quote = useMemo(() => {
    const rate = payoutCurrency === 'USD' ? data?.beansPerUsd ?? 0 : data?.beanToIqdRate ?? 0;
    if (!(rate > 0)) return { gross: 0, fee: 0, net: 0, rate: 0 };
    const raw = payoutCurrency === 'USD' ? beansRequested / rate : beansRequested * rate;
    const gross = payoutCurrency === 'USD' ? Math.round(raw * 100) / 100 : Math.round(raw);
    const fee = Math.round((gross * (data?.withdrawalFeePercent ?? 0)) / (payoutCurrency === 'USD' ? 100 : 100) * 100) / 100;
    const net = Math.max(0, payoutCurrency === 'USD' ? Math.round((gross - fee) * 100) / 100 : Math.round(gross - fee));
    return { gross, fee, net, rate };
  }, [beansRequested, payoutCurrency, data?.beansPerUsd, data?.beanToIqdRate, data?.withdrawalFeePercent]);

  const belowMin = beansRequested < (data?.minWithdrawalBeans ?? 0);
  const aboveMax = (data?.maxWithdrawalBeans ?? 0) > 0 && beansRequested > (data?.maxWithdrawalBeans ?? 0);
  const aboveAvailable = beansRequested > beans.available;

  const ledgerRows = ledgerTab === 'beans' ? data?.beanTransactions ?? [] : data?.transactions ?? [];
  const ledgerLabels = ledgerTab === 'beans' ? BEAN_LABELS : DIAMOND_LABELS;

  return (
    <AppShell title={t('wallet')} active="wallet">
      <div className="page page-tight">
        <section className="wallet-hero">
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <span className="tiny muted">{lang === 'ar' ? 'محفظة يلا فون' : 'Yalla Phone wallet'}</span>
            <span className="pill pill-gold">
              <Icon name="wallet" size={13} /> {lang === 'ar' ? 'عملتان' : '2 currencies'}
            </span>
          </div>
          <div className="balance">
            <CurrencyIcon code="DIAMOND" size={30} />
            <strong>{formatCoins(diamond.balance)}</strong>
            <span className="muted tiny">{lang === 'ar' ? 'ماس' : 'Diamond'}</span>
          </div>
          <div className="wallet-split">
            <div>
              <span>{t('reserved')}</span>
              <b>{formatCoins(diamond.reserved)}</b>
            </div>
            <div>
              <span>{t('beans')}</span>
              <b>{formatCoins(beans.available)}</b>
            </div>
          </div>
          <div className="inline" style={{ marginTop: 14, gap: 8 }}>
            <button className="btn btn-gold btn-sm grow" onClick={() => document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth' })}>
              <Icon name="plus" size={15} /> {t('recharge')}
            </button>
            <button className="btn btn-outline btn-sm grow" onClick={() => setWithdrawOpen(true)}>
              <Icon name="wallet" size={15} /> {lang === 'ar' ? 'سحب الأرباح' : 'Withdraw'}
            </button>
          </div>
          <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 8 }} onClick={() => navigate('/earnings')}>
            <Icon name="gift" size={15} /> {t('giftEarnings')}
          </button>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            {lang === 'ar'
              ? 'الماس للهدايا والألعاب، والفاصوليا أرباح قابلة للسحب.'
              : 'Diamond is for gifts and games; beans are withdrawable profits.'}
          </p>
          <GiftCodeButton block onRedeemed={() => void load()} />
        </section>

        <section className="stack">
          <div className="section-head">
            <h2>{lang === 'ar' ? 'العملات' : 'Currencies'}</h2>
          </div>
          <div className="currency-grid">
            <div className="currency-card diamond">
              <CurrencyIcon code="DIAMOND" size={26} />
              <span>{lang === 'ar' ? 'DIAMOND · الماس' : 'DIAMOND'}</span>
              <b>{formatCoins(diamond.balance)}</b>
              <span className="tiny muted">{lang === 'ar' ? 'هدايا الغرف والدردشة' : 'Room & chat gifts'}</span>
            </div>
            <div className="currency-card beans">
              <CurrencyIcon code="BEANS" size={26} />
              <span>{t('beans')}</span>
              <b>{formatCoins(beans.available)}</b>
              <span className="tiny muted">
                {lang === 'ar' ? 'معلّقة' : 'Pending'} {formatCoins(beans.pending)} · {lang === 'ar' ? 'مسحوبة' : 'Withdrawn'}{' '}
                {formatCoins(beans.withdrawn)}
              </span>
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
            <span className="tiny muted">
              {lang === 'ar' ? 'إجمالي الأرباح' : 'Total earned'}: {formatCoins(beans.totalEarned)}
            </span>
          </div>
          <div className="seg">
            <button className={ledgerTab === 'diamond' ? 'active' : ''} onClick={() => setLedgerTab('diamond')}>
              {lang === 'ar' ? 'الماس' : 'Diamond'}
            </button>
            <button className={ledgerTab === 'beans' ? 'active' : ''} onClick={() => setLedgerTab('beans')}>
              {t('beans')}
            </button>
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
                    {ledgerTab === 'beans' ? (
                      <CurrencyIcon code="BEANS" size={18} />
                    ) : (
                      <CurrencyIcon code="DIAMOND" size={18} />
                    )}
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

        {(data?.withdrawals.length ?? 0) > 0 ? (
          <section className="stack">
            <div className="section-head">
              <h2>{t('withdrawals')}</h2>
            </div>
            <div className="list">
              {data?.withdrawals.map((withdrawal) => (
                <div key={withdrawal.id} className="row static" style={{ alignItems: 'flex-start' }}>
                  <div className="row-main">
                    <div className="row-title">
                      {formatCoins(withdrawal.beans)} {lang === 'ar' ? 'فاصوليا' : 'beans'} →{' '}
                      {formatCoins(withdrawal.net || withdrawal.amount)} {withdrawal.currency}
                    </div>
                    <div className="row-sub">
                      {withdrawal.methodLabel ?? withdrawal.method} • {formatTimeAgo(withdrawal.createdAt, lang)}
                    </div>
                    {withdrawal.rejectReason ? (
                      <div className="tiny" style={{ color: '#fca5a5' }}>
                        {lang === 'ar' ? 'السبب' : 'Reason'}: {withdrawal.rejectReason}
                      </div>
                    ) : null}
                    {withdrawal.transferRef ? (
                      <div className="tiny muted" dir="ltr">
                        Ref: {withdrawal.transferRef}
                      </div>
                    ) : null}
                  </div>
                  <span className={`pill ${STATUS_CLASS[withdrawal.status] ?? 'pill-gold'}`} style={{ fontSize: 10 }}>
                    {STATUS_LABEL[withdrawal.status] ?? withdrawal.status}
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

      <Sheet open={withdrawOpen} onClose={() => setWithdrawOpen(false)} title={t('withdrawRequest')}>
        <div className="stack">
          <div className="card-flat">
            <div className="inline" style={{ justifyContent: 'space-between' }}>
              <span className="tiny muted">{lang === 'ar' ? 'فاصوليا متاحة' : 'Available beans'}</span>
              <b>{formatCoins(beans.available)}</b>
            </div>
            <div className="inline" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <span className="tiny muted">{lang === 'ar' ? 'معلّقة' : 'Pending'}</span>
              <b>{formatCoins(beans.pending)}</b>
            </div>
          </div>
          <div className="field">
            <label>{lang === 'ar' ? 'عدد الفاصوليا' : 'Beans amount'}</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={withdrawBeans}
              onChange={(event) => setWithdrawBeans(event.target.value)}
              placeholder={String(data?.minWithdrawalBeans ?? 1000)}
              dir="ltr"
            />
            <span className="hint">
              {t('minWithdraw')}: {formatCoins(data?.minWithdrawalBeans ?? 0)} · {lang === 'ar' ? 'الأقصى' : 'Max'}:{' '}
              {formatCoins(data?.maxWithdrawalBeans ?? 0)}
            </span>
          </div>
          <div className="field">
            <label>{lang === 'ar' ? 'عملة السحب' : 'Payout currency'}</label>
            <div className="seg">
              <button className={payoutCurrency === 'IQD' ? 'active' : ''} onClick={() => setPayoutCurrency('IQD')}>
                دينار IQD
              </button>
              <button className={payoutCurrency === 'USD' ? 'active' : ''} onClick={() => setPayoutCurrency('USD')}>
                دولار USD
              </button>
            </div>
          </div>
          <div className="field">
            <label>{t('paymentMethod')}</label>
            <select className="select" value={payoutMethod} onChange={(event) => setPayoutMethod(event.target.value)}>
              {(data?.withdrawalMethods ?? []).map((method) => (
                <option key={method.id} value={method.id}>
                  {lang === 'ar' ? method.label : method.labelEn}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{lang === 'ar' ? 'بيانات الاستلام' : 'Payout details'}</label>
            <textarea
              className="input"
              rows={2}
              value={payoutDetails}
              onChange={(event) => setPayoutDetails(event.target.value)}
              placeholder={lang === 'ar' ? 'رقم المحفظة أو الحساب المصرفي' : 'Wallet number or bank account'}
            />
          </div>
          <div className="card-flat">
            <div className="inline" style={{ justifyContent: 'space-between' }}>
              <span className="muted tiny">{lang === 'ar' ? 'المبلغ' : 'Amount'}</span>
              <strong>
                {formatCoins(quote.gross)} {payoutCurrency}
              </strong>
            </div>
            <div className="inline" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <span className="muted tiny">
                {lang === 'ar' ? 'العمولة' : 'Fee'} ({data?.withdrawalFeePercent ?? 0}%)
              </span>
              <strong>
                {formatCoins(quote.fee)} {payoutCurrency}
              </strong>
            </div>
            <div className="inline" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <span className="muted tiny">{lang === 'ar' ? 'الصافي المستلم' : 'Net'}</span>
              <strong style={{ color: '#86efac' }}>
                {formatCoins(quote.net)} {payoutCurrency}
              </strong>
            </div>
          </div>
          {belowMin ? (
            <p className="tiny" style={{ color: '#fca5a5' }}>
              {lang === 'ar' ? 'أقل من الحد الأدنى للسحب' : 'Below the minimum withdrawal'}
            </p>
          ) : null}
          {aboveMax ? (
            <p className="tiny" style={{ color: '#fca5a5' }}>
              {lang === 'ar' ? 'أعلى من الحد الأقصى للسحب' : 'Above the maximum withdrawal'}
            </p>
          ) : null}
          {aboveAvailable ? (
            <p className="tiny" style={{ color: '#fca5a5' }}>
              {lang === 'ar' ? 'أكثر من رصيد الفاصوليا المتاح' : 'More than the available beans'}
            </p>
          ) : null}
          <p className="tiny muted">
            {lang === 'ar'
              ? 'لا يُعتبر المبلغ مدفوعاً إلا بعد تأكيد الإدارة لتنفيذ التحويل.'
              : 'The payout is only paid after the administration confirms the transfer.'}
          </p>
          <button
            className="btn btn-primary btn-block"
            onClick={() => void submitWithdrawal()}
            disabled={busy || belowMin || aboveMax || aboveAvailable || beansRequested <= 0 || payoutDetails.trim().length < 4}
          >
            {busy ? <span className="spinner" /> : t('withdraw')}
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}
