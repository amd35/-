import { useEffect, useRef, useState } from 'react';
import { Avatar, Icon, Sheet } from '../../lib/ui';
import { GAME_EMOJIS, type GameMessage, type GamePlayer } from '../../lib/gameTypes';

interface Props {
  open: boolean;
  onClose: () => void;
  messages: GameMessage[];
  meId: string;
  players: GamePlayer[];
  onSendText: (body: string) => Promise<void> | void;
  onSendEmoji: (emoji: string) => Promise<void> | void;
  onReport: () => void;
}

/** In-match chat: text, emoji bar and a report shortcut. */
export function GameChat({ open, onClose, messages, meId, players, onSendText, onSendEmoji, onReport }: Props) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length, open]);

  const nameOf = (userId: string) =>
    players.find((player) => player.userId === userId)?.displayName ?? 'لاعب';

  const submit = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    await onSendText(body);
  };

  return (
    <Sheet open={open} onClose={onClose} title="دردشة المباراة">
      <div className="game-chat" dir="rtl">
        <div className="game-chat-list" ref={listRef}>
          {messages.length === 0 ? (
            <p className="game-chat-empty">لا رسائل بعد — قل مرحباً لمنافسك 👋</p>
          ) : (
            messages.map((message) => {
              const mine = message.userId === meId;
              const player = players.find((entry) => entry.userId === message.userId);
              return (
                <div key={message.id} className={`game-chat-row ${mine ? 'mine' : ''}`}>
                  {mine ? null : <Avatar user={player ?? null} size={26} />}
                  <div className={`game-chat-bubble ${message.kind === 'emoji' ? 'emoji' : ''}`}>
                    {message.kind === 'emoji' ? (
                      <span className="game-chat-emoji">{message.body}</span>
                    ) : (
                      <span>{message.body}</span>
                    )}
                    <span className="game-chat-meta">
                      {nameOf(message.userId)} •{' '}
                      {new Date(message.createdAt).toLocaleTimeString('ar-IQ', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="game-emoji-row">
          {GAME_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" className="game-emoji" onClick={() => void onSendEmoji(emoji)}>
              {emoji}
            </button>
          ))}
        </div>

        <div className="game-chat-input">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
            maxLength={200}
            placeholder="اكتب رسالة…"
          />
          <button type="button" className="btn btn-gold game-chat-send" onClick={() => void submit()}>
            <Icon name="send" size={16} />
          </button>
        </div>

        <button type="button" className="game-chat-report" onClick={onReport}>
          <Icon name="alert" size={14} /> الإبلاغ عن منافس مسيء
        </button>
      </div>
    </Sheet>
  );
}
