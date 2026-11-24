import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Avatar, useToast } from '../../lib/ui';
import { AdminCard, AdminLoading, Empty, Field, Table, adminError, useAdminData } from './shared';
import { LevelBadge } from '../ProgressionBadges';

interface GrantUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  level_granted: number | null;
  xp: string | number;
  badge_image_url: string | null;
}

interface GrantLogRow {
  id: string;
  action: 'grant' | 'revoke';
  previous_level: number;
  new_level: number;
  reason: string | null;
  created_at: string;
  admin_name: string;
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

const LEVELS = Array.from({ length: 100 }, (_, index) => index + 1);

/** Admin: grant, change or revoke a user's level (1..100) and read the audit log. */
export default function LevelGrantsTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ entries: GrantLogRow[] }>('/admin/level-grants/log');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<GrantUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [level, setLevel] = useState(10);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const search = useCallback(
    async (term: string) => {
      if (!term.trim()) {
        setUsers([]);
        return;
      }
      setSearching(true);
      try {
        const response = await api<{ users: GrantUser[] }>(
          `/admin/level-grants/search?q=${encodeURIComponent(term.trim())}`,
          { admin: true }
        );
        setUsers(response.users);
      } catch (error) {
        toast.push(adminError(error), 'error');
      } finally {
        setSearching(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    const timer = setTimeout(() => void search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
    );

  const grant = async () => {
    if (!selected.length) {
      toast.push('اختر مستخدماً واحداً على الأقل', 'error');
      return;
    }
    setBusy(true);
    try {
      const response = await api<{ updated: number }>('/admin/level-grants/grant', {
        method: 'POST',
        admin: true,
        body: { userIds: selected, level, reason },
      });
      toast.push(`تم منح المستوى ${level} إلى ${response.updated} مستخدم`, 'success');
      setReason('');
      setSelected([]);
      await Promise.all([search(query), reload()]);
    } catch (error) {
      toast.push(adminError(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!selected.length) {
      toast.push('اختر مستخدماً واحداً على الأقل', 'error');
      return;
    }
    if (!window.confirm(`إزالة المستوى الممنوح عن ${selected.length} مستخدم وإرجاع مستواهم السابق؟`)) return;
    setBusy(true);
    try {
      const response = await api<{ updated: number }>('/admin/level-grants/revoke', {
        method: 'POST',
        admin: true,
        body: { userIds: selected, reason },
      });
      toast.push(`تمت إزالة المستوى الممنوح عن ${response.updated} مستخدم`, 'success');
      setReason('');
      setSelected([]);
      await Promise.all([search(query), reload()]);
    } catch (error) {
      toast.push(adminError(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <AdminCard
        title="منح مستوى لمستخدم"
        subtitle="المستوى الممنوح يتجاوز نظام الخبرة ويبقى حتى يتم سحبه من هنا"
      >
        <div className="grid-2">
          <Field label="المستوى (1–100)">
            <select value={level} onChange={(event) => setLevel(Number(event.target.value))}>
              {LEVELS.map((value) => (
                <option key={value} value={value}>
                  المستوى {value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="سبب المنح (اختياري)">
            <input
              value={reason}
              maxLength={200}
              onChange={(event) => setReason(event.target.value)}
              placeholder="مثال: تكريم في مسابقة الغرف"
            />
          </Field>
        </div>
        <div className="inline" style={{ gap: 12, alignItems: 'center' }}>
          <LevelBadge level={level} size={56} />
          <span className="tiny muted">معاينة بطاقة المستوى {level}</span>
        </div>
        <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" disabled={busy || !selected.length} onClick={() => void grant()}>
            {busy ? 'جارٍ التنفيذ…' : `منح المستوى ${level} (${selected.length})`}
          </button>
          <button className="btn btn-outline" disabled={busy || !selected.length} onClick={() => void revoke()}>
            إزالة المستوى الممنوح
          </button>
        </div>
      </AdminCard>

      <AdminCard title="البحث عن المستخدمين" subtitle="بالاسم أو رقم الآي دي أو البريد الإلكتروني">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="اكتب اسم المستخدم أو رقم ID"
        />
        {searching ? <AdminLoading label="جارٍ البحث…" /> : null}
        {!searching && query.trim() && users.length === 0 ? <Empty text="لا يوجد مستخدم مطابق" /> : null}
        <div className="stack" style={{ gap: 8 }}>
          {users.map((user) => (
            <label key={user.id} className="row">
              <input
                type="checkbox"
                checked={selected.includes(user.id)}
                onChange={() => toggle(user.id)}
              />
              <Avatar
                user={{ displayName: user.display_name, avatarUrl: user.avatar_url }}
                size={40}
              />
              <div className="row-main">
                <div className="row-title">{user.display_name}</div>
                <div className="row-sub">
                  ID {user.username} • {Number(user.xp)} XP
                  {user.level_granted !== null ? ' • مستوى ممنوح' : ''}
                </div>
              </div>
              <div className="inline" style={{ gap: 6 }}>
                <LevelBadge level={user.level} size={26} imageUrl={user.badge_image_url} />
                <span className="tiny muted">Lv {user.level}</span>
              </div>
            </label>
          ))}
        </div>
      </AdminCard>

      <AdminCard title="سجل منح وتعديل المستويات" subtitle="من نفّذ العملية ومتى وبأي سبب">
        {loading ? <AdminLoading /> : null}
        {data && data.entries.length > 0 ? (
          <Table head={['المستخدم', 'العملية', 'قبل', 'بعد', 'الأدمن', 'السبب', 'التاريخ']}>
            {data.entries.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.display_name} <span className="tiny muted">#{row.username}</span>
                </td>
                <td>{row.action === 'grant' ? 'منح / تعديل' : 'إزالة'}</td>
                <td>{row.previous_level}</td>
                <td>{row.new_level}</td>
                <td>{row.admin_name}</td>
                <td>{row.reason || '—'}</td>
                <td className="tiny muted">{new Date(row.created_at).toLocaleString('ar-IQ')}</td>
              </tr>
            ))}
          </Table>
        ) : null}
        {!loading && data && data.entries.length === 0 ? <Empty text="لا توجد عمليات مسجلة بعد" /> : null}
      </AdminCard>
    </div>
  );
}
