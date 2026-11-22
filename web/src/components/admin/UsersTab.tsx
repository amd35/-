import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatCoins, Sheet, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Table } from './shared';

interface AdminUser {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  is_banned: boolean;
  ban_reason: string | null;
  balance: number;
  earned: number;
  calls_count: number;
  earnings_total: number;
  free_used_today: number;
  online: boolean;
  created_at: string;
}

export default function UsersTab() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [idTarget, setIdTarget] = useState<AdminUser | null>(null);
  const [code, setCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<{ users: AdminUser[] }>(
        `/admin/users?q=${encodeURIComponent(query)}&status=${status}`,
        { admin: true }
      );
      setUsers(response.users);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [query, status, toast]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 300);
    return () => clearTimeout(timer);
  }, [load]);

  const toggleBan = async (user: AdminUser) => {
    try {
      await api(`/admin/users/${user.id}/${user.is_banned ? 'unban' : 'ban'}`, {
        method: 'POST',
        admin: true,
        body: user.is_banned ? {} : { reason: 'مخالفة السياسات' },
      });
      await load();
      toast.push(user.is_banned ? 'تم رفع الحظر' : 'تم الحظر', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  // Sends the user their own 6-digit account ID as an in-app notification.
  const sendId = async (user: AdminUser) => {
    try {
      const response = await api<{ code: string }>(`/admin/users/${user.id}/send-id`, {
        method: 'POST',
        admin: true,
        body: {},
      });
      toast.push(`تم إرسال الآي دي ${response.code} إلى ${user.display_name}`, 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  // Admin types any account ID and applies it to the user.
  const saveId = async () => {
    if (!idTarget) return;
    try {
      const response = await api<{ code: string }>(`/admin/users/${idTarget.id}/set-id`, {
        method: 'POST',
        admin: true,
        body: { code: code.trim() },
      });
      toast.push(`تم تعيين الآي دي ${response.code} إلى ${idTarget.display_name}`, 'success');
      setIdTarget(null);
      setCode('');
      await load();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const adjustCoins = async () => {
    if (!selected) return;
    try {
      await api(`/admin/users/${selected.id}/coins`, {
        method: 'POST',
        admin: true,
        body: { amount: Number(amount), note },
      });
      toast.push('تم تحديث الرصيد', 'success');
      setSelected(null);
      setAmount('');
      setNote('');
      await load();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <AdminCard
      title="المستخدمون"
      subtitle={`${users.length} حساب`}
      actions={
        <div className="inline">
          <input
            className="input"
            style={{ width: 220, padding: '8px 12px' }}
            placeholder="ابحث بالاسم أو البريد أو الهاتف أو المعرّف…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select className="select" style={{ width: 120 }} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">الكل</option>
            <option value="active">نشط</option>
            <option value="banned">محظور</option>
          </select>
        </div>
      }
    >
      {loading ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : users.length === 0 ? (
        <Empty text="لا يوجد مستخدمون" />
      ) : (
        <Table head={['المستخدم', 'وسيلة التواصل', 'الرصيد', 'الأرباح', 'المكالمات', 'المجاني اليوم', 'الحالة', 'إجراءات']}>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                <div style={{ fontWeight: 600 }}>{user.display_name}</div>
                <div className="tiny muted">#{user.username}</div>
              </td>
              <td className="tiny" dir="ltr">
                {user.email || user.phone || '—'}
              </td>
              <td className="amount">{formatCoins(user.balance)}</td>
              <td className="amount plus">{formatCoins(user.earnings_total)}</td>
              <td>{user.calls_count}</td>
              <td>{user.free_used_today}</td>
              <td>
                {user.is_banned ? (
                  <span className="pill pill-red">محظور</span>
                ) : user.online ? (
                  <span className="pill pill-green">متصل</span>
                ) : (
                  <span className="pill">غير متصل</span>
                )}
              </td>
              <td>
                <div className="inline">
                  <button className="btn btn-ghost btn-xs" onClick={() => setSelected(user)}>
                    كونز
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => void sendId(user)}>
                    إرسال الآي دي
                  </button>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setIdTarget(user);
                      setCode(user.username);
                    }}
                  >
                    تعديل الآي دي
                  </button>
                  <button
                    className={`btn btn-xs ${user.is_banned ? 'btn-outline' : 'btn-danger'}`}
                    onClick={() => void toggleBan(user)}
                  >
                    {user.is_banned ? 'رفع الحظر' : 'حظر'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Sheet open={Boolean(selected)} onClose={() => setSelected(null)} title={`تعديل الكونز — ${selected?.display_name ?? ''}`}>
        <div className="stack">
          <Field label="المبلغ (سالب للخصم)" hint="كل تعديل يُسجَّل في سجل المحفظة">
            <input
              className="input"
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="500"
              dir="ltr"
            />
          </Field>
          <Field label="ملاحظة">
            <input className="input" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <button className="btn btn-primary btn-block" onClick={() => void adjustCoins()}>
            تطبيق
          </button>
        </div>
      </Sheet>

      <Sheet
        open={Boolean(idTarget)}
        onClose={() => setIdTarget(null)}
        title={`تعيين الآي دي — ${idTarget?.display_name ?? ''}`}
      >
        <div className="stack">
          <Field label="الآي دي الجديد" hint="أرقام فقط — اكتب أي آي دي تريده">
            <input
              className="input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              dir="ltr"
              inputMode="numeric"
            />
          </Field>
          <button className="btn btn-primary btn-block" onClick={() => void saveId()}>
            حفظ الآي دي
          </button>
        </div>
      </Sheet>
    </AdminCard>
  );
}
