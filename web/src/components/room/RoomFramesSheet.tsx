import { useEffect, useMemo, useState } from 'react';
import { api, assetUrl } from '../../lib/api';
import { Icon, Sheet, Spinner, formatCoins, useToast } from '../../lib/ui';

/** One frame the administration published for the rooms. */
export interface RoomFrameItem {
  id: string;
  name: string;
  nameEn: string;
  imageUrl: string;
  price: number;
  sortOrder: number;
}

/** A frame that is currently worn by a member of the room. */
export interface WornFrame {
  userId: string;
  frameId: string;
  name: string;
  imageUrl: string;
  expiresAt: string;
  /** Server-computed time left; the client never shows it. */
  remainingMs: number;
}

export interface FrameRecipient {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Frame gifting inside a voice room — its own sheet, separate from the gift
 * store: pick a frame, pick a member on a mic, confirm, and the server charges
 * the coins and puts the frame around that member's avatar.
 */
export function RoomFramesSheet({
  open,
  onClose,
  roomId,
  members,
  meId,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
  members: FrameRecipient[];
  meId: string | null;
  onSent: (frame: WornFrame) => void;
}) {
  const toast = useToast();
  const [frames, setFrames] = useState<RoomFrameItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [picked, setPicked] = useState<RoomFrameItem | null>(null);
  const [recipientId, setRecipientId] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setRecipientId('');
    setConfirming(false);
    setLoading(true);
    api<{ frames: RoomFrameItem[]; balance: number }>(`/rooms/${roomId}/frames`)
      .then((response) => {
        setFrames(response.frames);
        setBalance(response.balance);
      })
      .catch((error: Error) => toast.push(error.message, 'error'))
      .finally(() => setLoading(false));
  }, [open, roomId, toast]);

  const recipient = useMemo(() => members.find((member) => member.id === recipientId) ?? null, [members, recipientId]);

  const send = async () => {
    if (!picked || !recipient || sending) return;
    if (balance < picked.price) {
      toast.push('رصيدك من الكونز غير كافٍ', 'error');
      return;
    }
    setSending(true);
    try {
      const response = await api<{ frame: WornFrame }>(`/rooms/${roomId}/frames/send`, {
        method: 'POST',
        body: { frameId: picked.id, recipientId: recipient.id, requestId: newRequestId() },
      });
      onSent(response.frame);
      setBalance((current) => current - picked.price);
      toast.push('تم إرسال الإطار', 'success');
      setPicked(null);
      setRecipientId('');
      setConfirming(false);
      onClose();
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  const title = picked && !confirming ? 'اختر المستلم' : 'الإطار';

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="room-frames-sheet">
        <div className="room-frames-head">
          <span className="tiny muted">{picked ? picked.name : 'أرسل إطاراً لعضو في الغرفة'}</span>
          <span className="spacer" />
          <span className="pill pill-gold">
            <Icon name="coins" size={13} /> {formatCoins(balance)}
          </span>
        </div>

        {loading ? (
          <Spinner label="جارٍ التحميل" />
        ) : picked && confirming && recipient ? (
          <div className="room-frame-confirm">
            <span className="room-frame-confirm-avatar">
              {recipient.avatarUrl ? <img src={assetUrl(recipient.avatarUrl)} alt="" /> : recipient.displayName.charAt(0)}
            </span>
            <p className="room-frame-confirm-text">
              إرسال <b>{picked.name}</b> إلى <b>{recipient.displayName}</b>؟
            </p>
            <span className="pill pill-gold">
              <Icon name="coins" size={13} /> {formatCoins(picked.price)}
            </span>
            <div className="room-frame-confirm-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirming(false)}
                disabled={sending}
              >
                رجوع
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void send()} disabled={sending}>
                {sending ? <span className="spinner" /> : <Icon name="send" size={14} />} تأكيد الإرسال
              </button>
            </div>
          </div>
        ) : picked ? (
          <>
            <div className="room-frame-people">
              {members.length === 0 ? (
                <p className="tiny muted center">لا يوجد أعضاء على المايكات</p>
              ) : (
                members.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    className={`room-gift-person ${recipientId === member.id ? 'active' : ''}`}
                    onClick={() => {
                      setRecipientId(member.id);
                      setConfirming(true);
                    }}
                  >
                    <span className="room-gift-avatar">
                      {member.avatarUrl ? (
                        <img src={assetUrl(member.avatarUrl)} alt="" />
                      ) : (
                        member.displayName.charAt(0)
                      )}
                    </span>
                    <span>
                      {member.displayName}
                      {member.id === meId ? ' (أنت)' : ''}
                    </span>
                  </button>
                ))
              )}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(null)}>
              <Icon name="arrowLeft" size={14} /> رجوع للإطارات
            </button>
          </>
        ) : frames.length === 0 ? (
          <div className="empty">
            <Icon name="sparkle" size={22} />
            <span className="tiny">لا توجد إطارات متاحة حالياً</span>
          </div>
        ) : (
          <div className="room-frames-grid">
            {frames.map((frame) => (
              <div key={frame.id} className="room-frame-card">
                <span className="room-frame-preview">
                  <img className="room-frame-preview-art" src={assetUrl(frame.imageUrl)} alt="" />
                  <span className="room-frame-preview-avatar" />
                </span>
                <span className="room-frame-name">{frame.name}</span>
                <span className="room-frame-price">
                  <Icon name="coins" size={12} /> {formatCoins(frame.price)}
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm btn-block"
                  onClick={() => {
                    setPicked(frame);
                    setRecipientId('');
                    setConfirming(false);
                  }}
                >
                  <Icon name="send" size={14} /> إرسال
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
