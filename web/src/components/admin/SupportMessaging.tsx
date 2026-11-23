import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { Icon, Spinner, formatTimeAgo, useToast } from '../../lib/ui';
import { AdminCard, Field, Table } from './shared';

const CATEGORIES = [
  { id: 'update', label: 'تحديث التطبيق' },
  { id: 'feature', label: 'ميزات وإضافات جديدة' },
  { id: 'announcement', label: 'إعلان رسمي' },
  { id: 'maintenance', label: 'صيانة وتوقف مؤقت' },
  { id: 'contest', label: 'مسابقة أو فعالية' },
  { id: 'gift', label: 'هدية أو مكافأة' },
] as const;

const ACTION_LABELS: Record<string, string> = {
  ticket_created: 'فتح بلاغ',
  reply: 'رد على مستخدم',
  broadcast: 'إرسال إعلان عام',
  close: 'إغلاق بلاغ',
  open: 'إعادة فتح بلاغ',
  reopen: 'إعادة فتح تلقائي (رسالة جديدة)',
};

interface UploadResult {
  url: string;
  name: string;
  mediaType: 'image' | 'video' | 'audio';
}

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Broadcasts, individual messages and the support audit trail. */
export default function SupportMessaging() {
  const toast = useToast();
  const [category, setCategory] = useState<string>('announcement');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [image, setImage] = useState<UploadResult | null>(null);
  const [sending, setSending] = useState(false);
  const imageRef = useRef<HTMLInputElement | null>(null);

  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<AdminUser[]>([]);
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [direct, setDirect] = useState('');
  const [directBusy, setDirectBusy] = useState(false);

  useEffect(() => {
    if (!search.trim()) {
      setPeople([]);
      return;
    }
    const timer = setTimeout(() => {
      api<{ users: AdminUser[] }>(`/admin/support/users?q=${encodeURIComponent(search.trim())}`, {
        admin: true,
      })
        .then((response) => setPeople(response.users))
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const uploadImage = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    try {
      const response = await api<UploadResult>('/admin/support/upload', {
        method: 'POST',
        admin: true,
        form,
      });
      setImage(response);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const sendBroadcast = async () => {
    if (!title.trim()) {
      toast.push('اكتب عنوان الإعلان', 'error');
      return;
    }
    setSending(true);
    try {
      const response = await api<{ sent: number }>('/admin/support/broadcast', {
        method: 'POST',
        admin: true,
        body: {
          category,
          title,
          body,
          link: link.trim() || null,
          imageUrl: image?.url ?? null,
        },
      });
      toast.push(`أُرسل الإعلان إلى ${response.sent} مستخدم`, 'success');
      setTitle('');
      setBody('');
      setLink('');
      setImage(null);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const sendDirect = async () => {
    if (!target || !direct.trim()) {
      toast.push('اختر مستخدماً واكتب الرسالة', 'error');
      return;
    }
    setDirectBusy(true);
    try {
      await api('/admin/support/message', {
        method: 'POST',
        admin: true,
        body: { userId: target.id, body: direct },
      });
      toast.push(`أُرسلت الرسالة إلى ${target.displayName}`, 'success');
      setDirect('');
      setTarget(null);
      setSearch('');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setDirectBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <AdminCard title="إعلان أو تحديث لكل المستخدمين" subtitle="يظهر كإشعار فوري في مركز الإشعارات">
        <div className="stack" style={{ maxWidth: 640 }}>
          <div className="inline" style={{ gap: 10, flexWrap: 'wrap' }}>
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`chip ${category === item.id ? 'chip-on' : ''}`}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <Field label="العنوان">
            <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="النص">
            <textarea
              className="textarea"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
            />
          </Field>
          <Field label="رابط يفتح عند الضغط (اختياري)">
            <input
              className="input"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="/ads أو /levels أو /wallet"
              dir="ltr"
            />
          </Field>
          <div className="inline" style={{ gap: 10 }}>
            <input
              ref={imageRef}
              type="file"
              hidden
              accept="image/*,video/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(file);
                event.target.value = '';
              }}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => imageRef.current?.click()}>
              <Icon name="image" size={16} /> إرفاق صورة أو فيديو
            </button>
            {image ? (
              <span className="pill">
                {image.name}
                <button type="button" className="icon-btn plain" onClick={() => setImage(null)}>
                  ×
                </button>
              </span>
            ) : null}
          </div>
          <button
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => void sendBroadcast()}
            disabled={sending}
          >
            {sending ? <span className="spinner" /> : 'إرسال لكل المستخدمين'}
          </button>
        </div>
      </AdminCard>

      <AdminCard title="رسالة لمستخدم محدد" subtitle="تفتح محادثة الدعم الخاصة به وترسل الرد فوراً">
        <div className="stack" style={{ maxWidth: 640 }}>
          {target ? (
            <div className="inline" style={{ gap: 8 }}>
              <span className="pill pill-pink">
                {target.displayName} #{target.username}
              </span>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setTarget(null)}>
                تغيير
              </button>
            </div>
          ) : (
            <>
              <div className="search">
                <Icon name="search" size={16} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ابحث بالاسم أو رقم الـ ID"
                />
              </div>
              {people.length ? (
                <div className="list">
                  {people.map((person) => (
                    <div
                      key={person.id}
                      className="row"
                      onClick={() => {
                        setTarget(person);
                        setPeople([]);
                      }}
                    >
                      <div className="row-main">
                        <div className="row-title">{person.displayName}</div>
                        <div className="row-sub">#{person.username}</div>
                      </div>
                      <Icon name="chat" size={16} />
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          )}
          <textarea
            className="textarea"
            value={direct}
            onChange={(event) => setDirect(event.target.value)}
            placeholder="نص الرسالة الرسمية…"
            rows={3}
          />
          <button
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => void sendDirect()}
            disabled={directBusy || !target}
          >
            {directBusy ? <span className="spinner" /> : 'إرسال الرسالة'}
          </button>
        </div>
      </AdminCard>
    </div>
  );
}

interface SupportEvent {
  id: string;
  actor: string;
  action: string;
  detail: string | null;
  createdAt: string;
  userName: string | null;
  userUsername: string | null;
}

export function SupportLog() {
  const [events, setEvents] = useState<SupportEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<{ events: SupportEvent[] }>('/admin/support/events', { admin: true });
      setEvents(response.events);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminCard
      title="سجل عمليات الدعم الفني"
      subtitle="كل رد وإعلان وإغلاق أو فتح بلاغ"
      actions={
        <button className="btn btn-ghost btn-sm" onClick={() => void load()}>
          <Icon name="refresh" size={15} /> تحديث
        </button>
      }
    >
      {loading ? (
        <Spinner label="جارٍ التحميل…" />
      ) : events.length === 0 ? (
        <div className="tiny muted">لا توجد عمليات بعد.</div>
      ) : (
        <Table head={['العملية', 'المستخدم', 'التفاصيل', 'بواسطة', 'الوقت']}>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{ACTION_LABELS[event.action] ?? event.action}</td>
              <td>{event.userName ? `${event.userName} #${event.userUsername}` : '—'}</td>
              <td className="tiny muted">{event.detail || '—'}</td>
              <td>{event.actor}</td>
              <td className="tiny muted">{formatTimeAgo(event.createdAt, 'ar')}</td>
            </tr>
          ))}
        </Table>
      )}
    </AdminCard>
  );
}
