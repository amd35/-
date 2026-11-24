import { useState } from 'react';
import { Icon } from '../../lib/ui';

/** The stage dock: five main controls, with invite/members/music behind "more". */
export function RoomBottomBar({
  onLeave,
  onInvite,
  onMembers,
  onMusic,
  onChat,
  onGifts,
  onFrames,
  onUpgrade,
  onMics,
  onMic,
  micOn,
  micMuted,
  chatOpen,
}: {
  onLeave: () => void;
  onInvite: () => void;
  onMembers: () => void;
  onMusic: () => void;
  onChat: () => void;
  onGifts: () => void;
  onFrames: () => void;
  onUpgrade: () => void;
  onMics: () => void;
  onMic: () => void;
  micOn: boolean;
  micMuted: boolean;
  chatOpen: boolean;
}) {
  const [more, setMore] = useState(false);
  const pick = (action: () => void) => () => {
    setMore(false);
    action();
  };

  return (
    <>
      {more ? (
        <>
          <button type="button" className="room-more-backdrop" onClick={() => setMore(false)} aria-label="إغلاق" />
          <div className="room-more-sheet" role="dialog" aria-label="أدوات الغرفة">
            <button type="button" onClick={pick(onUpgrade)}>
              <Icon name="sparkle" size={18} />
              <span>ترقية الغرفة</span>
            </button>
            <button type="button" onClick={pick(onMics)}>
              <Icon name="mic" size={18} />
              <span>تبديل المايكات</span>
            </button>
            <button type="button" onClick={pick(onFrames)}>
              <Icon name="frame" size={18} />
              <span>الإطار</span>
            </button>
            <button type="button" onClick={pick(onInvite)}>
              <Icon name="plus" size={18} />
              <span>دعوة الأصدقاء</span>
            </button>
            <button type="button" onClick={pick(onMembers)}>
              <Icon name="users" size={18} />
              <span>الأعضاء</span>
            </button>
            <button type="button" onClick={pick(onMusic)}>
              <Icon name="volume" size={18} />
              <span>الموسيقى</span>
            </button>
          </div>
        </>
      ) : null}

      <nav className="room-bar" aria-label="أزرار الغرفة">
        <button type="button" className="room-bar-btn danger" onClick={onLeave}>
          <Icon name="logout" size={19} />
          <span>مغادرة</span>
        </button>
        <button type="button" className="room-bar-btn gold" onClick={onGifts}>
          <Icon name="gift" size={19} />
          <span>الهدايا</span>
        </button>
        <button type="button" className={`room-bar-btn mic-main${micOn ? ' on' : ''}`} onClick={onMic}>
          <span className="room-mic-orb">
            <svg className="room-mic-wings" viewBox="0 0 140 60" aria-hidden="true">
              <defs>
                <linearGradient id="room-mic-wing-gold" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#8a5206" />
                  <stop offset="55%" stopColor="#ffd24a" />
                  <stop offset="100%" stopColor="#fff3c2" />
                </linearGradient>
              </defs>
              {[0, 1].map((side) => (
                <g
                  key={side}
                  transform={side ? 'translate(140 0) scale(-1 1)' : undefined}
                  fill="url(#room-mic-wing-gold)"
                  stroke="#7a4d0a"
                  strokeWidth="0.5"
                >
                  <path d="M64 32 C 52 28 40 20 28 8 C 38 22 48 30 60 34 Z" />
                  <path d="M62 37 C 48 36 34 30 20 18 C 34 32 48 40 60 41 Z" />
                  <path d="M60 41 C 46 43 30 39 16 30 C 30 42 46 48 59 45 Z" />
                </g>
              ))}
            </svg>
            <Icon name={micOn && !micMuted ? 'mic' : 'micOff'} size={22} />
          </span>
          <span>{micOn && micMuted ? 'مكتوم' : 'المايك'}</span>
        </button>
        <button type="button" className={`room-bar-btn${chatOpen ? ' on' : ''}`} onClick={onChat}>
          <Icon name="chat" size={19} />
          <span>الدردشة</span>
        </button>
        <button type="button" className={`room-bar-btn${more ? ' on' : ''}`} onClick={() => setMore((value) => !value)}>
          <span className="room-more-dots" aria-hidden="true">⋯</span>
          <span>المزيد</span>
        </button>
      </nav>
    </>
  );
}
