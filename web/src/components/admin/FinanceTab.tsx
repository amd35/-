import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Stat, Table, Toggle, adminError, useAdminData } from './shared';

interface FinanceSettings {
  beans_per_usd: number;
  bean_to_iqd_rate: number;
  withdrawal_fee_percent: number;
  min_withdrawal_beans: number;
  max_withdrawal_beans: number;
  gold_gifts_enabled: boolean;
  gift_recipient_percent: number;
  gift_host_percent: number;
  gift_admin_percent: number;
  withdrawal_methods: { id: string; label: string; labelEn: string; enabled: boolean; note: string }[];
}

interface SettingsResponse {
  settings: FinanceSettings;
}

interface OverviewResponse {
  totals: {
    diamonds: number;
    gold: number;
    beansAvailable: number;
    beansPending: number;
    beansWithdrawn: number;
    beansEarned: number;
    giftDiamonds: number;
    giftGold: number;
    pendingPayouts: number;
    paidPayouts: number;
  };
  byStatus: { status: string; count: number; net: number }[];
}

interface WithdrawalRow {
  id: string;
  user_name: string;
  user_username: string;
  coins: number;
  amount: number | string;
  net_amount: number | string;
  fee_amount: number | string;
  fee_percent: number | string;
  rate: number | string;
  currency: string;
  payment_method: string;
  payout_details: string;
  status: string;
  reject_reason: string | null;
  transfer_ref: string | null;
  proof_url: string | null;
  created_at: string;
}

interface StaffRow {
  id: string;
  username: string;
  displayName: string;
  role: string;
  isActive: boolean;
}

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

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'المدير العام',
  moderator: 'مشرف',
  accountant: 'محاسب',
};

export default function FinanceTab() {
  const toast = useToast();
  const settings = useAdminData<SettingsResponse>('/admin/settings');
  const overview = useAdminData<OverviewResponse>('/admin/finance/overview');
  const withdrawals = useAdminData<{ withdrawals: WithdrawalRow[] }>('/admin/withdrawals');
  const me = useAdminData<{ admin: { role: string } }>('/admin/me');
  const staff = useAdminData<{ staff: StaffRow[] }>('/admin/staff');
  const [form, setForm] = useState<FinanceSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [proofs, setProofs] = useState<Record<string, string>>({});
  const [newStaff, setNewStaff] = useState({ username: '', password: '', displayName: '', role: 'moderator' });

  const isSuper = me.data?.admin.role === 'superadmin';

  useEffect(() => {
    if (settings.data) setForm(settings.data.settings);
  }, [settings.data]);

  const set = <K extends keyof FinanceSettings>(key: K, value: FinanceSettings[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      await api('/admin/finance/settings', { method: 'PUT', admin: true, body: form });
      toast.push('تم حفظ الإعدادات المالية — تُطبَّق على الطلبات الجديدة', 'success');
      await settings.reload();
      await overview.reload();
    } catch (error) {
      toast.push(adminError(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (id: string, action: 'approve' | 'reject' | 'paid') => {
    try {
      if (action === 'reject') {
        const reason = (reasons[id] || '').trim();
        if (reason.length < 3) {
          toast.push('اكتب سبب الرفض أولاً', 'error');
          return;
        }
        await api(`/admin/withdrawals/${id}/reject`, { method: 'POST', admin: true, body: { reason } });
      } else if (action === 'paid') {
        const transferRef = (refs[id] || '').trim();
        if (transferRef.length < 3) {
          toast.push('أدخل رقم التحويل أولاً', 'error');
          return;
        }
        await api(`/admin/withdrawals/${id}/paid`, {
          method: 'POST',
          admin: true,
          body: { transferRef, proofUrl: (proofs[id] || '').trim() },
        });
      } else {
        await api(`/admin/withdrawals/${id}/approve`, { method: 'POST', admin: true, body: {} });
      }
      toast.push(
        action === 'approve'
          ? 'تمت الموافقة — بانتظار تنفيذ الدفع'
          : action === 'paid'
            ? 'تم تسجيل الدفع الفعلي'
            : 'تم رفض الطلب وإرجاع الفاصوليا',
        'success'
      );
      await withdrawals.reload();
      await overview.reload();
    } catch (error) {
      toast.push(adminError(error), 'error');
    }
  };

  const addMethod = () => {
    setForm((current) =>
      current
        ? {
            ...current,
            withdrawal_methods: [
              ...current.withdrawal_methods,
              { id: `method${current.withdrawal_methods.length + 1}`, label: '', labelEn: '', enabled: true, note: '' },
            ],
          }
        : current
    );
  };

  const updateMethod = (index: number, patch: Partial<FinanceSettings['withdrawal_methods'][number]>) => {
    setForm((current) => {
      if (!current) return current;
      const methods = current.withdrawal_methods.map((method, i) =>
        i === index ? { ...method, ...patch } : method
      );
      return { ...current, withdrawal_methods: methods };
    });
  };

  const removeMethod = (index: number) => {
    setForm((current) =>
      current
        ? { ...current, withdrawal_methods: current.withdrawal_methods.filter((_, i) => i !== index) }
        : current
    );
  };

  const createStaff = async () => {
    try {
      await api('/admin/staff', { method: 'POST', admin: true, body: newStaff });
      toast.push('تمت إضافة عضو الإدارة', 'success');
      setNewStaff({ username: '', password: '', displayName: '', role: 'moderator' });
      await staff.reload();
    } catch (error) {
      toast.push(adminError(error), 'error');
    }
  };

  const updateStaff = async (row: StaffRow, patch: Record<string, unknown>) => {
    try {
      await api(`/admin/staff/${row.id}`, { method: 'PATCH', admin: true, body: patch });
      toast.push('تم تحديث الصلاحيات', 'success');
      await staff.reload();
    } catch (error) {
      toast.push(adminError(error), 'error');
    }
  };

  const totals = overview.data?.totals;

  return (
    <div className="stack">
      <div className="stat-grid">
        <Stat label="رصيد الماس الكلي" value={formatCoins(totals?.diamonds ?? 0)} accent="#9fe3ff" />
        <Stat label="رصيد الذهب الكلي" value={formatCoins(totals?.gold ?? 0)} accent="#ffd75e" />
        <Stat label="فاصوليا متاحة" value={formatCoins(totals?.beansAvailable ?? 0)} accent="#86efac" />
        <Stat label="فاصوليا معلّقة (طلبات سحب)" value={formatCoins(totals?.beansPending ?? 0)} />
        <Stat label="إجمالي الفاصوليا الموزعة" value={formatCoins(totals?.beansEarned ?? 0)} />
        <Stat label="فاصوليا مسحوبة" value={formatCoins(totals?.beansWithdrawn ?? 0)} />
        <Stat label="طلبات سحب قيد المراجعة" value={totals?.pendingPayouts ?? 0} accent="#ffd75e" />
        <Stat label="صافي المدفوع (بالعملة)" value={formatCoins(totals?.paidPayouts ?? 0)} accent="#86efac" />
        <Stat label="إيراد الهدايا (ماس)" value={formatCoins(totals?.giftDiamonds ?? 0)} />
        <Stat label="إيراد الهدايا (ذهب)" value={formatCoins(totals?.giftGold ?? 0)} accent="#ffd75e" />
      </div>

      <AdminCard
        title="أسعار الصرف والعمولات والحدود"
        subtitle="سعر الفاصوليا مقابل الدولار والدينار، عمولة السحب، والحد الأدنى والأقصى — تُحفظ مع كل طلب جديد"
      >
        {!form ? (
          <div className="skeleton" style={{ height: 200 }} />
        ) : (
          <>
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
              <Field label="عدد الفاصوليا مقابل 1 دولار" hint="مثال: 1000 فاصوليا = 1 USD">
                <input
                  className="input"
                  type="number"
                  value={form.beans_per_usd}
                  onChange={(event) => set('beans_per_usd', Number(event.target.value))}
                  dir="ltr"
                />
              </Field>
              <Field label="سعر الفاصوليا بالدينار العراقي" hint="مثال: 1.5 يعني فاصوليا واحدة = 1.5 IQD">
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={form.bean_to_iqd_rate}
                  onChange={(event) => set('bean_to_iqd_rate', Number(event.target.value))}
                  dir="ltr"
                />
              </Field>
              <Field label="عمولة السحب (%)">
                <input
                  className="input"
                  type="number"
                  step="0.1"
                  value={form.withdrawal_fee_percent}
                  onChange={(event) => set('withdrawal_fee_percent', Number(event.target.value))}
                  dir="ltr"
                />
              </Field>
              <Field label="الحد الأدنى للسحب (فاصوليا)">
                <input
                  className="input"
                  type="number"
                  value={form.min_withdrawal_beans}
                  onChange={(event) => set('min_withdrawal_beans', Number(event.target.value))}
                  dir="ltr"
                />
              </Field>
              <Field label="الحد الأقصى للسحب (فاصوليا)">
                <input
                  className="input"
                  type="number"
                  value={form.max_withdrawal_beans}
                  onChange={(event) => set('max_withdrawal_beans', Number(event.target.value))}
                  dir="ltr"
                />
              </Field>
              <Field
                label="حصة مستلم الهدية (%)"
                hint={`مالك الغرفة ${form.gift_host_percent}% — الإدارة ${form.gift_admin_percent}%`}
              >
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={form.gift_recipient_percent}
                  onChange={(event) => set('gift_recipient_percent', Number(event.target.value))}
                  dir="ltr"
                />
              </Field>
              <Field label="حصة مالك الغرفة (%)" hint="تُطبَّق على هدايا الغرف فقط">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  value={form.gift_host_percent}
                  onChange={(event) => set('gift_host_percent', Number(event.target.value))}
                  dir="ltr"
                />
              </Field>
            </div>
            <Toggle
              checked={form.gold_gifts_enabled}
              onChange={(value) => set('gold_gifts_enabled', value)}
              label="السماح بدفع الهدايا بالذهب (إيقافه يخصص الذهب للألعاب فقط)"
            />
          </>
        )}
      </AdminCard>

      <AdminCard
        title="وسائل الدفع للسحب"
        subtitle="تظهر للمستخدم داخل شاشة السحب — يمكن تعطيل أي وسيلة دون حذفها"
        actions={
          <button className="btn btn-ghost btn-sm" onClick={addMethod}>
            + وسيلة
          </button>
        }
      >
        {!form ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : (
          <div className="stack">
            {form.withdrawal_methods.map((method, index) => (
              <div key={index} className="row static" style={{ alignItems: 'flex-start', gap: 8 }}>
                <div className="row-main" style={{ display: 'grid', gap: 6 }}>
                  <div className="inline" style={{ gap: 6 }}>
                    <input
                      className="input"
                      value={method.id}
                      onChange={(event) => updateMethod(index, { id: event.target.value })}
                      dir="ltr"
                      placeholder="id"
                      style={{ maxWidth: 110 }}
                    />
                    <input
                      className="input"
                      value={method.label}
                      onChange={(event) => updateMethod(index, { label: event.target.value })}
                      placeholder="الاسم بالعربية"
                    />
                    <input
                      className="input"
                      value={method.labelEn}
                      onChange={(event) => updateMethod(index, { labelEn: event.target.value })}
                      placeholder="English name"
                      dir="ltr"
                    />
                  </div>
                  <input
                    className="input"
                    value={method.note}
                    onChange={(event) => updateMethod(index, { note: event.target.value })}
                    placeholder="ملاحظة تظهر للمستخدم"
                  />
                </div>
                <div className="row-meta">
                  <button
                    className={`btn btn-xs ${method.enabled ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => updateMethod(index, { enabled: !method.enabled })}
                  >
                    {method.enabled ? 'مفعّلة' : 'معطّلة'}
                  </button>
                  <button className="btn btn-danger btn-xs" onClick={() => removeMethod(index)}>
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => void save()} disabled={busy}>
          حفظ الإعدادات المالية
        </button>
      </AdminCard>

      <AdminCard
        title="طلبات السحب"
        subtitle="لا يُعتبر المبلغ مدفوعاً إلا بعد تسجيل رقم التحويل وإثبات الدفع"
      >
        {(withdrawals.data?.withdrawals.length ?? 0) === 0 ? (
          <Empty text="لا توجد طلبات سحب" />
        ) : (
          <Table head={['الوقت', 'المستخدم', 'الفاصوليا', 'المبلغ / العمولة / الصافي', 'الوسيلة', 'الحالة', 'إجراءات']}>
            {withdrawals.data?.withdrawals.map((row) => {
              const net = Number(row.net_amount || row.amount);
              const fee = Number(row.fee_amount || 0);
              return (
                <tr key={row.id}>
                  <td className="tiny">{new Date(row.created_at).toLocaleString('ar-IQ')}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{row.user_name}</div>
                    <div className="tiny muted">#{row.user_username}</div>
                  </td>
                  <td className="amount">{formatCoins(row.coins)}</td>
                  <td>
                    <div className="amount">
                      {formatCoins(Number(row.amount))} {row.currency}
                    </div>
                    <div className="tiny muted">
                      عمولة {formatCoins(fee)} ({Number(row.fee_percent)}%) · صافي{' '}
                      <b style={{ color: '#86efac' }}>
                        {formatCoins(net)} {row.currency}
                      </b>
                    </div>
                    <div className="tiny muted" dir="ltr">
                      1 {row.currency} = {Number(row.rate)} {row.currency === 'USD' ? 'beans' : 'IQD/bean'}
                    </div>
                  </td>
                  <td className="tiny">
                    {row.payment_method}
                    {row.payout_details ? (
                      <div className="tiny muted" dir="ltr" style={{ maxWidth: 160, whiteSpace: 'normal' }}>
                        {row.payout_details}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <span className={`pill ${STATUS_CLASS[row.status] ?? 'pill-gold'}`} style={{ fontSize: 10 }}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                    {row.reject_reason ? <div className="tiny" style={{ color: '#fca5a5' }}>{row.reject_reason}</div> : null}
                    {row.transfer_ref ? (
                      <div className="tiny muted" dir="ltr">
                        Ref: {row.transfer_ref}
                      </div>
                    ) : null}
                    {row.proof_url ? (
                      <a className="tiny" href={row.proof_url} target="_blank" rel="noreferrer">
                        إثبات الدفع
                      </a>
                    ) : null}
                  </td>
                  <td>
                    {row.status === 'pending' ? (
                      <div className="stack" style={{ gap: 6, minWidth: 180 }}>
                        <input
                          className="input"
                          placeholder="سبب الرفض (إن وجد)"
                          value={reasons[row.id] ?? ''}
                          onChange={(event) => setReasons({ ...reasons, [row.id]: event.target.value })}
                        />
                        <div className="inline" style={{ gap: 6 }}>
                          <button className="btn btn-primary btn-xs" onClick={() => void decide(row.id, 'approve')}>
                            موافقة
                          </button>
                          <button className="btn btn-danger btn-xs" onClick={() => void decide(row.id, 'reject')}>
                            رفض
                          </button>
                        </div>
                      </div>
                    ) : row.status === 'approved' ? (
                      <div className="stack" style={{ gap: 6, minWidth: 200 }}>
                        <input
                          className="input"
                          placeholder="رقم التحويل"
                          value={refs[row.id] ?? ''}
                          onChange={(event) => setRefs({ ...refs, [row.id]: event.target.value })}
                          dir="ltr"
                        />
                        <input
                          className="input"
                          placeholder="رابط إثبات الدفع (اختياري)"
                          value={proofs[row.id] ?? ''}
                          onChange={(event) => setProofs({ ...proofs, [row.id]: event.target.value })}
                          dir="ltr"
                        />
                        <button className="btn btn-primary btn-xs" onClick={() => void decide(row.id, 'paid')}>
                          تم الدفع
                        </button>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </AdminCard>

      {isSuper ? (
        <AdminCard title="فريق الإدارة والصلاحيات" subtitle="المدير العام: كل شيء · المحاسب: المال والسحوبات · المشرف: التشغيل بدون مال">
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
            <Field label="اسم المستخدم">
              <input
                className="input"
                value={newStaff.username}
                onChange={(event) => setNewStaff({ ...newStaff, username: event.target.value })}
                dir="ltr"
              />
            </Field>
            <Field label="الاسم الظاهر">
              <input
                className="input"
                value={newStaff.displayName}
                onChange={(event) => setNewStaff({ ...newStaff, displayName: event.target.value })}
              />
            </Field>
            <Field label="كلمة المرور">
              <input
                className="input"
                type="password"
                value={newStaff.password}
                onChange={(event) => setNewStaff({ ...newStaff, password: event.target.value })}
                dir="ltr"
              />
            </Field>
            <Field label="الصلاحية">
              <select
                className="select"
                value={newStaff.role}
                onChange={(event) => setNewStaff({ ...newStaff, role: event.target.value })}
              >
                <option value="moderator">مشرف</option>
                <option value="accountant">محاسب</option>
                <option value="superadmin">مدير عام</option>
              </select>
            </Field>
          </div>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => void createStaff()}>
            إضافة عضو
          </button>
          {(staff.data?.staff.length ?? 0) === 0 ? (
            <Empty text="لا يوجد أعضاء" />
          ) : (
            <Table head={['المستخدم', 'الصلاحية', 'الحالة', 'إجراءات']}>
              {staff.data?.staff.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{row.displayName}</div>
                    <div className="tiny muted">#{row.username}</div>
                  </td>
                  <td>
                    <select
                      className="select"
                      value={row.role}
                      onChange={(event) => void updateStaff(row, { role: event.target.value })}
                    >
                      <option value="superadmin">مدير عام</option>
                      <option value="accountant">محاسب</option>
                      <option value="moderator">مشرف</option>
                    </select>
                  </td>
                  <td>
                    <span className={`pill ${row.isActive ? 'pill-green' : 'pill-red'}`} style={{ fontSize: 10 }}>
                      {row.isActive ? 'نشط' : 'موقوف'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn btn-xs ${row.isActive ? 'btn-danger' : 'btn-primary'}`}
                      onClick={() => void updateStaff(row, { isActive: !row.isActive })}
                    >
                      {row.isActive ? 'إيقاف' : 'تفعيل'}
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </AdminCard>
      ) : null}
    </div>
  );
}
