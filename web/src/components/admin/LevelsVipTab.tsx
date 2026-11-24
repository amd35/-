import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Avatar, formatCoins, Icon, useToast } from '../../lib/ui';
import { AdminCard, AdminLoading, Empty, Field, Stat, Table, Toggle, adminError, useAdminData } from './shared';
import { LevelBadge, VipBadge, formatVipDate } from '../ProgressionBadges';

interface AdminLevel {
  level: number;
  nameAr: string;
  nameEn: string;
  xpRequired: number;
  rewardCoins: number;
  badgeColor: string;
  badgeImageUrl: string | null;
  isActive: boolean;
  users: number;
}

interface AdminTier {
  tier: number;
  nameAr: string;
  nameEn: string;
  priceCoins: number;
  durationDays: number;
  color: string;
  titleAr: string;
  perks: string[];
  isActive: boolean;
  users: number;
}

interface XpSetting {
  key: string;
  value: number;
  description: string;
}

interface LevelUpRow {
  id: string;
  level: number;
  xp: number;
  reward_coins: number;
  created_at: string;
  display_name: string;
  username: string;
}

interface VipLogRow {
  id: string;
  tier: number;
  action: string;
  actor_kind: string;
  actor_name: string;
  coins: number;
  expires_at: string | null;
  note: string | null;
  created_at: string;
  display_name: string;
  username: string;
}

interface ActiveVipRow {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  tier: number;
  color: string;
  source: string;
  expires_at: string | null;
}

interface Overview {
  levels: AdminLevel[];
  tiers: AdminTier[];
  totalVip: number;
  levelUpEffects: boolean;
  xpSettings: XpSetting[];
  levelUps: LevelUpRow[];
  vipHistory: VipLogRow[];
  activeVips: ActiveVipRow[];
}

interface SearchedUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  vip_tier: number | null;
  vip_name: string | null;
  vip_color: string | null;
  expires_at: string | null;
}

const XP_LABELS: Record<string, string> = {
  daily_activity: 'XP النشاط اليومي (مرة يومياً)',
  recharge_per_100: 'XP لكل 100 كونز مشحونة',
  gift_per_100: 'XP لكل 100 كونز من الهدايا المرسلة',
  chat_message: 'XP لكل رسالة دردشة',
  chat_daily_cap: 'أقصى XP يومي من الدردشة',
  achievement: 'XP للإنجاز / المهمة',
  daily_xp_cap: 'الحد اليومي لنقاط المستخدم (0 = بلا حد)',
  game_play: 'نقاط إتمام مباراة لعبة',
  game_win: 'نقاط الفوز بمباراة لعبة',
  mic_task_minutes: 'دقائق المايك لمهمة الغرفة',
  mic_task_xp: 'نقاط إنجاز مهمة المايك',
};

const VIP_ACTION_LABELS: Record<string, string> = {
  purchase: 'شراء',
  renew: 'تجديد',
  grant: 'منح',
  revoke: 'سحب',
  expire: 'انتهاء',
};

export default function LevelsVipTab() {
  const { data, loading, error, reload } = useAdminData<Overview>('/admin/levels');
  const toast = useToast();

  const [levelDrafts, setLevelDrafts] = useState<Record<number, Partial<AdminLevel>>>({});
  const [tierDrafts, setTierDrafts] = useState<Record<number, Partial<AdminTier>>>({});
  const [xpDraft, setXpDraft] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<SearchedUser[]>([]);
  const [picked, setPicked] = useState<SearchedUser | null>(null);
  const [grantTier, setGrantTier] = useState(1);
  const [grantDays, setGrantDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [uploadingLevel, setUploadingLevel] = useState<number | null>(null);

  useEffect(() => {
    if (!data) return;
    const next: Record<string, number> = {};
    for (const row of data.xpSettings) next[row.key] = row.value;
    setXpDraft(next);
  }, [data]);

  if (loading && !data) return <AdminLoading label="جارٍ تحميل المستويات و VIP…" />;
  if (error) return <Empty text={error} />;
  if (!data) return <Empty text="لا توجد بيانات" />;

  const levelOf = (row: AdminLevel) => ({ ...row, ...(levelDrafts[row.level] ?? {}) });
  const tierOf = (row: AdminTier) => ({ ...row, ...(tierDrafts[row.tier] ?? {}) });

  const saveLevel = async (row: AdminLevel) => {
    const draft = levelOf(row);
    try {
      await api(`/admin/levels/${row.level}`, {
        method: 'PUT',
        admin: true,
        body: {
          nameAr: draft.nameAr,
          nameEn: draft.nameEn,
          xpRequired: draft.xpRequired,
          rewardCoins: draft.rewardCoins,
          badgeColor: draft.badgeColor,
          badgeImageUrl: draft.badgeImageUrl,
          isActive: draft.isActive,
        },
      });
      toast.push(`تم حفظ المستوى ${row.level}`, 'success');
      setLevelDrafts((current) => {
        const next = { ...current };
        delete next[row.level];
        return next;
      });
      await reload();
    } catch (err) {
      toast.push(adminError(err), 'error');
    }
  };

  const removeLevel = async (row: AdminLevel) => {
    if (!window.confirm(`حذف المستوى ${row.level}؟`)) return;
    try {
      await api(`/admin/levels/${row.level}`, { method: 'DELETE', admin: true });
      toast.push('تم حذف المستوى', 'success');
      await reload();
    } catch (err) {
      toast.push(adminError(err), 'error');
    }
  };

  const saveXp = async () => {
    try {
      await api('/admin/levels/xp-settings', { method: 'PUT', admin: true, body: { settings: xpDraft } });
      toast.push('تم حفظ معدلات XP', 'success');
      await reload();
    } catch (err) {
      toast.push(adminError(err), 'error');
    }
  };

  const saveEffects = async (value: boolean) => {
    try {
      await api('/admin/settings', { method: 'PUT', admin: true, body: { level_up_effects: value } });
      toast.push(value ? 'تم تفعيل مؤثرات الترقية' : 'تم إيقاف مؤثرات الترقية', 'success');
      await reload();
    } catch (err) {
      toast.push(adminError(err), 'error');
    }
  };

  /** Uploads the artwork for one level; the ladder's save button applies it. */
  const uploadLevelArt = async (level: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    setUploadingLevel(level);
    try {
      const response = await api<{ url: string }>('/admin/rooms/upload', {
        method: 'POST',
        admin: true,
        form: body,
      });
      setLevelDrafts((current) => ({
        ...current,
        [level]: { ...current[level], badgeImageUrl: response.url },
      }));
      toast.push('تم رفع صورة المستوى — اضغط حفظ لتثبيتها', 'success');
    } catch (err) {
      toast.push(adminError(err), 'error');
    } finally {
      setUploadingLevel(null);
      event.target.value = '';
    }
  };

  const saveTier = async (row: AdminTier) => {
    const draft = tierOf(row);
    try {
      await api(`/admin/vip/tiers/${row.tier}`, {
        method: 'PUT',
        admin: true,
        body: {
          nameAr: draft.nameAr,
          priceCoins: draft.priceCoins,
          durationDays: draft.durationDays,
          color: draft.color,
          titleAr: draft.titleAr,
          perks: draft.perks,
          isActive: draft.isActive,
        },
      });
      toast.push(`تم حفظ VIP ${row.tier}`, 'success');
      setTierDrafts((current) => {
        const next = { ...current };
        delete next[row.tier];
        return next;
      });
      await reload();
    } catch (err) {
      toast.push(adminError(err), 'error');
    }
  };

  const runSearch = async () => {
    if (!search.trim()) return;
    try {
      const response = await api<{ users: SearchedUser[] }>(
        `/admin/vip/search?q=${encodeURIComponent(search.trim())}`,
        { admin: true }
      );
      setFound(response.users);
      if (!response.users.length) toast.push('لا يوجد مستخدم مطابق', 'error');
    } catch (err) {
      toast.push(adminError(err), 'error');
    }
  };

  const grant = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await api('/admin/vip/grant', {
        method: 'POST',
        admin: true,
        body: { userId: picked.id, tier: grantTier, days: grantDays },
      });
      toast.push(`تم منح VIP ${grantTier} إلى ${picked.display_name}`, 'success');
      setPicked(null);
      setFound([]);
      setSearch('');
      await reload();
    } catch (err) {
      toast.push(adminError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const renew = async (row: ActiveVipRow) => {
    try {
      await api('/admin/vip/renew', {
        method: 'POST',
        admin: true,
        body: { userId: row.user_id, days: 30 },
      });
      toast.push('تم تجديد الاشتراك 30 يوماً', 'success');
      await reload();
    } catch (err) {
      toast.push(adminError(err), 'error');
    }
  };

  const revoke = async (row: ActiveVipRow) => {
    if (!window.confirm(`سحب VIP من ${row.display_name}؟`)) return;
    try {
      await api('/admin/vip/revoke', {
        method: 'POST',
        admin: true,
        body: { userId: row.user_id },
      });
      toast.push('تم سحب VIP', 'success');
      await reload();
    } catch (err) {
      toast.push(adminError(err), 'error');
    }
  };

  const topLevels = [...data.levels].sort((a, b) => b.users - a.users).slice(0, 5);

  return (
    <div className="stack">
      <div className="stat-grid">
        <Stat label="مستويات مفعّلة" value={data.levels.filter((row) => row.isActive).length} />
        <Stat label="مشتركو VIP الفعّالون" value={data.totalVip} accent="#ffd75e" />
        <Stat
          label="أكثر مستوى ازدحاماً"
          value={topLevels[0] ? `Lv ${topLevels[0].level} (${topLevels[0].users})` : '—'}
        />
        <Stat label="ترقيات مسجلة" value={data.levelUps.length} hint="آخر 50" />
      </div>

      <AdminCard title="مؤثرات الترقية" subtitle="الاحتفال الملكي الذي يظهر للمستخدم لحظة انتقاله لمستوى جديد">
        <div className="inline" style={{ justifyContent: 'space-between', gap: 12 }}>
          <span className="tiny muted">
            عند الإيقاف يبقى إشعار التهنئة وسجل الترقيات، ويُخفى الاحتفال بالحركة والصوت.
          </span>
          <Toggle
            checked={Boolean(data.levelUpEffects)}
            label="تفعيل مؤثرات الترقية"
            onChange={(value) => void saveEffects(value)}
          />
        </div>
      </AdminCard>

      <AdminCard title="معدلات نقاط الخبرة" subtitle="تُطبَّق على العمليات الحقيقية المؤكدة فقط">
        <div className="grid-2">
          {data.xpSettings.map((row) => (
            <Field key={row.key} label={XP_LABELS[row.key] ?? row.key} hint={row.description}>
              <input
                type="number"
                min={0}
                value={xpDraft[row.key] ?? row.value}
                onChange={(event) =>
                  setXpDraft((current) => ({ ...current, [row.key]: Number(event.target.value) }))
                }
              />
            </Field>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => void saveXp()}>
          حفظ المعدلات
        </button>
      </AdminCard>

      <AdminCard title="سلم المستويات (1–100)" subtitle="نقاط الخبرة التراكمية المطلوبة والمكافأة عند الترقية">
        <Table head={['المستوى', 'الاسم', 'XP المطلوب', 'مكافأة الكونز', 'اللون', 'مفعّل', 'مستخدمون', '']}>
          {data.levels.map((raw) => {
            const row = levelOf(raw);
            return (
              <tr key={raw.level}>
                <td>
                  <div className="inline" style={{ gap: 6 }}>
                    <LevelBadge level={raw.level} size={30} color={row.badgeColor} imageUrl={row.badgeImageUrl} />
                    <label className="btn btn-outline btn-xs" title="رفع صورة المستوى">
                      <Icon name="image" size={13} />
                      {uploadingLevel === raw.level ? '…' : ''}
                      <input
                        type="file"
                        accept="image/png,image/webp"
                        hidden
                        onChange={(event) => void uploadLevelArt(raw.level, event)}
                      />
                    </label>
                  </div>
                </td>
                <td>
                  <input
                    value={row.nameAr}
                    onChange={(event) =>
                      setLevelDrafts((current) => ({
                        ...current,
                        [raw.level]: { ...current[raw.level], nameAr: event.target.value },
                      }))
                    }
                    style={{ width: 120 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={row.xpRequired}
                    onChange={(event) =>
                      setLevelDrafts((current) => ({
                        ...current,
                        [raw.level]: { ...current[raw.level], xpRequired: Number(event.target.value) },
                      }))
                    }
                    style={{ width: 110 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    value={row.rewardCoins}
                    onChange={(event) =>
                      setLevelDrafts((current) => ({
                        ...current,
                        [raw.level]: { ...current[raw.level], rewardCoins: Number(event.target.value) },
                      }))
                    }
                    style={{ width: 100 }}
                  />
                </td>
                <td>
                  <input
                    type="color"
                    value={row.badgeColor}
                    onChange={(event) =>
                      setLevelDrafts((current) => ({
                        ...current,
                        [raw.level]: { ...current[raw.level], badgeColor: event.target.value },
                      }))
                    }
                  />
                </td>
                <td>
                  <Toggle
                    checked={row.isActive}
                    label=""
                    onChange={(value) =>
                      setLevelDrafts((current) => ({
                        ...current,
                        [raw.level]: { ...current[raw.level], isActive: value },
                      }))
                    }
                  />
                </td>
                <td>{row.users}</td>
                <td>
                  <div className="inline">
                    <button className="btn btn-primary btn-xs" onClick={() => void saveLevel(raw)}>
                      حفظ
                    </button>
                    {raw.level > 1 ? (
                      <button className="btn btn-outline btn-xs" onClick={() => void removeLevel(raw)}>
                        <Icon name="trash" size={13} />
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </AdminCard>

      <AdminCard title="رتب VIP (1–5)" subtitle="السعر والمدة والمزايا — تُدار بالكامل من هنا">
        {data.tiers.map((raw) => {
          const row = tierOf(raw);
          return (
            <div key={raw.tier} className="card" style={{ gap: 10 }}>
              <div className="inline" style={{ justifyContent: 'space-between' }}>
                <VipBadge
                  vip={{
                    tier: raw.tier,
                    nameAr: row.nameAr,
                    nameEn: raw.nameEn,
                    color: row.color,
                    titleAr: row.titleAr,
                    titleEn: raw.nameEn,
                    badgeImageUrl: null,
                    frameImageUrl: null,
                    bubbleImageUrl: null,
                    source: 'admin',
                    expiresAt: null,
                  }}
                  size={18}
                  showTitle
                />
                <span className="tiny muted">{row.users} مشترك</span>
              </div>
              <div className="grid-2">
                <Field label="الاسم">
                  <input
                    value={row.nameAr}
                    onChange={(event) =>
                      setTierDrafts((current) => ({
                        ...current,
                        [raw.tier]: { ...current[raw.tier], nameAr: event.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="اللقب الملكي">
                  <input
                    value={row.titleAr}
                    onChange={(event) =>
                      setTierDrafts((current) => ({
                        ...current,
                        [raw.tier]: { ...current[raw.tier], titleAr: event.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="السعر (كونز)">
                  <input
                    type="number"
                    min={0}
                    value={row.priceCoins}
                    onChange={(event) =>
                      setTierDrafts((current) => ({
                        ...current,
                        [raw.tier]: { ...current[raw.tier], priceCoins: Number(event.target.value) },
                      }))
                    }
                  />
                </Field>
                <Field label="المدة (أيام)">
                  <input
                    type="number"
                    min={1}
                    value={row.durationDays}
                    onChange={(event) =>
                      setTierDrafts((current) => ({
                        ...current,
                        [raw.tier]: { ...current[raw.tier], durationDays: Number(event.target.value) },
                      }))
                    }
                  />
                </Field>
                <Field label="اللون">
                  <input
                    type="color"
                    value={row.color}
                    onChange={(event) =>
                      setTierDrafts((current) => ({
                        ...current,
                        [raw.tier]: { ...current[raw.tier], color: event.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="المزايا (سطر لكل ميزة)">
                  <textarea
                    rows={4}
                    value={(row.perks ?? []).join('\n')}
                    onChange={(event) =>
                      setTierDrafts((current) => ({
                        ...current,
                        [raw.tier]: {
                          ...current[raw.tier],
                          perks: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean),
                        },
                      }))
                    }
                  />
                </Field>
              </div>
              <div className="inline" style={{ justifyContent: 'space-between' }}>
                <Toggle
                  checked={row.isActive}
                  label="الرتبة متاحة للشراء"
                  onChange={(value) =>
                    setTierDrafts((current) => ({
                      ...current,
                      [raw.tier]: { ...current[raw.tier], isActive: value },
                    }))
                  }
                />
                <button className="btn btn-primary btn-sm" onClick={() => void saveTier(raw)}>
                  حفظ VIP {raw.tier}
                </button>
              </div>
            </div>
          );
        })}
      </AdminCard>

      <AdminCard title="منح VIP لمستخدم" subtitle="بحث بالاسم أو الـ ID أو البريد ثم اختيار الرتبة">
        <div className="inline" style={{ gap: 8 }}>
          <input
            placeholder="ابحث عن مستخدم…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runSearch();
            }}
          />
          <button className="btn btn-outline btn-sm" onClick={() => void runSearch()}>
            بحث
          </button>
        </div>
        {found.length > 0 ? (
          <div className="list">
            {found.map((user) => (
              <div key={user.id} className="row static">
                <Avatar user={{ displayName: user.display_name, avatarUrl: user.avatar_url }} size={36} />
                <div className="row-main">
                  <div className="row-title">{user.display_name}</div>
                  <div className="row-sub">
                    #{user.username} • Lv {user.level}
                    {user.vip_tier ? ` • VIP ${user.vip_tier}` : ''}
                  </div>
                </div>
                <button className="btn btn-outline btn-xs" onClick={() => setPicked(user)}>
                  اختيار
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {picked ? (
          <div className="card" style={{ gap: 10 }}>
            <div className="inline" style={{ justifyContent: 'space-between' }}>
              <b>{picked.display_name}</b>
              <button className="btn btn-outline btn-xs" onClick={() => setPicked(null)}>
                إلغاء
              </button>
            </div>
            <div className="grid-2">
              <Field label="رتبة VIP">
                <select value={grantTier} onChange={(event) => setGrantTier(Number(event.target.value))}>
                  {data.tiers.map((row) => (
                    <option key={row.tier} value={row.tier}>
                      VIP {row.tier} — {row.titleAr || row.nameAr}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="المدة (أيام)">
                <input
                  type="number"
                  min={1}
                  value={grantDays}
                  onChange={(event) => setGrantDays(Number(event.target.value))}
                />
              </Field>
            </div>
            <button className="btn btn-primary" disabled={busy} onClick={() => void grant()}>
              {busy ? 'جارٍ المنح…' : `منح VIP ${grantTier} مجاناً`}
            </button>
          </div>
        ) : null}
      </AdminCard>

      <AdminCard title="مشتركو VIP الحاليون" subtitle="تجديد 30 يوماً أو سحب فوري">
        {data.activeVips.length === 0 ? (
          <Empty text="لا يوجد مشتركون حالياً" />
        ) : (
          <Table head={['المستخدم', 'الرتبة', 'المصدر', 'ينتهي', '']}>
            {data.activeVips.map((row) => (
              <tr key={`${row.user_id}-${row.tier}`}>
                <td>
                  {row.display_name} <span className="tiny muted">#{row.username}</span>
                </td>
                <td>VIP {row.tier}</td>
                <td>{row.source === 'admin' ? 'إداري' : 'شراء'}</td>
                <td>{formatVipDate(row.expires_at)}</td>
                <td>
                  <div className="inline">
                    <button className="btn btn-outline btn-xs" onClick={() => void renew(row)}>
                      +30 يوم
                    </button>
                    <button className="btn btn-outline btn-xs" onClick={() => void revoke(row)}>
                      سحب
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>

      <AdminCard title="سجل الترقيات" subtitle="آخر 50 ترقية مستوى">
        {data.levelUps.length === 0 ? (
          <Empty text="لا توجد ترقيات بعد" />
        ) : (
          <Table head={['المستخدم', 'المستوى', 'XP', 'المكافأة', 'التاريخ']}>
            {data.levelUps.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.display_name} <span className="tiny muted">#{row.username}</span>
                </td>
                <td>Lv {row.level}</td>
                <td>{row.xp}</td>
                <td>{row.reward_coins > 0 ? formatCoins(row.reward_coins) : '—'}</td>
                <td className="tiny">{new Date(row.created_at).toLocaleString('ar-IQ')}</td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>

      <AdminCard title="سجل اشتراكات VIP" subtitle="آخر 50 عملية شراء أو منح أو سحب">
        {data.vipHistory.length === 0 ? (
          <Empty text="لا يوجد سجل بعد" />
        ) : (
          <Table head={['المستخدم', 'الرتبة', 'العملية', 'المنفّذ', 'الكونز', 'التاريخ']}>
            {data.vipHistory.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.display_name} <span className="tiny muted">#{row.username}</span>
                </td>
                <td>VIP {row.tier}</td>
                <td>{VIP_ACTION_LABELS[row.action] ?? row.action}</td>
                <td>{row.actor_name || (row.actor_kind === 'user' ? 'المستخدم' : 'النظام')}</td>
                <td>{row.coins > 0 ? formatCoins(row.coins) : '—'}</td>
                <td className="tiny">{new Date(row.created_at).toLocaleString('ar-IQ')}</td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>
    </div>
  );
}
