import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { formatCoins, Icon, Spinner, useToast } from '../lib/ui';
import { AppShell, CoinPill } from '../components/AppShell';
import { RankBadge, rankName } from '../components/RankBadge';

interface RankItem {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string;
  kind: 'rank' | 'position' | string;
  tier: number;
  power: number;
  description: string;
  jobTitle: string | null;
  dailyCoins: number;
  commissionPercent: number;
  color: string;
  badgeImageUrl: string | null;
  permissions: string[];
  durationDays: number;
  isActive: boolean;
  holders?: number;
}

interface BoxExtra {
  type: string;
  amount?: number;
  itemId?: string;
}

interface BoxItem {
  id: string;
  rankKey: string;
  name: string;
  coins: number;
  extras: BoxExtra[];
  imageUrl: string | null;
  isActive: boolean;
}

interface ClaimRow {
  id: string;
  rankKey: string;
  date: string;
  coins: number;
  details: Record<string, unknown>;
  createdAt: string;
}

interface RanksResponse {
  ranks: RankItem[];
  boxes: BoxItem[];
  mine: RankItem | null;
  myBox: BoxItem | null;
  claimedToday: boolean;
  history: ClaimRow[];
  nextClaimAt: string;
}

interface AgentResponse {
  commissionPercent: number;
  totals: { rechargeCoins: number; paidOrders: number; earningsCoins: number; spentCoins: number };
  orders: {
    id: string;
    coins: number;
    amount: number;
    currency: string;
    provider: string;
    status: string;
    createdAt: string;
  }[];
}

const PERMISSION_LABELS: Record<string, string> = {
  '*': 'جميع الصلاحيات',
  manage_ranks: 'إدارة الرتب',
  manage_boxes: 'إدارة البوكسات',
  manage_users: 'إدارة المستخدمين',
  manage_rooms: 'إدارة الغرف',
  manage_events: 'إدارة الفعاليات',
  manage_balances: 'إدارة الأرصدة',
  system_settings: 'إعدادات النظام',
  support_tickets: 'طلبات الدعم',
  view_users: 'عرض المستخدمين',
  view_recharge_orders: 'طلبات الشحن',
  agent_panel: 'لوحة الوكيل',
};

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = String(Math.floor(total / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function permissionChips(permissions: string[]): string[] {
  if (!permissions?.length) return [];
  return permissions.map((permission) => PERMISSION_LABELS[permission] ?? permission);
}

export default function Ranks() {
  const { me, refresh } = useAuth();
  const { t, lang } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<RanksResponse | null>(null);
  const [agent, setAgent] = useState<AgentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<RanksResponse>('/ranks');
      setData(response);
      const permissions = response.mine?.permissions ?? [];
      if (permissions.includes('*') || permissions.includes('agent_panel')) {
        setAgent(await api<AgentResponse>('/ranks/agent').catch(() => null));
      }
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
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const claim = async () => {
    setClaiming(true);
    try {
      const result = await api<{ coins: number; granted: { label: string }[] }>('/ranks/box/claim', {
        method: 'POST',
      });
      setCelebrate(true);
      toast.push(t('boxClaimedToast'), 'success');
      setTimeout(() => setCelebrate(false), 2200);
      await Promise.all([load(), refresh()]);
      if (result.granted?.length) {
        toast.push(result.granted.map((item) => item.label).join(' • '), 'success');
      }
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setClaiming(false);
    }
  };

  const rankNameFor = (key: string) =>
    data?.ranks.find((rank) => rank.key === key)?.nameAr ?? key;

  const primaryRanks = useMemo(
    () => (data?.ranks ?? []).filter((rank) => rank.kind !== 'position' && rank.isActive),
    [data]
  );
  const positions = useMemo(
    () => (data?.ranks ?? []).filter((rank) => rank.kind === 'position' && rank.isActive),
    [data]
  );

  const countdown = formatCountdown(new Date(data?.nextClaimAt ?? Date.now()).getTime() - now);
  const myPermissions = permissionChips(data?.mine?.permissions ?? []);

  return (
    <AppShell title={t('ranks')} active="profile" right={<CoinPill balance={me?.wallet.balance ?? 0} />}>
      <div className="page page-tight">
        <section className="rank-hero">
          <span className="rank-hero-crown" aria-hidden="true">♛</span>
          <div className="rank-hero-title">{t('ranksHeroTitle')}</div>
          <div className="rank-hero-sub">{t('ranksHeroSub')}</div>
          <span className="rank-hero-spark rank-hero-spark-a" aria-hidden="true">✦</span>
          <span className="rank-hero-spark rank-hero-spark-b" aria-hidden="true">✦</span>
        </section>

        {loading && !data ? <Spinner label={t('loading')} /> : null}

        {data ? (
          <>
            {data.mine ? (
              <section
                className="card rank-mine"
                style={{ ['--rank-color' as string]: data.mine.color }}
              >
                <div className="rank-mine-badge">
                  <RankBadge rank={data.mine} size={76} />
                </div>
                <div className="grow">
                  <div className="tiny muted">{t('myRank')}</div>
                  <div className="rank-mine-name">{rankName(data.mine, lang)}</div>
                  {data.mine.jobTitle ? <div className="rank-job">{data.mine.jobTitle}</div> : null}
                  <div className="tiny muted">{data.mine.description}</div>
                  {myPermissions.length ? (
                    <div className="rank-perms">
                      {myPermissions.map((label) => (
                        <span key={label} className="rank-perm">{label}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="card rank-empty">
                <Icon name="shield" size={30} />
                <div>
                  <div className="rank-mine-name" style={{ fontSize: 17 }}>{t('noRankYet')}</div>
                  <div className="tiny muted">{t('noRankHint')}</div>
                </div>
              </section>
            )}

            {data.mine ? (
              <section className="card rank-box-card">
                <div
                  className={`rank-chest ${celebrate ? 'is-open' : ''} ${
                    data.claimedToday ? 'is-claimed' : ''
                  }`}
                >
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
                    <span className="rank-chest-coins">+{formatCoins(data.myBox?.coins ?? 0)}</span>
                  ) : null}
                </div>
                <div className="rank-box-info">
                  <div className="tiny muted">{t('dailyBox')}</div>
                  {data.myBox ? (
                    <>
                      <div className="rank-box-coins">
                        <Icon name="coins" size={20} />
                        <span>{formatCoins(data.myBox.coins)}</span>
                      </div>
                      <div className="tiny muted">{data.myBox.name}</div>
                      {data.myBox.extras?.length ? (
                        <ul className="rank-box-extras">
                          {data.myBox.extras.map((extra, index) => (
                            <li key={index}>
                              <Icon name="sparkle" size={13} />
                              {extra.type === 'coins'
                                ? `+${formatCoins(extra.amount ?? 0)} كونز إضافية`
                                : 'عنصر تجميلي حصري'}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <button
                        className="btn btn-primary btn-block"
                        disabled={data.claimedToday || claiming}
                        onClick={() => void claim()}
                      >
                        {data.claimedToday ? (
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
                      <div className="tiny muted center">
                        {data.claimedToday ? t('renewsAfter', { time: countdown }) : t('boxReady')}
                      </div>
                    </>
                  ) : (
                    <div className="tiny muted">{t('noBoxYet')}</div>
                  )}
                </div>
              </section>
            ) : null}

            {agent ? (
              <section className="card rank-agent">
                <div className="section-head">
                  <h2>{t('agentPanel')}</h2>
                  <span className="pill pill-gold">{t('commission')}: {agent.commissionPercent}%</span>
                </div>
                <div className="rank-agent-grid">
                  <div>
                    <span className="tiny muted">طلبات الشحن المدفوعة</span>
                    <b>{agent.totals.paidOrders}</b>
                  </div>
                  <div>
                    <span className="tiny muted">كونز الشحن</span>
                    <b>{formatCoins(agent.totals.rechargeCoins)}</b>
                  </div>
                  <div>
                    <span className="tiny muted">الأرباح</span>
                    <b>{formatCoins(agent.totals.earningsCoins)}</b>
                  </div>
                </div>
                {agent.orders.length ? (
                  <div className="list">
                    {agent.orders.slice(0, 5).map((order) => (
                      <div key={order.id} className="row static">
                        <div className="row-main">
                          <div className="row-title">{formatCoins(order.coins)} كونز</div>
                          <div className="row-sub">
                            {new Date(order.createdAt).toLocaleDateString('ar-IQ')} • {order.provider}
                          </div>
                        </div>
                        <span className={`pill ${order.status === 'paid' ? 'pill-green' : 'pill-pink'}`}>
                          {order.status === 'paid' ? 'مدفوع' : 'معلق'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="tiny muted">{t('noHistory')}</div>
                )}
              </section>
            ) : null}

            <section className="stack">
              <div className="section-head">
                <h2>{t('officialRanks')}</h2>
                <span className="tiny muted">{primaryRanks.length}</span>
              </div>
              <div className="rank-grid">
                {primaryRanks.map((rank) => (
                  <article
                    key={rank.key}
                    className={`rank-card ${data.mine?.key === rank.key ? 'is-mine' : ''}`}
                    style={{ ['--rank-color' as string]: rank.color }}
                  >
                    <div className="rank-card-top">
                      <RankBadge rank={rank} size={52} />
                      <div>
                        <div className="rank-card-name">{rankName(rank, lang)}</div>
                        <div className="rank-card-tier">الرتبة {rank.tier}</div>
                      </div>
                    </div>
                    <p className="rank-card-desc">{rank.description}</p>
                    <div className="rank-card-reward">
                      <Icon name="coins" size={15} />
                      <b>{formatCoins(rank.dailyCoins)}</b>
                      <span className="tiny muted">{t('dailyReward')}</span>
                    </div>
                    {permissionChips(rank.permissions).length ? (
                      <div className="rank-perms small">
                        {permissionChips(rank.permissions).map((label) => (
                          <span key={label} className="rank-perm">{label}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="rank-card-foot">
                      <span className="tiny muted">{t('holdersCount', { count: rank.holders ?? 0 })}</span>
                      <span className="tiny rank-grant-note">
                        {rank.key === 'recharge_agent' ? t('autoAgent') : t('grantManual')}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="stack">
              <div className="section-head">
                <h2>{t('seniorPositions')}</h2>
                <span className="tiny muted">{positions.length}</span>
              </div>
              <div className="rank-grid">
                {positions.map((rank) => (
                  <article
                    key={rank.key}
                    className={`rank-card ${data.mine?.key === rank.key ? 'is-mine' : ''}`}
                    style={{ ['--rank-color' as string]: rank.color }}
                  >
                    <div className="rank-card-top">
                      <RankBadge rank={rank} size={52} />
                      <div>
                        <div className="rank-card-name">{rankName(rank, lang)}</div>
                        <div className="rank-card-tier">منصب إداري</div>
                      </div>
                    </div>
                    <p className="rank-card-desc">{rank.description}</p>
                    <div className="rank-card-reward">
                      <Icon name="coins" size={15} />
                      <b>{formatCoins(rank.dailyCoins)}</b>
                      <span className="tiny muted">{t('dailyReward')}</span>
                    </div>
                    {permissionChips(rank.permissions).length ? (
                      <div className="rank-perms small">
                        {permissionChips(rank.permissions).map((label) => (
                          <span key={label} className="rank-perm">{label}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="rank-card-foot">
                      <span className="tiny muted">{t('holdersCount', { count: rank.holders ?? 0 })}</span>
                      <span className="tiny rank-grant-note">{t('grantManual')}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="stack">
              <div className="section-head">
                <h2>{t('claimHistory')}</h2>
                <span className="tiny muted">{data.history.length}</span>
              </div>
              {data.history.length ? (
                <div className="list">
                  {data.history.map((row) => (
                    <div key={row.id} className="row static">
                      <span className="rank-history-badge">
                        <RankBadge
                          rank={data.ranks.find((rank) => rank.key === row.rankKey) ?? null}
                          size={26}
                        />
                      </span>
                      <div className="row-main">
                        <div className="row-title">{rankNameFor(row.rankKey)}</div>
                        <div className="row-sub">{row.date}</div>
                      </div>
                      <span className="pill pill-gold">
                        <Icon name="coins" size={12} /> {formatCoins(row.coins)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <Icon name="gift" size={22} />
                  <span className="tiny">{t('noHistory')}</span>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
