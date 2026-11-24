import { useEffect, useRef, useState } from 'react';
import { api, assetUrl } from '../../lib/api';
import { Avatar, Sheet } from '../../lib/ui';
import type { RoomData, RoomMemberEntry } from './types';
import { RoomNotes } from './RoomNotes';

export interface RoomIdentityPatch {
  name: string;
  avatarUrl: string;
}

type Tab = 'sections' | 'notes';

const ROLE_LABEL: Record<string, string> = {
  owner: 'صاحب الغرفة',
  admin: 'نائب المالك',
  supervisor: 'مشرف',
  member: 'عضو',
};

/**
 * هوية الغرفة: identity, level and members sit inside one scroll that ends with
 * the save button; ملاحظات keeps its own tab as before.
 */
export function RoomIdentitySheet({
  open,
  onClose,
  room,
  members,
  canManage,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  room: RoomData;
  members: RoomMemberEntry[];
  canManage: boolean;
  onSave: (patch: RoomIdentityPatch) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>('sections');
  const [name, setName] = useState(room.name);
  const [avatar, setAvatar] = useState(room.avatarUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset only when the sheet opens: the room object changes on every realtime
  // update, and that must not wipe what the owner is typing.
  useEffect(() => {
    if (!open) return;
    setTab('sections');
    setName(room.name);
    setAvatar(room.avatarUrl ?? '');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const photo = /^(https?:|\/uploads\/)/i.test(avatar) ? assetUrl(avatar) : null;

  const upload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const uploaded = await api<{ url: string }>('/uploads', { method: 'POST', form });
      setAvatar(uploaded.url);
    } catch (uploadError) {
      setError((uploadError as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('اسم الغرفة قصير جداً');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave({ name: trimmed, avatarUrl: avatar });
      onClose();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const levelPercent =
    room.levelXpNext == null
      ? 100
      : Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ((Number(room.levelXp) - Number(room.levelXpFloor)) /
                Math.max(1, Number(room.levelXpNext) - Number(room.levelXpFloor))) *
                100
            )
          )
        );

  const showNotes = Boolean(room.member || room.canManage || room.canModerate);

  return (
    <Sheet open={open} onClose={onClose} title="هوية الغرفة">
      {showNotes ? (
        <div className="room-identity-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className={`room-identity-tab${tab === 'sections' ? ' on' : ''}`}
            aria-selected={tab === 'sections'}
            onClick={() => setTab('sections')}
          >
            الأقسام
          </button>
          <button
            type="button"
            role="tab"
            className={`room-identity-tab${tab === 'notes' ? ' on' : ''}`}
            aria-selected={tab === 'notes'}
            onClick={() => setTab('notes')}
          >
            ملاحظات
          </button>
        </div>
      ) : null}

      {tab === 'notes' ? (
        <div className="room-identity-block">
          <RoomNotes roomId={room.id} />
        </div>
      ) : (
        <div className="room-identity-stack">
          <section className="room-identity-block">
            <p className="room-identity-block-head">الهوية</p>
            <div className="room-identity">
              <div className="room-identity-photo-wrap">
                <span className="room-identity-photo">
                  {photo ? (
                    <img src={photo} alt="" />
                  ) : (
                    <span className="room-identity-photo-fallback" aria-hidden="true">
                      ♛
                    </span>
                  )}
                </span>
                {canManage ? (
                  <button
                    type="button"
                    className="room-identity-camera"
                    onClick={() => fileRef.current?.click()}
                    aria-label="تغيير صورة الغرفة"
                  >
                    {uploading ? '…' : '📷'}
                  </button>
                ) : null}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void upload(file);
                  }}
                />
              </div>

              {canManage ? (
                <>
                  <button
                    type="button"
                    className="room-identity-upload"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? 'جارٍ رفع الصورة…' : 'تغيير الصورة من الجهاز'}
                  </button>

                  <label className="room-identity-label" htmlFor="room-identity-name">
                    اسم الغرفة
                  </label>
                  <input
                    id="room-identity-name"
                    className="room-identity-input"
                    value={name}
                    maxLength={60}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="اكتب اسم الغرفة"
                  />

                  {error ? <p className="room-settings-error">{error}</p> : null}
                </>
              ) : (
                <p className="room-identity-name-readonly">{room.name}</p>
              )}
            </div>
          </section>

          <section className="room-identity-block">
            <p className="room-identity-block-head">المستوى</p>
            <div className="room-level-panel">
              <span className="room-level-badge">LV {room.level}</span>
              <p className="room-level-title">مستوى الغرفة</p>
              <div className="room-level-bar" aria-hidden="true">
                <span style={{ width: `${levelPercent}%` }} />
              </div>
              <p className="room-level-xp">
                {room.levelXpNext == null
                  ? 'أعلى مستوى — ما شاء الله'
                  : `${room.levelXp} / ${room.levelXpNext} نقطة تفاعل`}
              </p>
              <div className="room-level-stats">
                <span>
                  <b>{room.micSlots}</b>
                  <i>مايكات</i>
                </span>
                <span>
                  <b>
                    {room.capacity.count}/{room.capacity.limit}
                  </b>
                  <i>أعضاء</i>
                </span>
                <span>
                  <b>
                    {room.staff.viceCount}/{room.staff.viceLimit}
                  </b>
                  <i>نوّاب المالك</i>
                </span>
                <span>
                  <b>
                    {room.staff.supervisorCount}/{room.staff.supervisorLimit}
                  </b>
                  <i>مشرفون</i>
                </span>
              </div>
              <p className="tiny muted center">
                يرتفع مستوى الغرفة بالدردشة داخل الغرفة وبالبقاء على المايك، وكل مستوى يفتح مقاعد
                وصلاحيات أكثر.
              </p>
            </div>
          </section>

          <section className="room-identity-block">
            <p className="room-identity-block-head">الأعضاء ({members.length})</p>
            <div className="room-panel-list">
              {members.length === 0 ? <p className="tiny muted center">لا يوجد أعضاء بعد</p> : null}
              {members.map((member) => {
                const role = member.role || 'member';
                return (
                  <div key={member.id} className="room-panel-row">
                    <Avatar
                      user={{ displayName: member.displayName, avatarUrl: member.avatarUrl, online: member.online }}
                      size={34}
                    />
                    <span className="room-panel-copy">
                      <b>{member.displayName}</b>
                      <span className={`room-role-tag role-${role}`}>{ROLE_LABEL[role] ?? 'عضو'}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {canManage ? (
            <button
              type="button"
              className="room-identity-save"
              onClick={() => void save()}
              disabled={busy || uploading}
            >
              {busy ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
            </button>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
