import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
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
import { GiftCover } from '../components/GiftAnimation';

interface ReceivedGift {
  id: string;
  giftName: string;
  price: number;
  coins: number;
  percent: number;
  currency: string;
  design: string | null;
  videoUrl: string | null;
  coverUrl: string | null;
  rarity: string;
  sender: { name: string; username: string; avatarUrl: string | null };
  createdAt: string;
}

interface ProfitTx {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  meta: Record<string, unknown>;
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
  methodLabel: string;
  details: string;
  status: string;
  note: string | null;
  rejectReason: string | null;
  transferRef: string | null;
  createdAt: string;
}

interface EarningsData {
  wallet: { totalEarned: number; available: number; pending: number; withdrawn: number };
  received: ReceivedGift[];
  transactions: ProfitTx[];
  withdrawals: PayoutRequest[];
  minWithdrawalBeans: number;
  maxWithdrawalBeans: number;
  beansPerUsd: number;
  beanToIqdRate: number;
  withdrawalFeePercent: number;
  methods: { id: string; label: string }[];
  currencies: string[];
}

const TX_LABELS: Record<string, string> = {
  gift_earning: 'أرباح هدية مستلمة',
  withdrawal_hold: 'حجز مبلغ سحب',
  withdrawal_paid: 'تم دفع السحب',
  withdrawal_refund: 'إرجاع مبلغ سحب',
  admin_adjust: 'تعديل إداري',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد المراجعة',
  approved: 'تمت الموافقة',
  paid: 'تم الدفع',
  rejected: 'مرفوض',
};

const STATUS_CLASS: Record<string, string> = {
  pending: 'pill-gold',
  approved: 'pill-blue',
  paid: 'pill-green',
  rejected: 'pill-red',
};

export default function Earnings() {
  const { t, lang } = useI18n();
  const { on } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coins, setCoins] = useState('');
  const [currency, setCurrency] = useState('IQD');
  const [method, setMethod] = useState('manual');
  const [details, setDetails] = useState('');

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const response = await api<EarningsData>('/gifts/earnings');
        setData(response);
        setCurrency((current) => (response.currencies.includes(current) ? current : 'IQD'));
      } catch (error) {
        toast.push((error as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const off = on('profit:update', () => void load(true));
    const offWallet = on('wallet:update', () => void load(true));
    return () => {
      off();
      offWallet();
    };
  }, [on, load]);

  const wallet = data?.wallet ?? { totalEarned: 0, available: 0, pending: 0, withdrawn: 0 };
  const beans = Math.max(0, Math.trunc(Number(coins || 0)));
  const rate = currency === 'USD' ? data?.beansPerUsd ?? 0 : data?.beanToIqdRate ?? 0;
  const gross =
    rate > 0
      ? currency === 'USD'
        ? Math.round((beans / rate) * 100) / 100
        : Math.round(beans * rate)
      : 0;
  const fee = Math.round(((gross * (data?.withdrawalFeePercent ?? 0)) / 100) * 100) / 100;
  const payout = Math.max(0, Math.round((gross - fee) * 100) / 100);

  const submit = async () => {
    setBusy(true);
    try {
      await api('/gifts/withdrawals', {
        method: 'POST',
        body: { beans: Number(coins), currency, method, details },
      });
      toast.push(t('withdrawRequest'), 'success');
      setOpen(false);
      setCoins('');
      setDetails('');
      await load();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      title={t('myEarnings')}
      subtitle={t('earningsWalletHint')}
      active="profile"
      right={
        <button className="icon-btn" onClick={() => navigate('/wallet')} aria-label="wallet">
          <Icon name="wallet" size={19} />
        </button>
      }
    >
      <div className="page page-tight">
        <section className="earnings-hero">
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <span className="tiny muted">{t('availableEarnings')}</span>
            <span className="pill pill-green">
              <Icon name="gift" size={13} /> {t('giftEarnings')}
            </span>
          </div>
          <div className="balance">
            <CurrencyIcon code="BEANS" size={26} />
            <strong>{formatCoins(wallet.available)}</strong>
            <span className="muted tiny">
              {t('beans')} ≈{' '}
              {formatCoins(Math.round(wallet.available * (data?.beanToIqdRate ?? 0) * 100) / 100)} IQD
            </span>
          </div>
          <div className="wallet-split">
            <div>
              <span>{t('totalEarnings')}</span>
              <b>{formatCoins(wallet.totalEarned)}</b>
            </div>
            <div>
              <span>{t('pendingEarnings')}</span>
              <b>{formatCoins(wallet.pending)}</b>
            </div>
            <div>
              <span>{t('withdrawnEarnings')}</span>
              <b>{formatCoins(wallet.withdrawn)}</b>
            </div>
          </div>
          <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={() => setOpen(true)}>
            <Icon name="wallet" size={16} /> {t('withdrawEarnings')}
          </button>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            {t('minWithdraw')}: {formatCoins(data?.minWithdrawalBeans ?? 0)} {t('beans')} · {t('maxWithdraw')}:{' '}
            {formatCoins(data?.maxWithdrawalBeans ?? 0)} {t('beans')}
          </p>
        </section>

        <section className="stack">
          <div className="section-head">
            <h2>{t('receivedGifts')}</h2>
            <span className="tiny muted">{data?.received.length ?? 0}</span>
          </div>
          <p className="tiny muted">
            {lang === 'ar'
              ? 'أرباح كل هدية تُرسل بالذهب أو الماس تُحوَّل إلى فاصوليا وتُضاف هنا.'
              : 'Profits from every gift paid in gold or diamond are converted into beans here.'}
          </p>
          {loading ? (
            <Spinner />
          ) : (data?.received.length ?? 0) === 0 ? (
            <EmptyState icon="gift" title={t('noReceivedGifts')} hint={t('receivedGiftsHint')} />
          ) : (
            <div className="list">
              {data?.received.map((gift) => (
                <div key={gift.id} className="row static gift-received-row">
                  <div className="gift-thumb">
                    <GiftCover
                      gift={{
                        name: gift.giftName,
                        design: gift.design,
                        videoUrl: gift.videoUrl,
                        coverUrl: gift.coverUrl,
                        rarity: gift.rarity,
                      }}
                    />
                  </div>
                  <div className="row-main">
                    <div className="row-title">{gift.giftName}</div>
                    <div className="row-sub">
                      {t('from')} {gift.sender.name} • {formatTimeAgo(gift.createdAt, lang)}
                    </div>
                  </div>
                  <div className="row-meta">
                    <span className="amount plus">
                      +{formatCoins(gift.coins)} {t('beans')}
                    </span>
                    <span className="tiny muted inline" style={{ gap: 4 }}>
                      <CurrencyIcon code={gift.currency === 'gold' ? 'GOLD' : 'DIAMOND'} size={12} />
                      {gift.currency === 'gold' ? t('gold') : lang === 'ar' ? 'ماس' : 'diamond'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="stack">
          <div className="section-head">
            <h2>{t('withdrawalRequests')}</h2>
          </div>
          {(data?.withdrawals.length ?? 0) === 0 ? (
            <EmptyState icon="wallet" title={t('noWithdrawals')} />
          ) : (
            <div className="list">
              {data?.withdrawals.map((row) => (
                <div key={row.id} className="row static" style={{ alignItems: 'flex-start' }}>
                  <div className="row-main">
                    <div className="row-title">
                      {formatCoins(row.beans)} {t('beans')} → {formatCoins(row.net || row.amount)} {row.currency}
                    </div>
                    <div className="row-sub">
                      {row.methodLabel} • {formatTimeAgo(row.createdAt, lang)}
                    </div>
                    {row.details ? <div className="tiny muted" dir="ltr">{row.details}</div> : null}
                    {row.feeAmount > 0 ? (
                      <div className="tiny muted">
                        {t('fee')}: {formatCoins(row.feeAmount)} {row.currency}
                      </div>
                    ) : null}
                    {row.rejectReason ? (
                      <div className="tiny" style={{ color: '#fca5a5' }}>
                        {row.rejectReason}
                      </div>
                    ) : null}
                    {row.transferRef ? (
                      <div className="tiny muted" dir="ltr">
                        Ref: {row.transferRef}
                      </div>
                    ) : null}
                  </div>
                  <span className={`pill ${STATUS_CLASS[row.status] ?? 'pill-gold'}`} style={{ fontSize: 10 }}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="stack">
          <div className="section-head">
            <h2>{t('earningsLedger')}</h2>
          </div>
          {(data?.transactions.length ?? 0) === 0 ? (
            <EmptyState icon="coins" title={t('noResults')} />
          ) : (
            <div className="list">
              {data?.transactions.map((row) => (
                <div key={row.id} className="row static">
                  <div className="icon-btn plain">
                    <Icon name={row.amount >= 0 ? 'gift' : 'wallet'} size={18} />
                  </div>
                  <div className="row-main">
                    <div className="row-title">{TX_LABELS[row.type] ?? row.type}</div>
                    <div className="row-sub">{formatTimeAgo(row.createdAt, lang)}</div>
                  </div>
                  <div className="row-meta">
                    <span className={`amount ${row.amount >= 0 ? 'plus' : 'minus'}`}>
                      {row.amount >= 0 ? '+' : ''}
                      {formatCoins(row.amount)}
                    </span>
                    <span className="tiny">{formatCoins(row.balanceAfter)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={t('withdrawEarnings')}>
        <div className="stack">
          <div className="card-flat">
            <div className="inline" style={{ justifyContent: 'space-between' }}>
              <span className="tiny muted">{t('availableEarnings')}</span>
              <b>{formatCoins(wallet.available)}</b>
            </div>
          </div>
          <div className="field">
            <label>{t('withdrawAmount')}</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={coins}
              onChange={(event) => setCoins(event.target.value)}
              placeholder={String(data?.minWithdrawalBeans ?? 0)}
              dir="ltr"
            />
            <span className="hint">
              {t('minWithdraw')}: {formatCoins(data?.minWithdrawalBeans ?? 0)} {t('beans')} · {t('maxWithdraw')}:{' '}
              {formatCoins(data?.maxWithdrawalBeans ?? 0)} {t('beans')}
            </span>
          </div>
          <div className="field">
            <label>{t('currency')}</label>
            <div className="seg">
              {(data?.currencies ?? ['IQD', 'USD']).map((code) => (
                <button
                  key={code}
                  className={currency === code ? 'active' : ''}
                  onClick={() => setCurrency(code)}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>{t('paymentMethod')}</label>
            <select className="select" value={method} onChange={(event) => setMethod(event.target.value)}>
              {(data?.methods ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('payoutDetails')}</label>
            <textarea
              className="input"
              rows={2}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder={t('payoutDetailsHint')}
            />
          </div>
          <div className="card-flat">
            <div className="inline" style={{ justifyContent: 'space-between' }}>
              <span className="muted tiny">{t('amount')}</span>
              <strong>
                {formatCoins(gross)} {currency}
              </strong>
            </div>
            <div className="inline" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <span className="muted tiny">
                {t('fee')} ({data?.withdrawalFeePercent ?? 0}%)
              </span>
              <strong>
                {formatCoins(fee)} {currency}
              </strong>
            </div>
            <div className="inline" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <span className="muted tiny">{t('payoutAmount')}</span>
              <strong style={{ color: '#86efac' }}>
                {formatCoins(payout)} {currency}
              </strong>
            </div>
          </div>
          <p className="tiny muted">{t('withdrawNote')}</p>
          <button className="btn btn-primary btn-block" onClick={() => void submit()} disabled={busy}>
            {busy ? <span className="spinner" /> : t('withdrawRequest')}
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}
