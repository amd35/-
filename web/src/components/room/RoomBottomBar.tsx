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
