import { useEffect, useState, type CSSProperties } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon, Sheet } from '../lib/ui';

interface Redeemed {
  coins: number;
  balance: number;
  code: string;
}

const SPARKS = 14;

/** Celebration shown right after the coins land: burst of coins, glow and the amount. */
function CoinReward({ coins, onDone }: { coins: number; onDone: () => void }) {
  const { t } = useI18n();
  return (
    <div className="gift-reward">
      <span className="gift-glow" aria-hidden="true" />
      {Array.from({ length: SPARKS }).map((_, index) => {
        const angle = (index / SPARKS) * Math.PI * 2;
        const style = {
          '--dx': `${Math.round(Math.cos(angle) * 96)}px`,
          '--dy': `${Math.round(Math.sin(angle) * 96)}px`,
          animationDelay: `${index * 28}ms`,
        } as CSSProperties;
        return (
          <span key={index} className="gift-spark" style={style} aria-hidden="true">
            <Icon name={index % 3 === 0 ? 'sparkle' : 'coins'} size={index % 3 === 0 ? 15 : 20} />
          </span>
        );
      })}
      <span className="gift-medal" aria-hidden="true">
        <Icon name="coins" size={46} />
      </span>
      <h3 className="gift-title">{t('giftCodeSuccess')}</h3>
      <div className="gift-amount">
        +{formatCoins(coins)} <span>{t('coins')}</span>
      </div>
      <p className="tiny muted">{t('giftCodeSuccessHint')}</p>
      <button className="btn btn-gold btn-block" onClick={onDone}>
        {t('done')}
      </button>
    </div>
  );
}

export function GiftCodeSheet({
  open,
  onClose,
  onRedeemed,
}: {
  open: boolean;
  onClose: () => void;
  onRedeemed?: () => void;
}) {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Redeemed | null>(null);

  useEffect(() => {
    if (!open) {
      setCode('');
      setBusy(false);
      setError(null);
      setResult(null);
    }
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api<Redeemed>('/wallet/redeem', {
        method: 'POST',
        body: { code },
      });
      setResult(response);
      if (typeof navigator.vibrate === 'function') navigator.vibrate([40, 60, 90]);
      await refresh();
      onRedeemed?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} center title={result ? undefined : t('giftCode')}>
      {result ? (
        <CoinReward coins={result.coins} onDone={onClose} />
      ) : (
        <form className="stack" onSubmit={submit}>
          <div className="gift-intro">
            <span className="gift-intro-icon">
              <Icon name="gift" size={26} />
            </span>
            <p className="tiny muted">{t('giftCodeHint')}</p>
          </div>
          <div className="field">
            <label>{t('giftCode')}</label>
            <input
              className="input gift-input"
              dir="ltr"
              autoComplete="off"
              autoCapitalize="characters"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="XXXXX-XXXXX"
            />
          </div>
          {error ? (
            <span className="tiny" style={{ color: '#f87171' }}>
              {error}
            </span>
          ) : null}
          <button className="btn btn-gold btn-block" disabled={busy || !code.trim()}>
            {busy ? t('loading') : t('redeem')}
          </button>
        </form>
      )}
    </Sheet>
  );
}

/** Header gift button (icon) or a full-width entry used on the wallet page. */
export function GiftCodeButton({
  block = false,
  onRedeemed,
}: {
  block?: boolean;
  onRedeemed?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      {block ? (
        <button className="gift-entry" onClick={() => setOpen(true)}>
          <span className="gift-entry-icon">
            <Icon name="gift" size={17} />
          </span>
          <span className="gift-entry-text">
            <b>{t('redeemGiftCode')}</b>
            <span className="tiny muted">{t('giftCodeHint')}</span>
          </span>
          <Icon name="plus" size={16} />
        </button>
      ) : (
        <button
          className="icon-btn gift-btn"
          onClick={() => setOpen(true)}
          aria-label={t('redeemGiftCode')}
        >
          <Icon name="gift" size={18} />
        </button>
      )}
      <GiftCodeSheet open={open} onClose={() => setOpen(false)} onRedeemed={onRedeemed} />
    </>
  );
}
