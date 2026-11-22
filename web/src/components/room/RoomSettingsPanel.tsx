import { useEffect, useState } from 'react';
import { Sheet } from '../../lib/ui';
import { ROOM_BACKGROUNDS } from './RoomBackdrop';
import type { RoomData } from './types';

export interface RoomSettingsPatch {
  background?: string;
  musicUrl?: string;
  country?: string;
  language?: string;
}

/** Stage settings for the owner / room management. */
export function RoomSettingsPanel({
  open,
  onClose,
  room,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  room: RoomData;
  onSave: (patch: RoomSettingsPatch) => Promise<void>;
}) {
  const [background, setBackground] = useState(room.background);
  const [custom, setCustom] = useState('');
  const [country, setCountry] = useState(room.country);
  const [language, setLanguage] = useState(room.language);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBackground(room.background);
    setCustom(/^(https?:\/\/|\/uploads\/)/i.test(room.background) ? room.background : '');
    setCountry(room.country);
    setLanguage(room.language);
  }, [open, room]);

  const save = async () => {
    setBusy(true);
    try {
      await onSave({
        background: custom.trim() || background,
        country: country.trim() || 'العراق',
        language: language.trim() || 'العربية',
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="إعدادات الغرفة">
      <div className="room-settings">
        <label className="room-field-label">الخلفية المتحركة</label>
        <div className="room-bg-picker">
          {ROOM_BACKGROUNDS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`room-bg-option bg-${item.id}${!custom && background === item.id ? ' on' : ''}`}
              onClick={() => {
                setBackground(item.id);
                setCustom('');
              }}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <label className="room-field-label">خلفية مخصّصة (صورة أو فيديو)</label>
        <input
          className="input"
          dir="ltr"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          placeholder="/uploads/background.mp4"
        />
        <p className="tiny muted" style={{ margin: 0 }}>
          الخلفيات المرفوعة من لوحة الإدارة تعمل هنا أيضاً.
        </p>

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

        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : 'حفظ إعدادات الغرفة'}
        </button>
      </div>
    </Sheet>
  );
}
