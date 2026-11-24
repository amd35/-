import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Avatar, formatCoins, Icon, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Stat, Table, Toggle, useAdminData } from './shared';
import { RankBadge } from '../RankBadge';

interface AdminRank {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string;
  kind: string;
  tier: number;
  power: number;
  description: string;
  dailyCoins: number;
  commissionPercent: number;
  color: string;
  badgeImageUrl: string | null;
  permissions: string[];
  durationDays: number;
  isActive: boolean;
  sortOrder: number;
  holders?: number;
}

interface BoxExtra {
  type: string;
  amount?: number;
  itemId?: string;
}

interface AdminBox {
  id: string;
  rankKey: string;
  name: string;
  coins: number;
  extras: BoxExtra[];
  imageUrl: string | null;
  isActive: boolean;
}

interface AuditRow {
  id: string;
  actorKind: string;
  actorName: string;
  action: string;
  rankKey: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  targetName: string | null;
  targetUsername: string | null;
}

interface ClaimLog {
  id: string;
  rankKey: string;
  date: string;
  coins: number;
  createdAt: string;
  displayName: string;
  username: string;
}

interface Overview {
  ranks: AdminRank[];
  boxes: AdminBox[];
  claimsToday: number;
  coinsToday: number;
  audit: AuditRow[];
  claims: ClaimLog[];
}

interface HolderRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  rank_key: string;
  rank_name: string;
  rank_color: string;
  granted_at: string;
  expires_at: string | null;
  note: string | null;
}

interface SearchedUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface CosmeticOption {
  id: string;
  name: string;
  category: string;
}

const PERMISSION_OPTIONS: { key: string; label: string }[] = [
  { key: '*', label: 'جميع الصلاحيات (سوبر أدمن)' },
  { key: 'manage_ranks', label: 'إدارة الرتب (منح وسحب)' },
  { key: 'manage_boxes', label: 'إدارة البوكسات اليومية' },
  { key: 'manage_users', label: 'إدارة المستخدمين' },
  { key: 'manage_rooms', label: 'إدارة الغرف' },
  { key: 'manage_events', label: 'إدارة الفعاليات' },
  { key: 'manage_balances', label: 'إدارة الأرصدة' },
  { key: 'system_settings', label: 'إعدادات النظام' },
  { key: 'support_tickets', label: 'طلبات الدعم والشكاوى' },
  { key: 'view_users', label: 'عرض المستخدمين' },
  { key: 'view_recharge_orders', label: 'عرض طلبات الشحن' },
  { key: 'agent_panel', label: 'لوحة الوكيل' },
];

const ACTION_LABELS: Record<string, string> = {
  grant: 'منح رتبة',
  revoke: 'سحب رتبة',
  create: 'إنشاء رتبة',
  update: 'تعديل رتبة',
  delete: 'حذف رتبة',
  claim: 'استلام بوكس',
  box_update: 'تعديل بوكس',
  box_delete: 'حذف بوكس',
};

const EMPTY_RANK = {
  id: '',
  key: '',
  nameAr: '',
  nameEn: '',
  kind: 'rank',
  tier: 1,
  power: 10,
  description: '',
  dailyCoins: 0,
  commissionPercent: 0,
  color: '#ffc107',
  badgeImageUrl: '',
  permissions: [] as string[],
  durationDays: 0,
  isActive: true,
  sortOrder: 0,
};

const EMPTY_BOX = {
  rankKey: '',
  name: '',
  coins: 0,
  extras: [] as BoxExtra[],
  isActive: true,
};

export default function RanksTab() {
  const toast = useToast();
  const overview = useAdminData<Overview>('/ranks/manage/overview');
  const cosmetics = useAdminData<{ frames: CosmeticOption[] }>('/admin/frames');
  const [form, setForm] = useState({ ...EMPTY_RANK });
  const [boxForm, setBoxForm] = useState({ ...EMPTY_BOX });
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<SearchedUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<SearchedUser | null>(null);
  const [grantRankKey, setGrantRankKey] = useState('');
  const [grantDays, setGrantDays] = useState('');
  const [grantNote, setGrantNote] = useState('');

  const [holderRank, setHolderRank] = useState('');
  const [holders, setHolders] = useState<HolderRow[]>([]);

  const ranks = overview.data?.ranks ?? [];
  const boxes = overview.data?.boxes ?? [];
  const cosmeticOptions = cosmetics.data?.frames ?? [];

  const reload = async () => {
    await Promise.all([overview.reload(), cosmetics.reload()]);
  };

  const loadHolders = async (rankKey: string) => {
    try {
      const response = await api<{ users: HolderRow[] }>(
        `/ranks/manage/users${rankKey ? `?rank=${encodeURIComponent(rankKey)}` : ''}`,
        { admin: true }
      );
      setHolders(response.users);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  useEffect(() => {
    void loadHolders(holderRank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holderRank]);

  const saveRank = async () => {
    setBusy(true);
    try {
      if (form.id) {
        await api(`/ranks/manage/ranks/${form.key}`, {
          method: 'PATCH',
          admin: true,
          body: form,
        });
        toast.push('تم تعديل الرتبة', 'success');
      } else {
        await api('/ranks/manage/ranks', { method: 'POST', admin: true, body: form });
        toast.push('تم إنشاء الرتبة', 'success');
      }
      setForm({ ...EMPTY_RANK });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const editRank = (rank: AdminRank) => {
    setForm({
      id: rank.id,
      key: rank.key,
      nameAr: rank.nameAr,
      nameEn: rank.nameEn,
      kind: rank.kind,
      tier: rank.tier,
      power: rank.power,
      description: rank.description,
      dailyCoins: rank.dailyCoins,
      commissionPercent: rank.commissionPercent,
      color: rank.color,
      badgeImageUrl: rank.badgeImageUrl ?? '',
      permissions: rank.permissions ?? [],
      durationDays: rank.durationDays,
      isActive: rank.isActive,
      sortOrder: rank.sortOrder,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleRank = async (rank: AdminRank) => {
    try {
      await api(`/ranks/manage/ranks/${rank.key}`, {
        method: 'PATCH',
        admin: true,
        body: { isActive: !rank.isActive },
      });
      toast.push(rank.isActive ? 'تم إيقاف الرتبة مؤقتاً' : 'تم تفعيل الرتبة', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const deleteRank = async (rank: AdminRank) => {
    if (!window.confirm(`حذف الرتبة «${rank.nameAr}» نهائياً؟`)) return;
    try {
      await api(`/ranks/manage/ranks/${rank.key}`, { method: 'DELETE', admin: true });
      toast.push('تم حذف الرتبة', 'success');
      if (form.key === rank.key) setForm({ ...EMPTY_RANK });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const uploadBadge = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    setUploading(true);
    try {
      const response = await api<{ url: string }>('/ranks/manage/upload', {
        method: 'POST',
        admin: true,
        form: body,
      });
      setForm((current) => ({ ...current, badgeImageUrl: response.url }));
      toast.push('تم رفع صورة الوسام', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const pickBox = (rankKey: string) => {
    const existing = boxes.find((box) => box.rankKey === rankKey);
    const rank = ranks.find((item) => item.key === rankKey);
    if (existing) {
      setBoxForm({
        rankKey,
        name: existing.name,
        coins: existing.coins,
        extras: existing.extras ?? [],
        isActive: existing.isActive,
      });
    } else {
      setBoxForm({
        rankKey,
        name: rank ? `بوكس ${rank.nameAr}` : '',
        coins: rank?.dailyCoins ?? 0,
        extras: [],
        isActive: true,
      });
    }
  };

  const saveBox = async () => {
    if (!boxForm.rankKey) {
      toast.push('اختر الرتبة أولاً', 'error');
      return;
    }
    setBusy(true);
    try {
      await api('/ranks/manage/boxes', { method: 'POST', admin: true, body: boxForm });
      toast.push('تم حفظ البوكس', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteBox = async (box: AdminBox) => {
    if (!window.confirm('حذف هذا البوكس؟')) return;
    try {
      await api(`/ranks/manage/boxes/${box.id}`, { method: 'DELETE', admin: true });
      toast.push('تم حذف البوكس', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const searchUsers = async () => {
    try {
      const response = await api<{ users: SearchedUser[] }>(
        `/admin/users?q=${encodeURIComponent(userQuery.trim())}`,
        { admin: true }
      );
      setUserResults(response.users.slice(0, 8));
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const grant = async () => {
    if (!selectedUser || !grantRankKey) {
      toast.push('اختر المستخدم والرتبة', 'error');
      return;
    }
    setBusy(true);
    try {
      await api('/ranks/manage/grant', {
        method: 'POST',
        admin: true,
        body: {
          userId: selectedUser.id,
          rankKey: grantRankKey,
          durationDays: grantDays ? Number(grantDays) : undefined,
          note: grantNote || undefined,
        },
      });
      toast.push('تم منح الرتبة', 'success');
      setGrantNote('');
      await reload();
      await loadHolders(holderRank);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!selectedUser) {
      toast.push('اختر المستخدم أولاً', 'error');
      return;
    }
    if (!window.confirm(`سحب الرتبة من ${selectedUser.display_name}؟`)) return;
    setBusy(true);
    try {
      await api('/ranks/manage/revoke', {
        method: 'POST',
        admin: true,
        body: { userId: selectedUser.id, reason: grantNote || undefined },
      });
      toast.push('تم سحب الرتبة', 'success');
      await reload();
      await loadHolders(holderRank);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const addCoinsExtra = () =>
    setBoxForm((current) => ({ ...current, extras: [...current.extras, { type: 'coins', amount: 10000 }] }));
  const addCosmeticExtra = () =>
    setBoxForm((current) => ({
      ...current,
      extras: [...current.extras, { type: 'cosmetic', itemId: cosmeticOptions[0]?.id ?? '' }],
    }));
  const updateExtra = (index: number, patch: Partial<BoxExtra>) =>
    setBoxForm((current) => ({
      ...current,
      extras: current.extras.map((extra, i) => (i === index ? { ...extra, ...patch } : extra)),
    }));
  const removeExtra = (index: number) =>
    setBoxForm((current) => ({
      ...current,
      extras: current.extras.filter((_, i) => i !== index),
    }));

  return (
    <div className="stack">
      <div className="grid-4">
        <Stat label="الرتب والمناصب" value={ranks.length} />
        <Stat label="حاملو الرتب" value={ranks.reduce((sum, rank) => sum + (rank.holders ?? 0), 0)} />
        <Stat label="بوكسات اليوم" value={overview.data?.claimsToday ?? 0} />
        <Stat
          label="كونز وزّعتها البوكسات اليوم"
          value={formatCoins(overview.data?.coinsToday ?? 0)}
          accent="#ffd75e"
        />
      </div>

      <AdminCard
        title={form.id ? `تعديل رتبة: ${form.nameAr}` : 'إضافة رتبة أو منصب جديد'}
        subtitle="الرتب تُمنح يدوياً فقط، وكل تغيير يُسجَّل في السجل الإداري"
        actions={
          form.id ? (
            <button className="btn btn-ghost btn-xs" onClick={() => setForm({ ...EMPTY_RANK })}>
              إلغاء التعديل
            </button>
          ) : undefined
        }
      >
        <div className="grid-2">
          <Field label="اسم الرتبة (عربي)">
            <input
              className="input"
              value={form.nameAr}
              onChange={(event) => setForm({ ...form, nameAr: event.target.value })}
            />
          </Field>
          <Field label="الاسم الإنجليزي">
            <input
              className="input"
              dir="ltr"
              value={form.nameEn}
              onChange={(event) => setForm({ ...form, nameEn: event.target.value })}
            />
          </Field>
          <Field label="المفتاح" hint="حروف لاتينية صغيرة وأرقام فقط">
            <input
              className="input"
              dir="ltr"
              disabled={Boolean(form.id)}
              value={form.key}
              onChange={(event) => setForm({ ...form, key: event.target.value.toLowerCase() })}
            />
          </Field>
          <Field label="النوع">
            <select
              className="select"
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value })}
            >
              <option value="rank">رتبة أساسية</option>
              <option value="position">منصب إداري</option>
            </select>
          </Field>
          <Field label="المستوى (1-5)">
            <input
              className="input"
              type="number"
              min={1}
              max={5}
              dir="ltr"
              value={form.tier}
              onChange={(event) => setForm({ ...form, tier: Number(event.target.value) })}
            />
          </Field>
          <Field label="القوة الإدارية" hint="لا يمكن منح رتبة بقوة أعلى أو مساوية">
            <input
              className="input"
              type="number"
              min={0}
              max={1000}
              dir="ltr"
              value={form.power}
              onChange={(event) => setForm({ ...form, power: Number(event.target.value) })}
            />
          </Field>
          <Field label="المكافأة اليومية (كونز)">
            <input
              className="input"
              type="number"
              min={0}
              dir="ltr"
              value={form.dailyCoins}
              onChange={(event) => setForm({ ...form, dailyCoins: Number(event.target.value) })}
            />
          </Field>
          <Field label="نسبة العمولة للوكيل %">
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              dir="ltr"
              value={form.commissionPercent}
              onChange={(event) => setForm({ ...form, commissionPercent: Number(event.target.value) })}
            />
          </Field>
          <Field label="مدة الرتبة (أيام)" hint="0 = دائمة">
            <input
              className="input"
              type="number"
              min={0}
              dir="ltr"
              value={form.durationDays}
              onChange={(event) => setForm({ ...form, durationDays: Number(event.target.value) })}
            />
          </Field>
          <Field label="لون الوسام">
            <div className="inline">
              <input
                type="color"
                value={form.color}
                onChange={(event) => setForm({ ...form, color: event.target.value })}
                style={{ width: 44, height: 36, borderRadius: 10, border: '1px solid var(--line)' }}
              />
              <input
                className="input"
                dir="ltr"
                value={form.color}
                onChange={(event) => setForm({ ...form, color: event.target.value })}
              />
            </div>
          </Field>
          <Field label="صورة الوسام" hint="PNG أو GIF شفاف (اختياري)">
            <div className="inline">
              <label className="btn btn-ghost btn-xs">
                <Icon name="image" size={14} /> {uploading ? 'جارٍ الرفع…' : 'رفع صورة'}
                <input
                  type="file"
                  accept="image/png,image/webp,image/gif"
                  hidden
                  onChange={(event) => void uploadBadge(event)}
                />
              </label>
              {form.badgeImageUrl ? (
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => setForm({ ...form, badgeImageUrl: '' })}
                >
                  إزالة
                </button>
              ) : null}
            </div>
          </Field>
          <Field label="الوصف">
            <input
              className="input"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </Field>
        </div>

        <div className="field">
          <label>الصلاحيات</label>
          <div className="rank-perm-picker">
            {PERMISSION_OPTIONS.map((option) => {
              const checked = form.permissions.includes(option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`rank-perm-option ${checked ? 'on' : ''}`}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      permissions: checked
                        ? current.permissions.filter((item) => item !== option.key)
                        : [...current.permissions, option.key],
                    }))
                  }
                >
                  {checked ? '✓ ' : ''}
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="inline" style={{ justifyContent: 'space-between' }}>
          <Toggle
            checked={form.isActive}
            onChange={(value) => setForm({ ...form, isActive: value })}
            label="الرتبة مفعّلة"
          />
          <button className="btn btn-primary" disabled={busy} onClick={() => void saveRank()}>
            {busy ? <span className="spinner" /> : form.id ? 'حفظ التعديلات' : 'إنشاء الرتبة'}
          </button>
        </div>
      </AdminCard>

      <AdminCard title="الرتب والمناصب الحالية" subtitle="إيقاف رتبة مؤقتاً يخفي وسامها وبوكسها فوراً">
        {ranks.length ? (
          <Table head={['الرتبة', 'النوع', 'المكافأة اليومية', 'القوة', 'الحاصلون', 'الحالة', 'إجراءات']}>
            {ranks.map((rank) => (
              <tr key={rank.key}>
                <td>
                  <div className="inline" style={{ gap: 8 }}>
                    <RankBadge rank={rank} size={30} />
                    <div>
                      <div style={{ fontWeight: 700 }}>{rank.nameAr}</div>
                      <div className="tiny muted" dir="ltr">{rank.key}</div>
                    </div>
                  </div>
                </td>
                <td>{rank.kind === 'position' ? 'منصب' : 'رتبة'}</td>
                <td dir="ltr">{formatCoins(rank.dailyCoins)}</td>
                <td dir="ltr">{rank.power}</td>
                <td dir="ltr">{rank.holders ?? 0}</td>
                <td>
                  <span className={`pill ${rank.isActive ? 'pill-green' : 'pill-pink'}`}>
                    {rank.isActive ? 'مفعّلة' : 'موقوفة'}
                  </span>
                </td>
                <td>
                  <div className="inline" style={{ gap: 6 }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => editRank(rank)}>
                      تعديل
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void toggleRank(rank)}>
                      {rank.isActive ? 'إيقاف' : 'تفعيل'}
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void deleteRank(rank)}>
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty text="لا توجد رتب بعد" />
        )}
      </AdminCard>

      <AdminCard title="محتوى البوكس اليومي" subtitle="البوكس هو مصدر المكافأة الفعلي، ويُحدَّث معه سعر الرتبة اليومي">
        <div className="grid-2">
          <Field label="الرتبة">
            <select
              className="select"
              value={boxForm.rankKey}
              onChange={(event) => pickBox(event.target.value)}
            >
              <option value="">— اختر الرتبة —</option>
              {ranks.map((rank) => (
                <option key={rank.key} value={rank.key}>
                  {rank.nameAr}
                </option>
              ))}
            </select>
          </Field>
          <Field label="اسم البوكس">
            <input
              className="input"
              value={boxForm.name}
              onChange={(event) => setBoxForm({ ...boxForm, name: event.target.value })}
            />
          </Field>
          <Field label="مكافأة الكونز اليومية">
            <input
              className="input"
              type="number"
              min={0}
              dir="ltr"
              value={boxForm.coins}
              onChange={(event) => setBoxForm({ ...boxForm, coins: Number(event.target.value) })}
            />
          </Field>
          <Field label="حالة البوكس">
            <Toggle
              checked={boxForm.isActive}
              onChange={(value) => setBoxForm({ ...boxForm, isActive: value })}
              label="البوكس متاح للاستلام"
            />
          </Field>
        </div>

        <div className="stack">
          <div className="section-head">
            <h2 style={{ fontSize: 14 }}>مكافآت إضافية داخل البوكس</h2>
            <div className="inline" style={{ gap: 6 }}>
              <button className="btn btn-ghost btn-xs" onClick={addCoinsExtra}>
                + كونز إضافية
              </button>
              <button className="btn btn-ghost btn-xs" onClick={addCosmeticExtra}>
                + عنصر تجميلي
              </button>
            </div>
          </div>
          {boxForm.extras.length ? (
            <div className="stack">
              {boxForm.extras.map((extra, index) => (
                <div key={index} className="inline" style={{ gap: 8 }}>
                  <span className="pill pill-gold">
                    {extra.type === 'coins' ? 'كونز' : 'تجميلي'}
                  </span>
                  {extra.type === 'coins' ? (
                    <input
                      className="input grow"
                      type="number"
                      min={1}
                      dir="ltr"
                      value={extra.amount ?? 0}
                      onChange={(event) => updateExtra(index, { amount: Number(event.target.value) })}
                    />
                  ) : (
                    <select
                      className="select grow"
                      value={extra.itemId ?? ''}
                      onChange={(event) => updateExtra(index, { itemId: event.target.value })}
                    >
                      {cosmeticOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} — {item.category}
                        </option>
                      ))}
                    </select>
                  )}
                  <button className="btn btn-ghost btn-xs" onClick={() => removeExtra(index)}>
                    حذف
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <span className="tiny muted">لا توجد مكافآت إضافية</span>
          )}
        </div>

        <div className="inline" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" disabled={busy} onClick={() => void saveBox()}>
            حفظ البوكس
          </button>
        </div>

        {boxes.length ? (
          <Table head={['الرتبة', 'البوكس', 'الكونز', 'مكافآت إضافية', 'الحالة', '']}>
            {boxes.map((box) => (
              <tr key={box.id}>
                <td>{ranks.find((rank) => rank.key === box.rankKey)?.nameAr ?? box.rankKey}</td>
                <td>{box.name}</td>
                <td dir="ltr">{formatCoins(box.coins)}</td>
                <td dir="ltr">{box.extras?.length ?? 0}</td>
                <td>
                  <span className={`pill ${box.isActive ? 'pill-green' : 'pill-pink'}`}>
                    {box.isActive ? 'متاح' : 'موقوف'}
                  </span>
                </td>
                <td>
                  <div className="inline" style={{ gap: 6 }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => pickBox(box.rankKey)}>
                      تعديل
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void deleteBox(box)}>
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        ) : null}
      </AdminCard>

      <AdminCard title="منح وسحب الرتب" subtitle="اختر مستخدماً ثم الرتبة. لا يمكن منح رتبة لنفسك، ولا تجاوز قوة حسابك">
        <div className="inline" style={{ gap: 8 }}>
          <input
            className="input grow"
            placeholder="ابحث بالاسم أو الآي دي أو الهاتف"
            value={userQuery}
            onChange={(event) => setUserQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void searchUsers();
            }}
          />
          <button className="btn btn-ghost" onClick={() => void searchUsers()}>
            بحث
          </button>
        </div>

        {userResults.length ? (
          <div className="list">
            {userResults.map((user) => (
              <div
                key={user.id}
                className={`row ${selectedUser?.id === user.id ? 'selected' : ''}`}
                onClick={() => setSelectedUser(user)}
              >
                <Avatar user={{ displayName: user.display_name, avatarUrl: user.avatar_url }} size={38} />
                <div className="row-main">
                  <div className="row-title">{user.display_name}</div>
                  <div className="row-sub">#{user.username}</div>
                </div>
                {selectedUser?.id === user.id ? <Icon name="check" size={17} /> : null}
              </div>
            ))}
          </div>
        ) : null}

        {selectedUser ? (
          <div className="inline" style={{ gap: 8 }}>
            <span className="pill pill-pink">
              المستخدم: {selectedUser.display_name} #{selectedUser.username}
            </span>
            <button className="btn btn-ghost btn-xs" onClick={() => setSelectedUser(null)}>
              تغيير
            </button>
          </div>
        ) : null}

        <div className="grid-2">
          <Field label="الرتبة / المنصب">
            <select
              className="select"
              value={grantRankKey}
              onChange={(event) => setGrantRankKey(event.target.value)}
            >
              <option value="">— اختر الرتبة —</option>
              {ranks
                .filter((rank) => rank.isActive)
                .map((rank) => (
                  <option key={rank.key} value={rank.key}>
                    {rank.nameAr} {rank.durationDays ? `(${rank.durationDays} يوم)` : ''}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="مدة المنح (أيام)" hint="اتركه فارغاً لاستخدام مدة الرتبة">
            <input
              className="input"
              type="number"
              min={0}
              dir="ltr"
              value={grantDays}
              onChange={(event) => setGrantDays(event.target.value)}
            />
          </Field>
          <Field label="ملاحظة">
            <input
              className="input"
              value={grantNote}
              onChange={(event) => setGrantNote(event.target.value)}
            />
          </Field>
        </div>
        <div className="inline" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" disabled={busy} onClick={() => void revoke()}>
            سحب الرتبة
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void grant()}>
            منح الرتبة
          </button>
        </div>
      </AdminCard>

      <AdminCard title="حاملو الرتب" subtitle="المستخدمون الحاصلون على كل رتبة ومدة صلاحيتها">
        <Field label="تصفية حسب الرتبة">
          <select className="select" value={holderRank} onChange={(event) => setHolderRank(event.target.value)}>
            <option value="">كل الرتب</option>
            {ranks.map((rank) => (
              <option key={rank.key} value={rank.key}>
                {rank.nameAr}
              </option>
            ))}
          </select>
        </Field>
        {holders.length ? (
          <Table head={['المستخدم', 'الرتبة', 'تاريخ المنح', 'ينتهي في', 'ملاحظة']}>
            {holders.map((holder) => (
              <tr key={`${holder.id}-${holder.rank_key}`}>
                <td>
                  <div className="inline" style={{ gap: 8 }}>
                    <Avatar
                      user={{ displayName: holder.display_name, avatarUrl: holder.avatar_url }}
                      size={30}
                    />
                    <div>
                      <div style={{ fontWeight: 700 }}>{holder.display_name}</div>
                      <div className="tiny muted" dir="ltr">#{holder.username}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span style={{ color: holder.rank_color, fontWeight: 700 }}>{holder.rank_name}</span>
                </td>
                <td dir="ltr">{new Date(holder.granted_at).toLocaleDateString('ar-IQ')}</td>
                <td dir="ltr">
                  {holder.expires_at ? new Date(holder.expires_at).toLocaleDateString('ar-IQ') : 'دائم'}
                </td>
                <td className="tiny muted">{holder.note ?? '—'}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty text="لا يوجد حاملون لهذه الرتبة" />
        )}
      </AdminCard>

      <AdminCard title="السجل الإداري" subtitle="كل منح وسحب وتعديل على الرتب والبوكسات">
        {overview.data?.audit.length ? (
          <Table head={['العملية', 'الرتبة', 'المستخدم', 'المنفّذ', 'التاريخ']}>
            {overview.data.audit.map((row) => (
              <tr key={row.id}>
                <td>{ACTION_LABELS[row.action] ?? row.action}</td>
                <td>{row.rankKey ?? '—'}</td>
                <td>
                  {row.targetName ? `${row.targetName} #${row.targetUsername ?? ''}` : '—'}
                </td>
                <td>
                  {row.actorName} <span className="tiny muted">({row.actorKind})</span>
                </td>
                <td dir="ltr">{new Date(row.createdAt).toLocaleString('ar-IQ')}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty text="لا توجد عمليات مسجلة بعد" />
        )}
      </AdminCard>

      <AdminCard title="سجل استلام المكافآت" subtitle="آخر عمليات استلام البوكسات اليومية">
        {overview.data?.claims.length ? (
          <Table head={['المستخدم', 'الرتبة', 'التاريخ', 'الكونز']}>
            {overview.data.claims.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.displayName} <span className="tiny muted" dir="ltr">#{row.username}</span>
                </td>
                <td>{ranks.find((rank) => rank.key === row.rankKey)?.nameAr ?? row.rankKey}</td>
                <td dir="ltr">{row.date}</td>
                <td dir="ltr">{formatCoins(row.coins)}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty text="لا يوجد استلام بعد" />
        )}
      </AdminCard>
    </div>
  );
}
