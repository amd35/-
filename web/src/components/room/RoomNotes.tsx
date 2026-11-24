import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatTimeAgo } from '../../lib/ui';

interface NoteUpgrade {
  name: string;
  price: number;
  at: string;
}

interface NoteGift {
  id: string;
  name: string;
  quantity: number;
  coins: number;
  currency: string;
  sender: string;
  recipient: string;
  at: string;
}

interface NotesData {
  upgrades: NoteUpgrade[];
  gifts: NoteGift[];
}

/**
 * ملاحظات الغرفة: الترقيات التي اشترتها الغرفة والهدايا التي أُرسلت داخلها.
 * The API answers 403 for a visitor, so only joined members read the notes.
 */
export function RoomNotes({ roomId }: { roomId: string }) {
  const [data, setData] = useState<NotesData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api<NotesData>(`/rooms/${roomId}/notes`)
      .then((response) => {
        if (alive) setData(response);
      })
      .catch((fetchError: Error) => {
        if (alive) setError(fetchError.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [roomId]);

  if (loading) return <p className="tiny muted center">جارٍ تحميل الملاحظات…</p>;
  if (error) return <p className="room-settings-error">{error}</p>;
  if (!data) return null;

  return (
    <div className="room-notes">
      <p className="room-panel-head">الترقيات ({data.upgrades.length})</p>
      {data.upgrades.length === 0 ? (
        <p className="tiny muted center">لا توجد ترقيات بعد</p>
      ) : (
        data.upgrades.map((upgrade) => (
          <div key={`${upgrade.name}-${upgrade.at}`} className="room-note-row">
            <span className="room-note-icon" aria-hidden="true">
              ⬆
            </span>
            <span className="room-note-copy">
              <b>ترقية {upgrade.name}</b>
              <span className="tiny muted">{formatTimeAgo(upgrade.at, 'ar')}</span>
            </span>
            {upgrade.price > 0 ? <span className="room-note-amount">{upgrade.price} 💎</span> : null}
          </div>
        ))
      )}

      <p className="room-panel-head">الهدايا ({data.gifts.length})</p>
      {data.gifts.length === 0 ? (
        <p className="tiny muted center">لا توجد هدايا أُرسلت في الغرفة بعد</p>
      ) : (
        data.gifts.map((gift) => (
          <div key={gift.id} className="room-note-row">
            <span className="room-note-icon" aria-hidden="true">
              🎁
            </span>
            <span className="room-note-copy">
              <b>
                {gift.name}
                {gift.quantity > 1 ? ` × ${gift.quantity}` : ''}
              </b>
              <span className="tiny muted">
                من {gift.sender || 'مستخدم'} إلى {gift.recipient || 'مستخدم'} —{' '}
                {formatTimeAgo(gift.at, 'ar')}
              </span>
            </span>
            {gift.coins > 0 ? (
              <span className="room-note-amount">
                {gift.coins} {gift.currency === 'diamond' ? '💎' : '🪙'}
              </span>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
