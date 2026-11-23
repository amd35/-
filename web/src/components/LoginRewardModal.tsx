/**
 * «مكافآت الدخول» — the weekly (7-day) login reward screen.
 *
 * It opens by itself once per app load while today's reward is still unclaimed.
 * The calendar, the claimed days and the granted items all come from the server
 * (`/api/login-rewards`), so the device clock can never fake a claim.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon, useToast } from '../lib/ui';
import { CurrencyIcon } from './CurrencyIcon';

interface RewardItem {
  kind: 'coins' | 'gift' | 'entry';
  amount?: number;
  quantity?: number;
  name?: string;
  nameEn?: string;
  design?: string | null;
  coverUrl?: string | null;
  rarity?: string;
  days?: number;
  label?: string;
}

interface RewardDay {
  day: number;
  items: RewardItem[];
  claimed: boolean;
  isToday: boolean;
  isGrand: boolean;
}

interface RewardState {
  cycle: number;
  weekName: string;
  weekNameEn: string;
  claimedDays: number;
  todayClaimed: boolean;
  canClaim: boolean;
  nextDay: number;
  weekComplete: boolean;
  resetsAt: string;
  days: RewardDay[];
}

function CrownMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 44" aria-hidden="true">
      <defs>
        <linearGradient id="lr-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff4c4" />
          <stop offset="45%" stopColor="#ffd24d" />
          <stop offset="100%" stopColor="#b97a12" />
        </linearGradient>
      </defs>
      <path
        d="M4 38 9 12l13 10L32 4l10 18 13-10 5 26Z"
        fill="url(#lr-crown)"
        stroke="#ffe9a3"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="9" r="3.2" fill="#ff5fa2" />
      <circle cx="11" cy="15" r="2.4" fill="#8b5cf6" />
      <circle cx="53" cy="15" r="2.4" fill="#4f46e5" />
    </svg>
  );
}

function ItemChip({ item, lang }: { item: RewardItem; lang: 'ar' | 'en' }) {
  const name = lang === 'ar' ? item.name : item.nameEn || item.name;
  if (item.kind === 'coins') {
    return (
      <span className="lr-item lr-item-coins">
        <CurrencyIcon code="DIAMOND" size={18} />
        <b>{formatCoins(item.amount ?? 0)}</b>
      </span>
    );
  }
  if (item.kind === 'entry') {
    return (
      <span className="lr-item lr-item-entry">
        <Icon name="sparkle" size={15} />
        <span className="lr-item-text">{name}</span>
        <em>
          {item.days} {lang === 'ar' ? 'أيام' : 'd'}
        </em>
      </span>
    );
  }
  return (
    <span className={`lr-item lr-item-gift rar-${item.rarity ?? 'common'}`}>
      <Icon name="gift" size={15} />
      <span className="lr-item-text">{name}</span>
      {Number(item.quantity ?? 1) > 1 ? <em>×{item.quantity}</em> : null}
    </span>
  );
}

export function LoginRewardModal() {
  const { token, refresh } = useAuth();
  const { t, lang } = useI18n();
  const toast = useToast();
  const [state, setState] = useState<RewardState | null>(null);
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [granted, setGranted] = useState<RewardItem[]>([]);
  const celebrateRef = useRef<HTMLDivElement | null>(null);

  // The granted items sit below the calendar, so bring them into view.
  useEffect(() => {
    if (celebrate) celebrateRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [celebrate]);

  // Pops up on sign-in / app start only while today's reward is unclaimed.
  useEffect(() => {
    if (!token) {
      setOpen(false);
      setState(null);
      return;
    }
    let alive = true;
    api<RewardState>('/login-rewards')
      .then((data) => {
        if (!alive) return;
        setState(data);
        if (data.canClaim) {
          setGranted([]);
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
    if (claiming || !state?.canClaim) return;
    setClaiming(true);
    try {
      const result = await api<{ granted: RewardItem[]; state: RewardState }>('/login-rewards/claim', {
        method: 'POST',
      });
      setState(result.state);
      setGranted(result.granted ?? []);
      setCelebrate(true);
      toast.push(t('loginRewardClaimedToast'), 'success');
      await refresh();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setClaiming(false);
    }
  };

  if (!open || !state) return null;

  const weekLabel = lang === 'ar' ? state.weekName : state.weekNameEn;
  const smallDays = state.days.filter((day) => !day.isGrand);
  const grandDay = state.days.find((day) => day.isGrand) ?? null;

  return createPortal(
    <div className="overlay center lr-overlay" onClick={() => setOpen(false)}>
      <div className="lr-sheet" onClick={(event) => event.stopPropagation()}>
        <button className="icon-btn plain lr-close" onClick={() => setOpen(false)} aria-label={t('loginRewardLater')}>
          <Icon name="x" size={18} />
        </button>
        <span className="lr-halo" aria-hidden="true" />

        <header className="lr-head">
          <CrownMark />
          <div className="lr-head-text">
            <div className="lr-title">{t('loginRewardTitle')}</div>
            <div className="lr-week">
              {weekLabel}
              <span className="lr-cycle">#{state.cycle}</span>
            </div>
          </div>
        </header>
        <p className="lr-sub">{t('loginRewardSubtitle')}</p>

        <div className="lr-streak">
          {Array.from({ length: 7 }).map((_, index) => (
            <span
              key={index}
              className={`lr-pip ${index < state.claimedDays ? 'on' : ''} ${
                index === state.claimedDays && !state.weekComplete ? 'next' : ''
              }`}
            />
          ))}
          <span className="lr-streak-label">
            {state.claimedDays}/7 {t('loginRewardStreak')}
          </span>
        </div>

        <div className="lr-grid">
          {smallDays.map((day) => (
            <div
              key={day.day}
              className={`lr-day ${day.claimed ? 'is-claimed' : ''} ${day.isToday ? 'is-today' : ''}`}
            >
              <span className="lr-day-num">
                {day.claimed ? <Icon name="check" size={13} /> : `${t('loginRewardDay')} ${day.day}`}
              </span>
              {day.isToday ? <span className="lr-today-pill">{t('loginRewardToday')}</span> : null}
              <div className="lr-day-items">
                {day.items.map((item, index) => (
                  <ItemChip key={`${day.day}-${index}`} item={item} lang={lang} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {grandDay ? (
          <div className={`lr-grand ${grandDay.claimed ? 'is-claimed' : ''} ${grandDay.isToday ? 'is-today' : ''}`}>
            <div className="lr-grand-top">
              <span className="lr-grand-crown">
                <CrownMark size={26} />
              </span>
              <div>
                <div className="lr-grand-title">{t('loginRewardGrand')}</div>
                <div className="lr-grand-day">
                  {t('loginRewardDay')} 7{grandDay.claimed ? ` • ${t('loginRewardClaimed')}` : ''}
                </div>
              </div>
              {grandDay.claimed ? <Icon name="check" size={20} /> : null}
            </div>
            <div className="lr-day-items lr-grand-items">
              {grandDay.items.map((item, index) => (
                <ItemChip key={`grand-${index}`} item={item} lang={lang} />
              ))}
            </div>
          </div>
        ) : null}

        {celebrate ? (
          <div className="lr-celebrate" ref={celebrateRef}>
            <div className="lr-celebrate-title">{t('loginRewardClaimed')} 🎉</div>
            <div className="lr-day-items lr-celebrate-items">
              {granted.map((item, index) => (
                <ItemChip key={`granted-${index}`} item={item} lang={lang} />
              ))}
            </div>
            <button className="btn btn-primary btn-block lr-claim" onClick={() => setOpen(false)}>
              {t('loginRewardClose')}
            </button>
          </div>
        ) : state.weekComplete ? (
          <div className="lr-foot">
            <div className="lr-note">{t('loginRewardWeekDone')}</div>
            <button className="btn btn-ghost btn-block" onClick={() => setOpen(false)}>
              {t('loginRewardClose')}
            </button>
          </div>
        ) : (
          <div className="lr-foot">
            <button className="btn btn-primary btn-block lr-claim" disabled={claiming} onClick={claim}>
              <span className="lr-claim-shine" aria-hidden="true" />
              <Icon name="gift" size={18} />
              {claiming ? '…' : t('loginRewardClaim')}
            </button>
            <button className="lr-later" onClick={() => setOpen(false)}>
              {t('loginRewardLater')}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
