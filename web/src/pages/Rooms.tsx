import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, assetUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { EmptyState, Icon, Spinner, useToast } from '../lib/ui';
import { AppShell } from '../components/AppShell';

export interface RoomItem {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  micCount: number;
  occupied: number;
}

export default function Rooms() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await api<{ rooms: RoomItem[] }>('/rooms');
      setRooms(response.rooms);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell title={t('roomsTitle')} subtitle={t('roomsSub')} active="home">
      <div className="page">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : rooms.length === 0 ? (
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
                  <span className="room-name">{room.name}</span>
                  <span className="tiny muted room-desc">{room.description}</span>
                  <span className="room-meta">
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
      </div>
    </AppShell>
  );
}
