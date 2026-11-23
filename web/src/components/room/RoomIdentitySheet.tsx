import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { Sheet } from '../../lib/ui';
import { coverUrlFor } from './roomCovers';
import type { RoomData } from './types';

export interface RoomIdentityPatch {
  name: string;
  coverUrl: string;
  background: string;
}

/** Owner sheet: rename the room and replace its picture from the device. */
export function RoomIdentitySheet({
  open,
  onClose,
  room,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  room: RoomData;
  onSave: (patch: RoomIdentityPatch) => Promise<void>;
}) {
  const [name, setName] = useState(room.name);
  const [cover, setCover] = useState(room.coverUrl || room.background);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(room.name);
    setCover(room.coverUrl || room.background);
    setError('');
  }, [open, room]);

  const photo = coverUrlFor(cover) ?? (/^(https?:|\/uploads\/)/i.test(cover) ? cover : null);

  const upload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const uploaded = await api<{ url: string }>('/uploads', { method: 'POST', form });
      setCover(uploaded.url);
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
      await onSave({ name: trimmed, coverUrl: cover, background: cover });
      onClose();
    } catch (saveError) {
      setError((saveError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="هوية الغرفة">
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
          <button
            type="button"
            className="room-identity-camera"
            onClick={() => fileRef.current?.click()}
            aria-label="تغيير صورة الغرفة"
          >
            {uploading ? '…' : '📷'}
          </button>
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

        <button
          type="button"
          className="room-identity-save"
          onClick={() => void save()}
          disabled={busy || uploading}
        >
          {busy ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
        </button>
      </div>
    </Sheet>
  );
}
