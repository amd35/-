import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useRealtime } from '../lib/realtime';
import { Avatar, Icon, Spinner, useToast } from '../lib/ui';
import { AppShell } from '../components/AppShell';
import type { FrameInfo } from '../components/AvatarFrame';

interface SeatUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  online: boolean;
  frame: FrameInfo | null;
}

interface Mic {
  id: string;
  position: number;
  label: string;
  kind: string;
  isLocked: boolean;
  mine: boolean;
  user: SeatUser | null;
}

interface RoomData {
  id: string;
  name: string;
  description: string;
  coverUrl: string | null;
  rules: string;
  mics: Mic[];
}

export default function Room() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const { on } = useRealtime();
  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyMic, setBusyMic] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await api<{ room: RoomData }>(`/rooms/${id}`);
      setRoom(response.room);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Seats move when anyone takes or leaves one, and when the admin edits the room.
  useEffect(() => {
    const off = on('room', (data) => {
      if (data.roomId === id) void load();
    });
    return off;
  }, [on, id, load]);

  const act = async (mic: Mic) => {
    if (busyMic) return;
    if (mic.user && !mic.mine) {
      toast.push(t('micBusy'), 'error');
      return;
    }
    if (!mic.user && mic.isLocked) {
      toast.push(t('micLocked'), 'error');
      return;
    }
    setBusyMic(mic.id);
    try {
      const action = mic.mine ? 'leave' : 'take';
      const response = await api<{ room: RoomData }>(`/rooms/${id}/mics/${mic.id}/${action}`, {
        method: 'POST',
      });
      setRoom(response.room);
      toast.push(mic.mine ? t('micLeft') : t('micJoined'), 'success');
    } catch (error) {
      const code = (error as { code?: string }).code;
      toast.push(
        code === 'mic_locked' ? t('micLocked') : code === 'mic_taken' ? t('micBusy') : (error as Error).message,
        'error'
      );
      void load();
    } finally {
      setBusyMic(null);
    }
  };

  const occupied = room?.mics.filter((mic) => mic.user).length ?? 0;

  return (
    <AppShell
      title={room?.name ?? t('roomsTitle')}
      subtitle={room?.description || t('roomsSub')}
      active="home"
      right={
        <button className="icon-btn plain" onClick={() => navigate('/rooms')} aria-label={t('back')}>
          <Icon name="arrowLeft" size={18} />
        </button>
      }
    >
      <div className="page">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : room ? (
          <>
            <section className="card">
              <div className="section-head">
                <h2 style={{ fontSize: 16 }}>{t('roomMics')}</h2>
                <span className="tiny muted">
                  {occupied} / {room.mics.length}
                </span>
              </div>

              {room.mics.length === 0 ? (
                <p className="tiny muted center">{t('roomNoMics')}</p>
              ) : (
                <div className="mic-grid">
                  {room.mics.map((mic) => (
                    <button
                      key={mic.id}
                      type="button"
                      className={`mic-seat ${mic.user ? 'taken' : ''} ${mic.mine ? 'mine' : ''}`}
                      onClick={() => void act(mic)}
                      disabled={busyMic === mic.id}
                    >
                      <span className="mic-slot">
                        {mic.user ? (
                          <Avatar
                            user={{
                              displayName: mic.user.displayName,
                              avatarUrl: mic.user.avatarUrl,
                              online: mic.user.online,
                              frame: mic.user.frame,
                            }}
                            size={62}
                          />
                        ) : (
                          <span className="mic-empty">
                            <Icon name={mic.isLocked ? 'lock' : 'mic'} size={22} />
                          </span>
                        )}
                        {mic.kind === 'host' ? <span className="mic-crown">👑</span> : null}
                      </span>
                      <span className="mic-name">
                        {mic.user ? mic.user.displayName : mic.isLocked ? t('micLocked') : t('micFree')}
                      </span>
                      <span className="mic-label">
                        {mic.mine ? t('leaveMic') : mic.label || `${t('mic')} ${mic.position}`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {room.rules ? (
              <section className="card">
                <div className="section-head">
                  <h2 style={{ fontSize: 15 }}>{t('roomRules')}</h2>
                </div>
                <p className="muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                  {room.rules}
                </p>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
