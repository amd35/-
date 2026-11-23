import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, assetUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { EmptyState, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { AppShell } from '../components/AppShell';

export interface RoomItem {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  micCount: number;
  occupied: number;
  /** Room level 1..100 (from real activity inside the room). */
  level: number;
  mine?: boolean;
}

export default function Rooms() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api<{ rooms: RoomItem[] }>('/rooms');
      setRooms(
        [...response.rooms].sort((a, b) => Number(Boolean(b.mine)) - Number(Boolean(a.mine)))
      );
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const mine = rooms.find((room) => room.mine) ?? null;

  const create = async () => {
    if (saving) return;
    if (name.trim().length < 2) {
      toast.push('اكتب اسم الغرفة', 'error');
      return;
    }
    setSaving(true);
    try {
      const response = await api<{ room: { id: string } }>('/rooms', {
        method: 'POST',
        body: { name: name.trim(), description: description.trim() },
      });
      setFormOpen(false);
      setName('');
      setDescription('');
      toast.push('تم إنشاء غرفتك', 'success');
      navigate(`/rooms/${response.room.id}`);
    } catch (error) {
      const code = (error as { code?: string }).code;
      toast.push(
        code === 'room_exists' ? 'عندك غرفة وحدة فقط — افتحها من القائمة' : (error as Error).message,
        'error'
      );
      void load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title={t('roomsTitle')} subtitle={t('roomsSub')} active="home">
      <div className="page">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : (
          <>
            {!mine ? (
              <button type="button" className="room-card room-create" onClick={() => setFormOpen(true)}>
                <span className="room-cover">
                  <Icon name="plus" size={24} />
                </span>
                <span className="room-main">
                  <span className="room-name">إنشاء غرفتي</span>
                  <span className="tiny muted room-desc">غرفة واحدة لكل مستخدم — 15 مايك</span>
                </span>
                <Icon name="arrowLeft" size={18} />
              </button>
            ) : null}

            {rooms.length === 0 ? (
              <EmptyState icon="mic" title={t('roomsEmpty')} hint={t('roomsEmptyHint')} />
            ) : (
              <section className="stack">
                {rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    className="room-card"
                    onClick={() => navigate(`/rooms/${room.id}`)}
                  >
                    <span
                      className="room-cover"
                      style={room.coverUrl ? { backgroundImage: `url(${assetUrl(room.coverUrl)})` } : undefined}
                    >
                      {room.coverUrl ? null : <Icon name="mic" size={24} />}
                    </span>
                    <span className="room-main">
                      <span className="room-name">
                        {room.name}
                        {room.mine ? <span className="pill pill-pink room-mine-pill">غرفتي</span> : null}
                      </span>
                      <span className="tiny muted room-desc">{room.description}</span>
                      <span className="room-meta">
                        <span className="pill pill-pink room-level-pill">LV {room.level ?? 1}</span>
                        <span className="pill pill-pink">
                          <Icon name="mic" size={12} /> {room.occupied} / {room.micCount}
                        </span>
                      </span>
                    </span>
                    <Icon name="arrowLeft" size={18} />
                  </button>
                ))}
              </section>
            )}
          </>
        )}
      </div>

      <Sheet open={formOpen} onClose={() => setFormOpen(false)} title="إنشاء غرفة">
        <div className="room-settings">
          <label className="room-field-label">اسم الغرفة</label>
          <input
            className="input"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            placeholder="مثال: غرفة الأصدقاء"
          />
          <label className="room-field-label">وصف قصير (اختياري)</label>
          <input
            className="input"
            value={description}
            maxLength={160}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="شنو راح يصير بهذي الغرفة؟"
          />
          <p className="tiny muted" style={{ margin: 0 }}>
            كل مستخدم يمكنه إنشاء غرفة واحدة فقط، وتظهر باسم «غرفتي» في القائمة.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => void create()} disabled={saving}>
            {saving ? 'جارٍ الإنشاء…' : 'إنشاء الغرفة'}
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}
