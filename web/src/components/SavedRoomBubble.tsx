import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, assetUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/ui';

interface SavedRoom {
  id: string;
  name: string;
  coverUrl: string | null;
  avatarUrl: string | null;
  saved?: boolean;
}

/**
 * The round bubble of the room pinned with «حفظ الغرفة» in the stage: it hangs
 * over the app and one tap drops the user back into the room.
 */
export function SavedRoomBubble() {
  const navigate = useNavigate();
  const location = useLocation();
  const { me } = useAuth();
  const toast = useToast();
  const [room, setRoom] = useState<SavedRoom | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!me) {
      setRoom(null);
      return;
    }
    try {
      const response = await api<{ rooms: SavedRoom[] }>('/rooms');
      setRoom(response.rooms.find((item) => item.saved) ?? null);
    } catch {
      // The bubble is a shortcut only; it must never block a page.
    }
  }, [me]);

  useEffect(() => {
    void load();
  }, [load]);

  // The stage tells us the moment a room is saved or released.
  useEffect(() => {
    const reload = () => void load();
    window.addEventListener('rooms:saved', reload);
    return () => window.removeEventListener('rooms:saved', reload);
  }, [load]);

  if (!room || location.pathname === `/rooms/${room.id}`) return null;

  const picture = room.avatarUrl ?? room.coverUrl;

  const unsave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/rooms/${room.id}/save`, { method: 'POST' });
      setRoom(null);
      toast.push('تم إزالة الغرفة المحفوظة', 'info');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Portalled to the body: the page shell keeps a transform from its entrance
  // animation, which would otherwise pin a fixed bubble to the shell's bottom.
  return createPortal(
    <div className="saved-room-bubble">
      <button
        type="button"
        className="saved-room-bubble-main"
        onClick={() => navigate(`/rooms/${room.id}`)}
        aria-label={`العودة إلى ${room.name}`}
      >
        {picture ? <img src={assetUrl(picture)} alt="" /> : <span aria-hidden="true">♛</span>}
      </button>
      <button
        type="button"
        className="saved-room-bubble-close"
        onClick={() => void unsave()}
        aria-label="إزالة حفظ الغرفة"
      >
        ×
      </button>
      <span className="saved-room-bubble-name">{room.name}</span>
    </div>,
    document.body
  );
}
