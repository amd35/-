import { useState } from 'react';
import { api, assetUrl } from '../../lib/api';
import { formatCoins, Icon, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Table, Toggle, useAdminData } from './shared';

interface AdminRoomFrame {
  id: string;
  name: string;
  nameEn: string;
  imageUrl: string;
  price: number;
  sortOrder: number;
  isActive: boolean;
  sends: number;
}

interface RoomFrameLogRow {
  id: string;
  frame_name: string;
  price: number;
  duration_seconds: number;
  created_at: string;
  sender_name: string | null;
  sender_username: string | null;
  recipient_name: string | null;
  recipient_username: string | null;
  room_name: string | null;
}

const EMPTY_FORM = {
  id: '',
  name: '',
  price: 99,
  sortOrder: 0,
  imageUrl: '',
  isActive: true,
};

function personLabel(name: string | null, username: string | null) {
  return name || username || '—';
}

/** Admin panel for the frames gifted inside voice rooms (separate catalog). */
export default function RoomFramesTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ frames: AdminRoomFrame[]; log: RoomFrameLogRow[] }>(
    '/admin/room-frames'
  );
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const reset = () => setForm(EMPTY_FORM);

  const edit = (frame: AdminRoomFrame) =>
    setForm({
      id: frame.id,
      name: frame.name,
      price: Number(frame.price),
      sortOrder: Number(frame.sortOrder),
      imageUrl: frame.imageUrl,
      isActive: frame.isActive,
    });

  const save = async () => {
    if (!form.name.trim()) {
      toast.push('اسم الإطار مطلوب', 'error');
      return;
    }
    if (!form.imageUrl) {
      toast.push('ارفع صورة الإطار أولاً', 'error');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        imageUrl: form.imageUrl,
        price: Number(form.price),
        sortOrder: Number(form.sortOrder),
        isActive: form.isActive,
      };
      if (form.id) {
        await api(`/admin/room-frames/${form.id}`, { method: 'PATCH', admin: true, body });
        toast.push('تم تحديث الإطار', 'success');
      } else {
        await api('/admin/room-frames', { method: 'POST', admin: true, body });
        toast.push('تمت إضافة الإطار', 'success');
      }
      reset();
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (frame: AdminRoomFrame) => {
    try {
      await api(`/admin/room-frames/${frame.id}`, {
        method: 'PATCH',
        admin: true,
        body: { isActive: !frame.isActive },
      });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const remove = async (frame: AdminRoomFrame) => {
    if (!window.confirm(`حذف إطار "${frame.name}"؟`)) return;
    try {
      await api(`/admin/room-frames/${frame.id}`, { method: 'DELETE', admin: true });
      toast.push('تم حذف الإطار', 'success');
      if (form.id === frame.id) reset();
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  /** Swaps one frame with its neighbour and saves the whole order at once. */
  const move = async (frame: AdminRoomFrame, direction: -1 | 1) => {
    const list = data?.frames ?? [];
    const index = list.findIndex((item) => item.id === frame.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    const ids = list.map((item) => item.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await api('/admin/room-frames/reorder', { method: 'POST', admin: true, body: { ids } });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const uploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    setUploading(true);
    try {
      const response = await api<{ url: string }>('/admin/room-frames/upload', {
        method: 'POST',
        admin: true,
        form: body,
      });
      setForm((current) => ({ ...current, imageUrl: response.url }));
      toast.push('تم رفع الصورة', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="stack">
      <AdminCard
        title={form.id ? 'تعديل إطار' : 'إضافة إطار جديد'}
        subtitle="إطار شفاف PNG يُلبس حول صورة العضو داخل الغرفة لمدة دقيقة بعد الإرسال"
        actions={
          form.id ? (
            <button className="btn btn-ghost btn-xs" onClick={reset}>
              إلغاء التعديل
            </button>
          ) : undefined
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
          }}
        >
          <Field label="اسم الإطار">
            <input
              className="input"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="السعر بالكونز">
            <input
              className="input"
              type="number"
              min={0}
              dir="ltr"
              value={form.price}
              onChange={(event) => setForm({ ...form, price: Number(event.target.value) })}
            />
          </Field>
          <Field label="صورة الإطار" hint="PNG شفافة بمقاس مربع">
            <div className="inline">
              <label className="btn btn-ghost btn-xs">
                <Icon name="image" size={14} /> {uploading ? 'جارٍ الرفع…' : 'رفع صورة'}
                <input
                  type="file"
                  accept="image/png,image/webp"
                  hidden
                  onChange={(event) => void uploadImage(event)}
                />
              </label>
              {form.imageUrl ? (
                <span className="tiny muted" dir="ltr">
                  {form.imageUrl}
                </span>
              ) : null}
            </div>
          </Field>
          <Field label="مفعّل">
            <Toggle checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} label="ظاهر في الغرف" />
          </Field>
        </div>

        <div className="inline" style={{ gap: 14 }}>
          <div className="room-frame-preview">
            {form.imageUrl ? (
              <img className="room-frame-preview-art" src={assetUrl(form.imageUrl)} alt="" />
            ) : null}
            <span className="room-frame-preview-avatar" />
          </div>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            <Icon name="check" size={16} /> {busy ? 'جارٍ الحفظ…' : form.id ? 'حفظ التعديلات' : 'إضافة الإطار'}
          </button>
        </div>
      </AdminCard>

      <AdminCard title="إطارات الغرف" subtitle="تفعيل/تعطيل، الترتيب، التعديل والحذف">
        {loading ? (
          <div className="skeleton" style={{ height: 160 }} />
        ) : (data?.frames.length ?? 0) === 0 ? (
          <Empty text="لا توجد إطارات بعد" />
        ) : (
          <Table head={['معاينة', 'الاسم', 'السعر', 'عدد الإرسال', 'مفعّل', 'الترتيب', 'إجراءات']}>
            {data?.frames.map((frame) => (
              <tr key={frame.id}>
                <td>
                  <div className="room-frame-preview" style={{ width: 56, height: 56 }}>
                    <img className="room-frame-preview-art" src={assetUrl(frame.imageUrl)} alt="" />
                    <span className="room-frame-preview-avatar" style={{ width: 28, height: 28 }} />
                  </div>
                </td>
                <td>{frame.name}</td>
                <td dir="ltr">{formatCoins(frame.price)}</td>
                <td dir="ltr">{frame.sends}</td>
                <td>
                  <Toggle checked={frame.isActive} onChange={() => void toggle(frame)} label="مفعّل" />
                </td>
                <td>
                  <div className="inline" style={{ gap: 4 }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => void move(frame, -1)} aria-label="أعلى">
                      ↑
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void move(frame, 1)} aria-label="أسفل">
                      ↓
                    </button>
                  </div>
                </td>
                <td>
                  <div className="inline" style={{ gap: 4 }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => edit(frame)}>
                      تعديل
                    </button>
                    <button className="btn btn-ghost btn-xs" onClick={() => void remove(frame)}>
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>

      <AdminCard title="سجل إرسال الإطارات" subtitle="آخر 100 عملية مع الخصم والمرسل والمستلم">
        {(data?.log.length ?? 0) === 0 ? (
          <Empty text="لا توجد عمليات إرسال بعد" />
        ) : (
          <Table head={['التاريخ', 'الإطار', 'المرسل', 'المستلم', 'الغرفة', 'السعر']}>
            {data?.log.map((row) => (
              <tr key={row.id}>
                <td dir="ltr">
                  {new Date(row.created_at).toLocaleString('ar-IQ', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td>{row.frame_name}</td>
                <td>{personLabel(row.sender_name, row.sender_username)}</td>
                <td>{personLabel(row.recipient_name, row.recipient_username)}</td>
                <td>{row.room_name || '—'}</td>
                <td dir="ltr">{formatCoins(row.price)}</td>
              </tr>
            ))}
          </Table>
        )}
      </AdminCard>
    </div>
  );
}
