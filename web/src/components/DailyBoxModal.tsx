/**
 * Daily rank box popup. Shown once the signed-in user's app loads while the box
 * of their active rank is still unclaimed for today (Baghdad day). Claiming
 * credits the reward on the server, then the popup closes itself.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon, useToast } from '../lib/ui';
import { RankBadge, rankName, type RankInfo } from './RankBadge';

interface BoxItem {
  id: string;
  name: string;
  coins: number;
  extras: { type: string; amount?: number }[];
  isActive: boolean;
}

interface RanksResponse {
  mine: (RankInfo & { dailyCoins: number }) | null;
  myBox: BoxItem | null;
  claimedToday: boolean;
}

export function DailyBoxModal() {
  const { token, refresh } = useAuth();
  const { t, lang } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<{ rank: RankInfo; box: BoxItem } | null>(null);
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  // Load on every sign-in / app start: the box only pops up while it is unclaimed.
  useEffect(() => {
    if (!token) {
      setOpen(false);
      setData(null);
      return;
    }
    let alive = true;
    api<RanksResponse>('/ranks')
      .then((response) => {
        if (!alive) return;
        const box = response.myBox;
        if (response.mine && box && box.isActive && !response.claimedToday) {
          setData({ rank: response.mine, box });
          setClaimed(false);
          setCelebrate(false);
          setOpen(true);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [token]);

  const claim = async () => {
    setClaiming(true);
    try {
      const result = await api<{ granted: { label: string }[] }>('/ranks/box/claim', {
        method: 'POST',
      });
      setClaimed(true);
      setCelebrate(true);
      toast.push(t('boxClaimedToast'), 'success');
      if (result.granted?.length) {
        toast.push(result.granted.map((item) => item.label).join(' • '), 'success');
      }
      await refresh();
      window.setTimeout(() => {
        setOpen(false);
        setCelebrate(false);
      }, 1700);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setClaiming(false);
    }
  };

  if (!open || !data) return null;

  return createPortal(
    <div className="overlay center" onClick={() => setOpen(false)}>
      <div className="dialog box-popup" onClick={(event) => event.stopPropagation()}>
        <button
          className="icon-btn plain box-popup-close"
          onClick={() => setOpen(false)}
          aria-label={t('boxLater')}
        >
          <Icon name="x" size={18} />
        </button>

        <div className="box-popup-head">
          <RankBadge rank={data.rank} size={46} />
          <div>
            <div className="box-popup-title">{t('dailyBoxPopupTitle')}</div>
            <div className="tiny muted">{rankName(data.rank, lang)}</div>
          </div>
        </div>

        <div className={`rank-chest box-chest ${celebrate ? 'is-open' : ''}`}>
          <span className="rank-chest-glow" aria-hidden="true" />
          <span className="rank-chest-lid" aria-hidden="true">
            <span className="rank-chest-gem">✦</span>
          </span>
          <span className="rank-chest-body" aria-hidden="true">
            <span className="rank-chest-lock">
              <Icon name="lock" size={15} />
            </span>
          </span>
          {celebrate ? (
            <span className="rank-chest-coins">+{formatCoins(data.box.coins)}</span>
          ) : null}
        </div>

        <div className="box-popup-coins">
          <Icon name="coins" size={22} />
          <span>{formatCoins(data.box.coins)}</span>
        </div>
        <div className="tiny muted">{t('dailyBoxPopupSub')}</div>
        {data.box.extras?.length ? (
          <ul className="rank-box-extras">
            {data.box.extras.map((extra, index) => (
              <li key={index}>
                <Icon name="sparkle" size={13} />
                {extra.type === 'coins'
                  ? `+${formatCoins(extra.amount ?? 0)} كونز إضافية`
                  : t('exclusiveCosmetic')}
              </li>
            ))}
          </ul>
        ) : null}

        <button
          className="btn btn-primary btn-block box-popup-claim"
          disabled={claiming || claimed}
          onClick={() => void claim()}
        >
          {claimed ? (
            <>
              <Icon name="check" size={16} /> {t('boxClaimedToday')}
            </>
          ) : claiming ? (
            <span className="spinner" />
          ) : (
            <>
              <Icon name="gift" size={16} /> {t('claimBox')}
            </>
          )}
        </button>
        {!claimed ? (
          <button className="btn btn-ghost btn-block" onClick={() => setOpen(false)}>
            {t('boxLater')}
          </button>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
