import { useCallback, useEffect, useState } from 'react';
import { api, assetUrl } from '../../lib/api';
import { formatTimeAgo, Icon, Sheet, useToast } from '../../lib/ui';
import { CategoryPill, type AnnouncementCategory } from '../announcements/AnnouncementCard';
import { AdminCard, Empty, Field, Stat, Table, Toggle, useAdminData } from './shared';

interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  category: string;
  mediaType: string;
  mediaUrl: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
  audience: string;
  status: string;
  isPinned: boolean;
  commentsEnabled: boolean;
  publishAt: string | null;
  publishedAt: string | null;
  createdByName: string;
  createdAt: string;
  stats: { recipients: number; reads: number; views: number; reactions: number; comments: number };
  targetCount: number;
}

interface DetailResponse {
  announcement: AdminAnnouncement;
  events: { id: string; action: string; detail: string; adminName: string; createdAt: string }[];
  comments: { id: string; body: string; createdAt: string; displayName: string; username: string }[];
  targets: { id: string; displayName: string; username: string }[];
  reactions: { emoji: string; count: number }[];
}

interface AdminUser {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

interface FormState {
  id: string | null;
  status: string;
  title: string;
  body: string;
  category: string;
  mediaType: 'none' | 'image' | 'video';
  mediaUrl: string;
  linkUrl: string;
  linkLabel: string;
  audience: 'all' | 'selected';
  userIds: string[];
  commentsEnabled: boolean;
  isPinned: boolean;
  scheduleAt: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  status: 'draft',
  title: '',
  body: '',
  category: 'official',
  mediaType: 'none',
  mediaUrl: '',
  linkUrl: '',
  linkLabel: '',
  audience: 'all',
  userIds: [],
  commentsEnabled: true,
  isPinned: false,
  scheduleAt: '',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'مسودة',
  scheduled: 'مجدول',
  published: 'منشور',
};

const ACTION_LABEL: Record<string, string> = {
  created: 'إنشاء',
  edited: 'تعديل',
  published: 'نشر',
  published_manually: 'نشر يدوي',
  published_scheduled: 'نشر مجدول',
  scheduled: 'جدولة',
  pinned: 'تثبيت',
  unpinned: 'إلغاء التثبيت',
};

function toForm(item: AdminAnnouncement): FormState {
  return {
    id: item.id,
    status: item.status,
    title: item.title,
    body: item.body,
    category: item.category,
    mediaType: (item.mediaType as FormState['mediaType']) || 'none',
    mediaUrl: item.mediaUrl ?? '',
    linkUrl: item.linkUrl ?? '',
    linkLabel: item.linkLabel ?? '',
    audience: item.audience === 'selected' ? 'selected' : 'all',
    userIds: [],
    commentsEnabled: item.commentsEnabled,
    isPinned: item.isPinned,
    scheduleAt: item.publishAt ? item.publishAt.slice(0, 16) : '',
  };
}

export default function AnnouncementsTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{
    categories: AnnouncementCategory[];
    pushConfigured: boolean;
    announcements: AdminAnnouncement[];
  }>('/admin/announcements');
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);

  const categories = data?.categories ?? [];
  const list = data?.announcements ?? [];

  useEffect(() => {
    if (!form || form.audience !== 'selected') return;
    const timer = setTimeout(() => {
      api<{ users: AdminUser[] }>(`/admin/users?q=${encodeURIComponent(userQuery)}`, { admin: true })
        .then((response) => setUsers(response.users))
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [form, userQuery]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current));

  const openNew = () => {
    setForm({ ...EMPTY_FORM });
    setPreview(false);
  };

  const openEdit = (item: AdminAnnouncement) => {
    setForm(toForm(item));
    setPreview(false);
    setUserQuery('');
    if (item.audience === 'selected') void loadTargets(item.id);
  };

  const loadTargets = async (id: string) => {
    try {
      const response = await api<DetailResponse>(`/admin/announcements/${id}`, { admin: true });
      setForm((current) =>
        current && current.id === id
          ? { ...current, userIds: response.targets.map((target) => target.id) }
          : current
      );
    } catch {
      /* targets are optional */
    }
  };

  const submit = async (action: 'draft' | 'publish' | 'schedule') => {
    if (!form) return;
    if (!form.title.trim()) {
      toast.push('العنوان مطلوب', 'error');
      return;
    }
    if (action === 'schedule' && !form.scheduleAt) {
      toast.push('حدد موعد النشر', 'error');
      return;
    }
    setBusy(true);
    try {
      const body = {
        title: form.title,
        body: form.body,
        category: form.category,
        mediaType: form.mediaType,
        mediaUrl: form.mediaType === 'none' ? null : form.mediaUrl,
        linkUrl: form.linkUrl || null,
        linkLabel: form.linkLabel || null,
        audience: form.audience,
        userIds: form.userIds,
        commentsEnabled: form.commentsEnabled,
        isPinned: form.isPinned,
        action,
        publishAt: action === 'schedule' ? new Date(form.scheduleAt).toISOString() : null,
      };
      const response = form.id
        ? await api<{ recipients: number }>(`/admin/announcements/${form.id}`, {
            method: 'PATCH',
            admin: true,
            body,
          })
        : await api<{ recipients: number }>('/admin/announcements', { method: 'POST', admin: true, body });
      toast.push(
        action === 'publish'
          ? `تم النشر إلى ${response.recipients ?? 0} مستخدم`
          : action === 'schedule'
            ? 'تم جدولة الإعلان'
            : 'تم حفظ الإعلان',
        'success'
      );
      setForm(null);
      setPreview(false);
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const uploadMedia = async (file: File) => {
    const body = new FormData();
    body.append('file', file);
    setBusy(true);
    try {
      const response = await api<{ url: string; mime: string }>('/admin/announcements/media', {
        method: 'POST',
        admin: true,
        form: body,
      });
      set('mediaUrl', response.url);
      set('mediaType', response.mime.startsWith('video') ? 'video' : 'image');
      toast.push('تم رفع الملف', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const publishNow = async (item: AdminAnnouncement) => {
    try {
      const response = await api<{ recipients: number }>(`/admin/announcements/${item.id}/publish`, {
        method: 'POST',
        admin: true,
      });
      toast.push(`تم النشر إلى ${response.recipients} مستخدم`, 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const togglePin = async (item: AdminAnnouncement) => {
    try {
      await api(`/admin/announcements/${item.id}/pin`, {
        method: 'POST',
        admin: true,
        body: { pinned: !item.isPinned },
      });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const remove = async (item: AdminAnnouncement) => {
    if (!window.confirm(`حذف الإعلان «${item.title}»؟`)) return;
    try {
      await api(`/admin/announcements/${item.id}`, { method: 'DELETE', admin: true });
      toast.push('تم حذف الإعلان', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const openDetail = useCallback(
    async (item: AdminAnnouncement) => {
      setDetailBusy(true);
      setDetail(null);
      try {
        const response = await api<DetailResponse>(`/admin/announcements/${item.id}`, { admin: true });
        setDetail(response);
      } catch (error) {
        toast.push((error as Error).message, 'error');
      } finally {
        setDetailBusy(false);
      }
    },
    [toast]
  );

  if (loading) return <div className="skeleton" style={{ height: 360 }} />;

  return (
    <div className="stack">
      <AdminCard
        title="مركز إعلانات وتحديثات يلا فون"
        subtitle="انشر إعلاناً لجميع المستخدمين أو لمجموعة محددة، مع إحصاءات وسجل نشر"
        actions={
          <div className="inline">
            <span className={`pill ${data?.pushConfigured ? 'pill-green' : 'pill-gold'}`}>
              <Icon name="bell" size={12} />
              {data?.pushConfigured ? 'Push مفعّل (FCM)' : 'Push يحتاج مفاتيح FCM'}
            </span>
            <button className="btn btn-primary btn-sm" onClick={openNew}>
              <Icon name="plus" size={14} /> إعلان جديد
            </button>
          </div>
        }
      >
        {!data?.pushConfigured ? (
          <p className="tiny muted">
            الإشعارات الفورية داخل التطبيق تعمل الآن. لإرسال Push للأجهزة أضف مفتاح خدمة Firebase
            (FCM_SERVICE_ACCOUNT_JSON) إلى أسرار التطبيق.
          </p>
        ) : null}
      </AdminCard>

      {form ? (
        <AdminCard
          title={form.id ? 'تعديل الإعلان' : 'إعلان جديد'}
          subtitle="المعاينة تعرض الشكل النهائي كما سيظهر للمستخدم"
          actions={
            <button className="btn btn-ghost btn-sm" onClick={() => setPreview((value) => !value)}>
              <Icon name="eye" size={14} /> {preview ? 'إخفاء المعاينة' : 'معاينة قبل النشر'}
            </button>
          }
        >
          <div className="admin-form-grid">
            <Field label="العنوان">
              <input
                className="input"
                value={form.title}
                maxLength={120}
                onChange={(event) => set('title', event.target.value)}
              />
            </Field>
            <Field label="التصنيف">
              <select
                className="input"
                value={form.category}
                onChange={(event) => set('category', event.target.value)}
              >
                {categories.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.labelAr}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="نص الإعلان">
            <textarea
              className="textarea"
              value={form.body}
              maxLength={4000}
              onChange={(event) => set('body', event.target.value)}
            />
          </Field>

          <div className="admin-form-grid">
            <Field label="نوع المرفق">
              <select
                className="input"
                value={form.mediaType}
                onChange={(event) => set('mediaType', event.target.value as FormState['mediaType'])}
              >
                <option value="none">بدون مرفق</option>
                <option value="image">صورة</option>
                <option value="video">فيديو</option>
              </select>
            </Field>
            <Field label="رابط المرفق" hint="أو ارفع ملفاً من الجهاز">
              <input
                className="input"
                value={form.mediaUrl}
                dir="ltr"
                onChange={(event) => set('mediaUrl', event.target.value)}
              />
            </Field>
          </div>
          {form.mediaType !== 'none' ? (
            <label className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }}>
              <Icon name="image" size={14} /> رفع صورة/فيديو
              <input
                type="file"
                hidden
                accept={form.mediaType === 'video' ? 'video/mp4,video/webm' : 'image/*'}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadMedia(file);
                  event.target.value = '';
                }}
              />
            </label>
          ) : null}

          <div className="admin-form-grid">
            <Field label="رابط خارجي (اختياري)">
              <input
                className="input"
                value={form.linkUrl}
                dir="ltr"
                onChange={(event) => set('linkUrl', event.target.value)}
              />
            </Field>
            <Field label="نص الرابط">
              <input
                className="input"
                value={form.linkLabel}
                onChange={(event) => set('linkLabel', event.target.value)}
              />
            </Field>
          </div>

          <div className="inline" style={{ gap: 8 }}>
            <button
              className={`btn btn-sm ${form.audience === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => set('audience', 'all')}
            >
              جميع المستخدمين
            </button>
            <button
              className={`btn btn-sm ${form.audience === 'selected' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => set('audience', 'selected')}
            >
              مجموعة محددة ({form.userIds.length})
            </button>
          </div>

          {form.audience === 'selected' ? (
            <div className="stack">
              <div className="search">
                <Icon name="search" size={16} />
                <input
                  value={userQuery}
                  onChange={(event) => setUserQuery(event.target.value)}
                  placeholder="ابحث بالاسم أو رقم الحساب"
                />
              </div>
              <div className="user-pick-list">
                {users.map((user) => {
                  const picked = form.userIds.includes(user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      className={`user-pick ${picked ? 'is-picked' : ''}`}
                      onClick={() =>
                        set(
                          'userIds',
                          picked
                            ? form.userIds.filter((id) => id !== user.id)
                            : [...form.userIds, user.id]
                        )
                      }
                    >
                      <span className="tiny">{user.display_name}</span>
                      <span className="tiny muted">#{user.username}</span>
                      {picked ? <Icon name="check" size={13} /> : null}
                    </button>
                  );
                })}
                {users.length === 0 ? <Empty text="لا نتائج" /> : null}
              </div>
            </div>
          ) : null}

          <Toggle
            checked={form.commentsEnabled}
            onChange={(value) => set('commentsEnabled', value)}
            label="السماح بالتعليقات على هذا الإعلان"
          />
          <Toggle
            checked={form.isPinned}
            onChange={(value) => set('isPinned', value)}
            label="تثبيت الإعلان أعلى القائمة"
          />

          <div className="admin-form-grid">
            <Field label="جدولة النشر (اختياري)" hint="اتركه فارغاً للنشر الفوري">
              <input
                className="input"
                type="datetime-local"
                value={form.scheduleAt}
                onChange={(event) => set('scheduleAt', event.target.value)}
              />
            </Field>
          </div>

          <div className="inline" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void submit(form.status === 'published' ? 'draft' : 'publish')}
            >
              {busy ? <span className="spinner" /> : form.status === 'published' ? 'حفظ التعديلات' : 'نشر الآن'}
            </button>
            {form.status !== 'published' ? (
              <>
                <button
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={() => void submit('schedule')}
                >
                  <Icon name="clock" size={14} /> جدولة
                </button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => void submit('draft')}>
                  حفظ كمسودة
                </button>
              </>
            ) : null}
            <button className="btn btn-ghost" onClick={() => setForm(null)}>
              إلغاء
            </button>
          </div>

          {preview ? (
            <div className="preview-wrap">
              <div className="tiny muted" style={{ marginBottom: 6 }}>
                معاينة كما ستظهر للمستخدم
              </div>
              <article className="announcement-card">
                <div className="announcement-head">
                  <div className="announcement-badges">
                    <CategoryPill category={form.category} categories={categories} />
                    {form.isPinned ? (
                      <span className="pill pill-gold" style={{ padding: '2px 8px', fontSize: 10 }}>
                        <Icon name="pin" size={11} /> مثبت
                      </span>
                    ) : null}
                  </div>
                  <span className="tiny muted">الآن</span>
                </div>
                <h3 className="announcement-title">{form.title || 'عنوان الإعلان'}</h3>
                <p className="announcement-body is-open">{form.body || 'نص الإعلان…'}</p>
                {form.mediaUrl ? (
                  form.mediaType === 'video' ? (
                    <video className="announcement-media" src={assetUrl(form.mediaUrl)} controls />
                  ) : (
                    <img className="announcement-media" src={assetUrl(form.mediaUrl)} alt="" />
                  )
                ) : null}
                <div className="announcement-meta">
                  <span>
                    <Icon name="eye" size={13} /> 0 مشاهدة
                  </span>
                  <span>
                    <Icon name="heart" size={13} /> 0 تفاعل
                  </span>
                  <span>
                    <Icon name="chat" size={13} /> 0 تعليق
                  </span>
                </div>
              </article>
            </div>
          ) : null}
        </AdminCard>
      ) : null}

      <AdminCard title="الإعلانات المنشورة والمجدولة" subtitle={`${list.length} إعلان`}>
        {list.length === 0 ? (
          <Empty text="لا توجد إعلانات بعد — أنشئ أول إعلان" />
        ) : (
          <Table head={['العنوان', 'التصنيف', 'الحالة', 'المستلمون', 'مقروء', 'مشاهدات', 'تفاعلات', 'تعليقات', 'الناشر', 'إجراءات']}>
            {list.map((item) => (
              <tr key={item.id}>
                <td>
                  <div style={{ fontWeight: 700 }}>{item.title}</div>
                  <div className="tiny muted">
                    {item.isPinned ? '📌 مثبت • ' : ''}
                    {item.publishedAt
                      ? formatTimeAgo(item.publishedAt, 'ar')
                      : item.publishAt
                        ? `مجدول: ${new Date(item.publishAt).toLocaleString('ar-IQ')}`
                        : 'مسودة'}
                  </div>
                </td>
                <td>
                  <CategoryPill category={item.category} categories={categories} />
                </td>
                <td>
                  <span
                    className={`pill ${item.status === 'published' ? 'pill-green' : item.status === 'scheduled' ? 'pill-gold' : ''}`}
                  >
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </td>
                <td>{item.audience === 'all' ? 'الجميع' : item.targetCount}</td>
                <td>{item.stats.reads}</td>
                <td>{item.stats.views}</td>
                <td>{item.stats.reactions}</td>
                <td>{item.stats.comments}</td>
                <td className="tiny">{item.createdByName}</td>
                <td>
                  <div className="inline" style={{ gap: 4, flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => openEdit(item)}>
                      تعديل
                    </button>
                    {item.status !== 'published' ? (
                      <button className="btn btn-ghost btn-xs" onClick={() => void publishNow(item)}>
                        نشر
                      </button>
                    ) : null}
                    <button className="btn btn-ghost btn-xs" onClick={() => void togglePin(item)}>
                      {item.isPinned ? 'إلغاء التثبيت' : 'تثبيت'}
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void openDetail(item)}>
                      تفاصيل
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void remove(item)}>
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>

      <Sheet open={Boolean(detail) || detailBusy} onClose={() => setDetail(null)} title="إحصاءات وسجل الإعلان">
        {detailBusy || !detail ? (
          <div className="skeleton" style={{ height: 200 }} />
        ) : (
          <div className="stack">
            <h3 style={{ fontSize: 16 }}>{detail.announcement.title}</h3>
            <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <Stat label="المستلمون" value={detail.announcement.stats.recipients} />
              <Stat label="قرأوه" value={detail.announcement.stats.reads} />
              <Stat label="المشاهدات" value={detail.announcement.stats.views} />
              <Stat label="التفاعلات" value={detail.announcement.stats.reactions} />
              <Stat label="التعليقات" value={detail.announcement.stats.comments} />
              <Stat
                label="الجمهور"
                value={detail.announcement.audience === 'all' ? 'الجميع' : detail.targets.length}
              />
            </div>

            {detail.reactions.length > 0 ? (
              <div className="inline" style={{ gap: 6, flexWrap: 'wrap' }}>
                {detail.reactions.map((reaction) => (
                  <span key={reaction.emoji} className="pill">
                    {reaction.emoji} {reaction.count}
                  </span>
                ))}
              </div>
            ) : null}

            <div>
              <div className="section-head">
                <h4>سجل النشر والتعديل</h4>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {detail.events.map((event) => (
                  <div key={event.id} className="tiny">
                    <b>{ACTION_LABEL[event.action] ?? event.action}</b> — {event.adminName} •{' '}
                    {new Date(event.createdAt).toLocaleString('ar-IQ')}
                    {event.detail ? <div className="muted">{event.detail}</div> : null}
                  </div>
                ))}
                {detail.events.length === 0 ? <Empty text="لا سجل بعد" /> : null}
              </div>
            </div>

            <div>
              <div className="section-head">
                <h4>تعليقات المستخدمين ({detail.comments.length})</h4>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {detail.comments.map((comment) => (
                  <div key={comment.id} className="comment-item">
                    <div>
                      <div className="comment-head">
                        <b>{comment.displayName}</b>
                        <span className="tiny muted">#{comment.username}</span>
                      </div>
                      <p className="comment-body">{comment.body}</p>
                    </div>
                  </div>
                ))}
                {detail.comments.length === 0 ? <Empty text="لا تعليقات" /> : null}
              </div>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
