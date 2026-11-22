import { useState, type CSSProperties } from 'react';
import { api } from '../../lib/api';
import { Icon, useToast } from '../../lib/ui';
import { AdminCard, Empty, Field, Toggle, useAdminData } from './shared';
import { ROOM_BACKGROUNDS } from '../room/RoomBackdrop';
import { MIC_COLORS, MIC_STYLES } from '../room/micStyles';

interface AdminMic {
  id: string;
  position: number;
  label: string;
  kind: string;
  isLocked: boolean;
  user: { id: string; displayName: string } | null;
}

interface AdminRoom {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  rules: string;
  isActive: boolean;
  sortOrder: number;
  background: string;
  micStyle: string;
  micColor: string;
  country: string;
  language: string;
  mics: AdminMic[];
}

const EMPTY_FORM = {
  id: '',
  name: '',
  description: '',
  coverUrl: '',
  rules: '',
  isActive: true,
  sortOrder: 0,
  background: 'fire',
  micStyle: 'fire',
  micColor: '#ff3b0f',
  country: 'العراق',
  language: 'العربية',
  micCount: 15,
};

const KINDS = [
  { id: 'host', label: 'مايك رئيسي' },
  { id: 'speaker', label: 'متحدث' },
  { id: 'audience', label: 'مستمع' },
];

export default function RoomsTab() {
  const toast = useToast();
  const { data, loading, reload } = useAdminData<{ rooms: AdminRoom[] }>('/admin/rooms');
  const [form, setForm] = useState(EMPTY_FORM);
  const [openRoomId, setOpenRoomId] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const rooms = data?.rooms ?? [];
  const openRoom = rooms.find((room) => room.id === openRoomId) ?? null;

  const reset = () => setForm(EMPTY_FORM);

  const edit = (room: AdminRoom) => {
    setForm({
      id: room.id,
      name: room.name,
      description: room.description,
      coverUrl: room.coverUrl ?? '',
      rules: room.rules,
      isActive: room.isActive,
      sortOrder: room.sortOrder,
      background: room.background ?? 'fire',
      micStyle: room.micStyle ?? 'fire',
      micColor: room.micColor ?? '#ff3b0f',
      country: room.country ?? 'العراق',
      language: room.language ?? 'العربية',
      micCount: room.mics.length,
    });
    setOpenRoomId(room.id);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.push('اسم الغرفة مطلوب', 'error');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: form.name,
        description: form.description,
        coverUrl: form.coverUrl || null,
        rules: form.rules,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
        background: form.background,
        micStyle: form.micStyle,
        micColor: form.micColor,
        country: form.country,
        language: form.language,
        micCount: form.micCount,
      };
      if (form.id) {
        await api(`/admin/rooms/${form.id}`, { method: 'PATCH', admin: true, body });
        toast.push('تم تحديث إعدادات الغرفة', 'success');
        setOpenRoomId(form.id);
      } else {
        const response = await api<{ room: { id: string } }>('/admin/rooms', {
          method: 'POST',
          admin: true,
          body,
        });
        toast.push('تم إنشاء الغرفة', 'success');
        setOpenRoomId(response.room.id);
      }
      reset();
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeRoom = async (room: AdminRoom) => {
    if (!window.confirm(`حذف غرفة «${room.name}» وكل مايكاتها؟`)) return;
    try {
      await api(`/admin/rooms/${room.id}`, { method: 'DELETE', admin: true });
      toast.push('تم حذف الغرفة', 'success');
      if (form.id === room.id) reset();
      if (openRoomId === room.id) setOpenRoomId('');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    setUploading(true);
    try {
      const response = await api<{ url: string }>('/admin/rooms/upload', {
        method: 'POST',
        admin: true,
        form: body,
      });
      setForm((current) => ({ ...current, coverUrl: response.url }));
      toast.push('تم رفع صورة الغرفة', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const addMic = async (room: AdminRoom) => {
    try {
      await api(`/admin/rooms/${room.id}/mics`, { method: 'POST', admin: true, body: {} });
      toast.push('تمت إضافة مايك', 'success');
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const removeMic = async (room: AdminRoom, mic: AdminMic) => {
    if (!window.confirm('حذف هذا المايك؟')) return;
    try {
      await api(`/admin/rooms/${room.id}/mics/${mic.id}`, { method: 'DELETE', admin: true });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const patchMic = async (room: AdminRoom, mic: AdminMic, patch: Partial<AdminMic>) => {
    try {
      await api(`/admin/rooms/${room.id}/mics/${mic.id}`, { method: 'PATCH', admin: true, body: patch });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const moveMic = async (room: AdminRoom, index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= room.mics.length) return;
    const ids = room.mics.map((mic) => mic.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await api(`/admin/rooms/${room.id}/mics/reorder`, { method: 'POST', admin: true, body: { ids } });
      await reload();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <div className="admin-stack">
      <AdminCard
        title={form.id ? 'تعديل الغرفة' : 'إنشاء غرفة جديدة'}
        subtitle="الاسم والوصف والقواعد والصورة، وعدد المايكات عند الإنشاء"
        actions={
          form.id ? (
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              <Icon name="plus" size={14} /> غرفة جديدة
            </button>
          ) : null
        }
      >
        <div className="admin-grid-2">
          <Field label="اسم الغرفة">
            <input
              className="input"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="مثال: غرفة الأصدقاء"
            />
          </Field>
          <Field label="الوصف">
            <input
              className="input"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="وصف قصير يظهر تحت الاسم"
            />
          </Field>
        </div>

        <Field label="قواعد الغرفة" hint="تظهر للمستخدمين داخل الغرفة">
          <textarea
            className="input"
            rows={3}
            value={form.rules}
            onChange={(event) => setForm({ ...form, rules: event.target.value })}
          />
        </Field>

        <div className="admin-grid-2">
          <Field label="صورة الغرفة">
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                value={form.coverUrl}
                onChange={(event) => setForm({ ...form, coverUrl: event.target.value })}
                placeholder="/uploads/..."
                dir="ltr"
              />
              <label className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }}>
                <Icon name="image" size={14} /> {uploading ? 'جارٍ الرفع…' : 'رفع صورة'}
                <input type="file" accept="image/*" hidden onChange={(event) => void upload(event)} />
              </label>
            </div>
          </Field>
          <div className="admin-grid-2">
            <Field label="الترتيب">
              <input
                className="input"
                type="number"
                value={form.sortOrder}
                onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) || 0 })}
              />
            </Field>
            {form.id ? null : (
              <Field label="عدد المايكات عند الإنشاء">
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={20}
                  value={form.micCount}
                  onChange={(event) => setForm({ ...form, micCount: Number(event.target.value) || 0 })}
                />
              </Field>
            )}
          </div>
        </div>

        <div className="admin-grid-2">
          <Field label="الخلفية المتحركة" hint="تظهر داخل الغرفة خلف المايكات">
            <select
              className="input"
              value={form.background}
              onChange={(event) => setForm({ ...form, background: event.target.value })}
            >
              {ROOM_BACKGROUNDS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
              {form.background &&
              !ROOM_BACKGROUNDS.some((item) => item.id === form.background) ? (
                <option value={form.background}>خلفية مخصّصة</option>
              ) : null}
            </select>
          </Field>
          <Field label="رابط خلفية مخصّصة" hint="صورة أو فيديو MP4 — يتجاوز الخلفية المختارة">
            <input
              className="input"
              dir="ltr"
              placeholder="/uploads/background.mp4"
              value={/^(https?:\/\/|\/uploads\/)/i.test(form.background) ? form.background : ''}
              onChange={(event) =>
                setForm({ ...form, background: event.target.value.trim() || 'fire' })
              }
            />
          </Field>
          <div className="admin-grid-2">
            <Field label="الدولة">
              <input
                className="input"
                value={form.country}
                onChange={(event) => setForm({ ...form, country: event.target.value })}
              />
            </Field>
            <Field label="اللغة">
              <input
                className="input"
                value={form.language}
                onChange={(event) => setForm({ ...form, language: event.target.value })}
              />
            </Field>
          </div>
        </div>

        <div className="admin-grid-2">
          <Field label="تصميم المايكات" hint="كل التصاميم شفافة — بدون مربع خلف المايك">
            <div className="mic-style-picker">
              {MIC_STYLES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`mic-style-option${form.micStyle === item.id ? ' on' : ''}`}
                  onClick={() => setForm({ ...form, micStyle: item.id })}
                >
                  <span
                    className="mic-style-preview"
                    data-mic-style={item.id}
                    style={{ '--mic-accent': form.micColor } as CSSProperties}
                  >
                    <span className="seat-ring">
                      <Icon name="mic" size={14} />
                    </span>
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field label="لون المايك" hint="يُطبَّق على الحلقة والتوهج داخل الغرفة">
            <div className="mic-color-picker">
              {MIC_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`mic-color-dot${form.micColor.toLowerCase() === color ? ' on' : ''}`}
                  style={{ background: color }}
                  aria-label={color}
                  onClick={() => setForm({ ...form, micColor: color })}
                />
              ))}
              <input
                type="color"
                className="mic-color-input"
                value={form.micColor}
                onChange={(event) => setForm({ ...form, micColor: event.target.value })}
              />
            </div>
          </Field>
        </div>

        <Toggle
          checked={form.isActive}
          onChange={(value) => setForm({ ...form, isActive: value })}
          label="الغرفة ظاهرة للمستخدمين"
        />

        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            <Icon name="check" size={15} /> {busy ? 'جارٍ الحفظ…' : form.id ? 'حفظ التعديلات' : 'إنشاء الغرفة'}
          </button>
          {form.id ? (
            <button className="btn btn-ghost" onClick={reset}>
              إلغاء
            </button>
          ) : null}
        </div>
      </AdminCard>

      <AdminCard title="الغرف" subtitle={`${rooms.length} غرفة`}>
        {loading ? (
          <Empty text="جارٍ التحميل…" />
        ) : rooms.length === 0 ? (
          <Empty text="لا توجد غرف بعد — أنشئ أول غرفة" />
        ) : (
          <div className="admin-stack">
            {rooms.map((room) => (
              <div key={room.id} className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div className="row-main">
                  <div className="row-title">{room.name}</div>
                  <div className="row-sub">
                    {room.mics.length} مايك • {room.mics.filter((mic) => mic.user).length} مشغول •{' '}
                    {room.isActive ? 'ظاهرة' : 'مخفية'}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setOpenRoomId(room.id)}>
                    <Icon name="mic" size={14} /> المايكات
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => edit(room)}>
                    <Icon name="settings" size={14} /> تعديل
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => void removeRoom(room)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      {openRoom ? (
        <AdminCard
          title={`مايكات «${openRoom.name}»`}
          subtitle="أضف أو احذف أو رتّب المايكات، واقفل المايك لمنع الجلوس عليه"
          actions={
            <button className="btn btn-primary btn-sm" onClick={() => void addMic(openRoom)}>
              <Icon name="plus" size={14} /> إضافة مايك
            </button>
          }
        >
          {openRoom.mics.length === 0 ? (
            <Empty text="لا توجد مايكات — أضف أول مايك" />
          ) : (
            <div className="admin-stack">
              {openRoom.mics.map((mic, index) => (
                <div key={mic.id} className="admin-mic-row">
                  <span className="pill">{mic.position}</span>
                  <input
                    className="input"
                    defaultValue={mic.label}
                    placeholder={`مايك ${mic.position}`}
                    onBlur={(event) => {
                      const label = event.target.value.trim();
                      if (label !== mic.label) void patchMic(openRoom, mic, { label });
                    }}
                  />
                  <select
                    className="input"
                    value={mic.kind}
                    onChange={(event) => void patchMic(openRoom, mic, { kind: event.target.value })}
                  >
                    {KINDS.map((kind) => (
                      <option key={kind.id} value={kind.id}>
                        {kind.label}
                      </option>
                    ))}
                  </select>
                  <span className="tiny muted" style={{ minWidth: 90 }}>
                    {mic.user ? mic.user.displayName : 'فارغ'}
                  </span>
                  <button
                    className={`btn btn-sm ${mic.isLocked ? 'btn-danger' : 'btn-ghost'}`}
                    onClick={() => void patchMic(openRoom, mic, { isLocked: !mic.isLocked })}
                    title="قفل المايك"
                  >
                    <Icon name={mic.isLocked ? 'lock' : 'users'} size={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => void moveMic(openRoom, index, -1)}
                    disabled={index === 0}
                    title="تقديم"
                  >
                    <Icon name="arrowLeft" size={14} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => void moveMic(openRoom, index, 1)}
                    disabled={index === openRoom.mics.length - 1}
                    title="تأخير"
                  >
                    <Icon name="arrowRight" size={14} />
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => void removeMic(openRoom, mic)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </AdminCard>
      ) : null}
    </div>
  );
}
