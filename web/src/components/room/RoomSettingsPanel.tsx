import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Sheet } from '../../lib/ui';
import { ROOM_BACKGROUNDS } from './RoomBackdrop';
import { ROOM_COVERS, coverValue } from './roomCovers';
import type { RoomData, RoomMemberEntry, RoomStaff } from './types';

export interface RoomSettingsPatch {
  background?: string;
  coverUrl?: string;
  musicUrl?: string;
  country?: string;
  language?: string;
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'صاحب الغرفة',
  admin: 'نائب المالك',
  supervisor: 'مشرف',
  member: 'عضو',
};

/** Stage settings for the owner / room management: cover, staff and details. */
export function RoomSettingsPanel({
  open,
  onClose,
  room,
  members,
  staff,
  onSave,
  onSetRole,
}: {
  open: boolean;
  onClose: () => void;
  room: RoomData;
  members: RoomMemberEntry[];
  staff: RoomStaff;
  onSave: (patch: RoomSettingsPatch) => Promise<void>;
  onSetRole: (userId: string, role: 'admin' | 'supervisor' | null) => Promise<void>;
}) {
  const [background, setBackground] = useState(room.background);
  const [coverUrl, setCoverUrl] = useState(room.coverUrl ?? '');
  const [custom, setCustom] = useState('');
  const [country, setCountry] = useState(room.country);
  const [language, setLanguage] = useState(room.language);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [roleBusy, setRoleBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBackground(room.background);
    setCoverUrl(room.coverUrl ?? '');
    setCustom(/^(https?:\/\/|\/uploads\/)/i.test(room.background) ? room.background : '');
    setCountry(room.country);
    setLanguage(room.language);
    setError('');
  }, [open, room]);

  const pickCover = (value: string) => {
    setBackground(value);
    setCoverUrl(value);
    setCustom('');
  };

  const uploadCover = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const uploaded = await api<{ url: string }>('/uploads', { method: 'POST', form });
      pickCover(uploaded.url);
    } catch (uploadError) {
      setError((uploadError as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await onSave({
        background: custom.trim() || background,
        coverUrl: custom.trim() || coverUrl || background,
        country: country.trim() || 'العراق',
        language: language.trim() || 'العربية',
      });
      onClose();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setRole = async (userId: string, role: 'admin' | 'supervisor' | null) => {
    setRoleBusy(userId);
    setError('');
    try {
      await onSetRole(userId, role);
    } catch (roleError) {
      setError((roleError as Error).message);
    } finally {
      setRoleBusy(null);
    }
  };

  const supervisorsFull = staff.supervisorCount >= staff.supervisorLimit;
  const viceFull = staff.viceCount >= staff.viceLimit;

  return (
    <Sheet open={open} onClose={onClose} title="إعدادات الغرفة">
      <div className="room-settings">
        <label className="room-field-label">غلاف الغرفة — صور حقيقية</label>
        <div className="room-cover-picker">
          {ROOM_COVERS.map((cover) => {
            const value = coverValue(cover.id);
            return (
              <button
                key={cover.id}
                type="button"
                className={`room-cover-option${!custom && background === value ? ' on' : ''}`}
                onClick={() => pickCover(value)}
              >
                <img src={cover.url} alt="" />
                <span>{cover.label}</span>
              </button>
            );
          })}
        </div>

        <label className="room-cover-upload">
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadCover(file);
              event.target.value = '';
            }}
          />
          <span className="btn btn-ghost btn-sm">
            {uploading ? 'جارٍ رفع الصورة…' : 'رفع صورة غلاف من الجهاز'}
          </span>
        </label>

        <label className="room-field-label">الخلفيات المتحركة</label>
        <div className="room-bg-picker">
          {ROOM_BACKGROUNDS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`room-bg-option bg-${item.id}${!custom && background === item.id ? ' on' : ''}`}
              onClick={() => {
                setBackground(item.id);
                setCoverUrl(item.id);
                setCustom('');
              }}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <label className="room-field-label">أو رابط صورة / فيديو</label>
        <input
          className="input"
          dir="ltr"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder="/uploads/background.jpg"
        />

        <div className="room-staff-head">
          <span>مستوى الغرفة: {staff.level}</span>
          <span>
            المشرفون {staff.supervisorCount}/{staff.supervisorLimit} · نواب المالك {staff.viceCount}/
            {staff.viceLimit}
          </span>
        </div>
        <p className="tiny muted" style={{ margin: 0 }}>
          7 مشرفين في البداية، 14 عند وصول المستوى 2000، و28 مع نائبَي مالك عند 40000.
        </p>

        <div className="room-staff-list">
          {members.filter((member) => member.role !== 'owner').length === 0 ? (
            <p className="tiny muted center">لا يوجد أعضاء لترقيتهم بعد</p>
          ) : null}
          {members
            .filter((member) => member.role !== 'owner')
            .map((member) => (
              <div key={member.id} className="room-panel-row">
                <span className="room-panel-copy">
                  <b>{member.displayName}</b>
                  <span className={`room-role-tag role-${member.role}`}>
                    {ROLE_LABEL[member.role] ?? 'عضو'}
                  </span>
                </span>
                <span className="room-role-actions">
                  <button
                    type="button"
                    className={`chip${member.role === 'supervisor' ? ' on' : ''}`}
                    disabled={roleBusy === member.id || (supervisorsFull && member.role !== 'supervisor')}
                    onClick={() =>
                      void setRole(member.id, member.role === 'supervisor' ? null : 'supervisor')
                    }
                  >
                    مشرف
                  </button>
                  <button
                    type="button"
                    className={`chip${member.role === 'admin' ? ' on' : ''}`}
                    disabled={roleBusy === member.id || (viceFull && member.role !== 'admin')}
                    onClick={() => void setRole(member.id, member.role === 'admin' ? null : 'admin')}
                  >
                    نائب المالك
                  </button>
                </span>
              </div>
            ))}
        </div>

        <div className="admin-grid-2">
          <div>
            <label className="room-field-label">الدولة</label>
            <input className="input" value={country} onChange={(event) => setCountry(event.target.value)} />
          </div>
          <div>
            <label className="room-field-label">اللغة</label>
            <input className="input" value={language} onChange={(event) => setLanguage(event.target.value)} />
          </div>
        </div>

        {error ? <p className="tiny room-settings-error">{error}</p> : null}

        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : 'حفظ إعدادات الغرفة'}
        </button>
      </div>
    </Sheet>
  );
}
