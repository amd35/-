import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Icon, Sheet } from '../../lib/ui';
import type { RoomData } from './types';

/** Shared room music: the owner picks a track, every member hears it. */
export function RoomMusicPanel({
  open,
  onClose,
  room,
  canManage,
  onSave,
  localMuted,
  onToggleLocal,
}: {
  open: boolean;
  onClose: () => void;
  room: RoomData;
  canManage: boolean;
  onSave: (musicUrl: string) => Promise<void>;
  localMuted: boolean;
  onToggleLocal: () => void;
}) {
  const [url, setUrl] = useState(room.musicUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) setUrl(room.musicUrl ?? '');
  }, [open, room.musicUrl]);

  const save = async (value: string) => {
    setBusy(true);
    try {
      await onSave(value);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  /** A song picked from the device becomes the room's shared track. */
  const upload = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const uploaded = await api<{ url: string }>('/uploads', { method: 'POST', form });
      setUrl(uploaded.url);
      await save(uploaded.url);
    } catch (uploadError) {
      setError((uploadError as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="موسيقى الغرفة">
      <div className="room-settings">
        <div className="room-music-state">
          <span className={`room-music-icon${room.musicUrl ? ' on' : ''}`}>
            <Icon name="volume" size={20} />
          </span>
          <div>
            <b>{room.musicUrl ? 'موسيقى تعمل الآن' : 'لا توجد موسيقى'}</b>
            <div className="tiny muted" dir="ltr">
              {room.musicUrl || 'اختر رابط ملف صوتي MP3'}
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onToggleLocal}>
            <Icon name={localMuted ? 'volumeOff' : 'volume'} size={14} /> {localMuted ? 'تشغيل لدي' : 'كتم لدي'}
          </button>
        </div>

        {canManage ? (
          <>
            <label className="room-field-label">أغنية من الجهاز (يسمعها الجميع)</label>
            <label className="btn btn-ghost btn-block btn-sm" style={{ position: 'relative', overflow: 'hidden' }}>
              <Icon name="volume" size={14} /> {uploading ? 'جارٍ رفع الأغنية…' : 'اختيار أغنية من الجهاز'}
              <input
                type="file"
                accept="audio/*"
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                disabled={busy || uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void upload(file);
                }}
              />
            </label>
            {error ? <p className="tiny" style={{ color: '#ff8a8a' }}>{error}</p> : null}
            <label className="room-field-label">أو رابط ملف صوتي (يسمعه الجميع)</label>
            <input
              className="input"
              dir="ltr"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://.../track.mp3"
            />
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !url.trim()}
                onClick={() => void save(url.trim())}
              >
                تشغيل للجميع
              </button>
              {room.musicUrl ? (
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void save('')}>
                  إيقاف الموسيقى
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <p className="tiny muted">صاحب الغرفة أو مديرها فقط يمكنه تغيير الموسيقى.</p>
        )}
      </div>
    </Sheet>
  );
}
