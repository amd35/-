import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, assetUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon, Spinner, useToast } from '../lib/ui';
import { AppShell } from '../components/AppShell';
import {
  LevelBadge,
  VipBadge,
  formatVipDate,
  formatXp,
  type LevelRowInfo,
  type LevelState,
  type VipInfo,
  type VipTier,
} from '../components/ProgressionBadges';

const VIP_ART =
  'https://media.base44.com/images/public/6addb0a6b0689d303ed3a495/101d09a55_file_0000000003508210a9bccef29510af36.png';

interface LevelHistoryRow {
  id: string;
  level: number;
  xp: number;
  reward_coins: number;
  source: string;
  created_at: string;
}

interface VipHistoryRow {
  id: string;
  tier: number;
  action: string;
  actor_kind: string;
  coins: number;
  expires_at: string | null;
  note: string | null;
  created_at: string;
}

interface LevelsResponse {
  level: LevelState;
  levels: LevelRowInfo[];
  xpSettings: Record<string, number>;
  vip: VipInfo | null;
  tiers: VipTier[];
  history: LevelHistoryRow[];
  vipHistory: VipHistoryRow[];
}

const VIP_ACTION_LABELS: Record<string, string> = {
  purchase: 'شراء',
  renew: 'تجديد',
  grant: 'منح إداري',
  revoke: 'سحب إداري',
  expire: 'انتهاء',
};

export default function Levels() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const { refresh } = useAuth();
  const [data, setData] = useState<LevelsResponse | null>(null);
  const [busyTier, setBusyTier] = useState<number | null>(null);

  const load = useCallback(async () => {
    const response = await api<LevelsResponse>('/levels');
    setData(response);
  }, []);

  useEffect(() => {
    void load().catch((error) => toast.push((error as Error).message, 'error'));
  }, [load, toast]);

  const buy = async (tier: VipTier) => {
    const message = t('vipBuyConfirm')
      .replace('{tier}', String(tier.tier))
      .replace('{price}', formatCoins(tier.priceCoins));
    if (!window.confirm(message)) return;
    setBusyTier(tier.tier);
    try {
      const requestId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await api('/levels/vip/purchase', { method: 'POST', body: { tier: tier.tier, requestId } });
      toast.push(t('vipPurchasedToast'), 'success');
      await Promise.all([load(), refresh()]);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusyTier(null);
    }
  };

  if (!data) {
    return (
      <AppShell title={t('levelsAndVip')} active="profile">
        <Spinner label={t('loading')} />
      </AppShell>
    );
  }

  const { level, levels, vip, tiers, xpSettings, history, vipHistory } = data;
  const sources = [
    { label: t('xpDaily'), value: `${xpSettings.daily_activity ?? 0} XP` },
    { label: t('xpRecharge'), value: `${xpSettings.recharge_per_100 ?? 0} XP / 100 ${t('coins')}` },
    { label: t('xpGift'), value: `${xpSettings.gift_per_100 ?? 0} XP / 100 ${t('coins')}` },
    { label: t('xpChat'), value: `${xpSettings.chat_message ?? 0} XP` },
    { label: t('xpAchievement'), value: `${xpSettings.achievement ?? 0} XP` },
  ];

  return (
    <AppShell
      title={t('levelsAndVip')}
      active="profile"
      right={
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="back">
          <Icon name="arrowRight" size={19} />
        </button>
      }
    >
      <div className="page page-tight levels-page">
        <section className="levels-hero">
          <img src={VIP_ART} alt="" className="levels-hero-art" />
          <div className="levels-hero-scrim" />
          <div className="levels-hero-copy">
            <span className="levels-hero-kicker">YALLA PHONE</span>
            <h2>{t('levelsHeroTitle')}</h2>
            <p className="tiny">{t('levelsHeroSub')}</p>
          </div>
        </section>

        <section className="card level-me-card">
          <div className="level-me-head">
            <LevelBadge level={level.level} size={52} color={level.badgeColor} imageUrl={level.badgeImageUrl} />
            <div>
              <div className="tiny muted">{t('myLevel')}</div>
              <h2 style={{ fontSize: 20 }}>{level.nameAr}</h2>
              <div className="tiny muted">
                {formatXp(level.xp)} XP
                {level.nextLevelXp !== null
                  ? ` • ${formatXp(level.nextLevelXp - level.xp)} XP ${t('xpToNext')}`
                  : ` • ${t('maxLevel')}`}
              </div>
            </div>
            <VipBadge vip={vip} size={18} showTitle />
          </div>
          <div className="xp-track" role="progressbar" aria-valuenow={Math.round(level.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="xp-fill" style={{ width: `${Math.round(level.progress * 100)}%` }} />
          </div>
          <div className="tiny muted" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span>
              {t('level')} {level.level}
            </span>
            <span>{level.nextLevel ? `${t('level')} ${level.nextLevel}` : t('maxLevel')}</span>
          </div>
        </section>

        <section className="card">
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>{t('xpSources')}</h2>
          <div className="xp-sources">
            {sources.map((source) => (
              <div key={source.label} className="xp-source">
                <span className="tiny muted">{source.label}</span>
                <b>{source.value}</b>
              </div>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>
            {t('xpRealOnly')}
          </p>
        </section>

        <section className="stack">
          <div className="section-head">
            <h2>{t('vipSectionTitle')}</h2>
            {vip ? (
              <span className="tiny muted">
                {t('vipExpires')}: {formatVipDate(vip.expiresAt)}
              </span>
            ) : null}
          </div>
          <div className="vip-grid">
            {tiers.map((tier) => {
              const owned = vip?.tier === tier.tier;
              return (
                <article
                  key={tier.tier}
                  className={`vip-card ${owned ? 'owned' : ''}`}
                  style={{ '--vip-color': tier.color } as React.CSSProperties}
                >
                  <header className="vip-card-head">
                    <span className="vip-emblem">
                      <span className="vip-emblem-number">{tier.tier}</span>
                      <span className="vip-emblem-label">VIP</span>
                    </span>
                    <div>
                      <h3>{tier.titleAr || tier.nameAr}</h3>
                      <span className="tiny muted">
                        {formatCoins(tier.priceCoins)} {t('coins')} • {tier.durationDays} {t('days')}
                      </span>
                    </div>
                  </header>
                  <ul className="vip-perks">
                    {tier.perks.map((perk) => (
                      <li key={perk}>{perk}</li>
                    ))}
                  </ul>
                  <button
                    className={`btn btn-sm btn-block ${owned ? 'btn-outline' : 'btn-gold'}`}
                    disabled={busyTier === tier.tier}
                    onClick={() => void buy(tier)}
                  >
                    {busyTier === tier.tier
                      ? t('processing')
                      : owned
                        ? t('vipRenew')
                        : t('vipBuy')}
                  </button>
                </article>
              );
            })}
          </div>
        </section>

        <section className="stack">
          <div className="section-head">
            <h2>{t('levelLadder')}</h2>
            <span className="tiny muted">{levels.length}</span>
          </div>
          <div className="level-grid">
            {levels.map((row) => (
              <div
                key={row.level}
                className={`level-chip ${row.level === level.level ? 'current' : ''} ${row.level < level.level ? 'done' : ''}`}
              >
                <div className="level-chip-art">
                  <LevelBadge level={row.level} size={72} color={row.badgeColor} imageUrl={row.badgeImageUrl} />
                </div>
                <span className="level-chip-level">
                  {t('level')} {row.level}
                </span>
                <span className="level-chip-xp">{formatXp(row.xpRequired)} XP</span>
                {row.rewardCoins > 0 ? (
                  <span className="level-chip-reward">+{formatCoins(row.rewardCoins)}</span>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>{t('levelHistory')}</h2>
          {history.length === 0 ? (
            <p className="tiny muted">{t('noHistory')}</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {history.map((row) => (
                <div key={row.id} className="inline" style={{ justifyContent: 'space-between' }}>
                  <span>
                    <LevelBadge level={row.level} size={20} /> {t('reachedLevel')} {row.level}
                  </span>
                  <span className="tiny muted">
                    {row.reward_coins > 0 ? `+${formatCoins(row.reward_coins)} • ` : ''}
                    {new Date(row.created_at).toLocaleDateString('ar-IQ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 style={{ fontSize: 15, marginBottom: 8 }}>{t('vipHistory')}</h2>
          {vipHistory.length === 0 ? (
            <p className="tiny muted">{t('noHistory')}</p>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {vipHistory.map((row) => (
                <div key={row.id} className="inline" style={{ justifyContent: 'space-between' }}>
                  <span>
                    VIP {row.tier} • {VIP_ACTION_LABELS[row.action] ?? row.action}
                  </span>
                  <span className="tiny muted">
                    {row.coins > 0 ? `${formatCoins(row.coins)} • ` : ''}
                    {new Date(row.created_at).toLocaleDateString('ar-IQ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {vip?.frameImageUrl ? (
          <div className="vip-frame-preview">
            <img src={assetUrl(vip.frameImageUrl)} alt="VIP frame" />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
