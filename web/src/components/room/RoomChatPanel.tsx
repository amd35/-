import { useEffect, useRef, useState } from 'react';
import { Avatar, Icon, Sheet } from '../../lib/ui';
import { RankBadge } from '../RankBadge';
import { ADMIN_BADGE_BY_RANK } from '../AdminRoyal';
import type { RoomMessageData } from './types';

/** The room's live text chat: avatars, ranks, admin badges and message moderation. */
export function RoomChatPanel({
  open,
  onClose,
  messages,
  meId,
  canModerate,
  canClear,
  sending,
  canAnnounce,
  onSend,
  onDelete,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  messages: RoomMessageData[];
  meId: string | null;
  canModerate: boolean;
  /** Owner or vice-owner: may wipe the whole room chat. */
  canClear: boolean;
  sending: boolean;
  canAnnounce: boolean;
  onSend: (body: string, announcement: boolean) => Promise<boolean>;
  onDelete: (messageId: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, open]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    const ok = await onSend(body, announce);
    if (ok) {
      setDraft('');
      setAnnounce(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="دردشة الغرفة">
      <div className="room-chat-panel">
        {canClear && messages.length > 0 ? (
          <div className="room-chat-tools">
            {confirmClear ? (
              <>
                <button
                  type="button"
                  className="room-chat-clear is-confirm"
                  onClick={() => {
                    setConfirmClear(false);
                    onClear();
                  }}
                >
                  تأكيد المسح
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(false)}>
                  إلغاء
                </button>
              </>
            ) : (
              <button type="button" className="room-chat-clear" onClick={() => setConfirmClear(true)}>
                <Icon name="trash" size={12} /> مسح الرسائل
              </button>
            )}
          </div>
        ) : null}
        <div className="room-chat-list" ref={listRef}>
          {messages.length === 0 ? <p className="tiny muted center">لا توجد رسائل بعد</p> : null}
          {messages.map((message) => {
            const isAdmin = Boolean(message.rank && ADMIN_BADGE_BY_RANK[message.rank.key]);
            return (
              <div
                key={message.id}
                className={`room-chat-row${message.userId === meId ? ' mine' : ''}${
                  isAdmin ? ' room-msg-admin' : ''
                }${message.isAnnouncement ? ' room-msg-announce' : ''}`}
              >
                <Avatar user={{ displayName: message.displayName, avatarUrl: message.avatarUrl }} size={30} />
                <div className="room-chat-copy">
                  <span className="room-chat-name">
                    {message.rank ? <RankBadge rank={message.rank} size={12} /> : null}
                    {message.displayName}
                    {message.isAnnouncement ? <span className="admin-announce-tag">إعلان إداري</span> : null}
                  </span>
                  <span className={`room-chat-text${message.gift ? ' gift' : ''}`}>
                    {message.gift ? <Icon name="gift" size={12} /> : null}
                    {message.body}
                  </span>
                </div>
                {canModerate ? (
                  <button
                    type="button"
                    className="room-chat-del"
                    onClick={() => onDelete(message.id)}
                    aria-label="حذف الرسالة"
                  >
                    <Icon name="trash" size={13} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="room-chat-compose">
          <input
            className="room-input"
            value={draft}
            maxLength={500}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void send();
            }}
            placeholder="اكتب رسالتك هنا…"
          />
          {canAnnounce ? (
            <button
              type="button"
              className={`icon-btn plain room-announce-btn${announce ? ' on' : ''}`}
              onClick={() => setAnnounce((value) => !value)}
              aria-label="إعلان إداري"
              title="إرسال كإعلان إداري"
            >
              <Icon name="bell" size={17} />
            </button>
          ) : null}
          <button
            type="button"
            className="icon-btn plain"
            onClick={() => void send()}
            disabled={!draft.trim() || sending}
            aria-label="إرسال"
          >
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
    </Sheet>
  );
}
