import { Icon } from '../../lib/ui';

/** The seven stage controls, in the room's official order. */
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
  return (
    <nav className="room-bar" aria-label="أزرار الغرفة">
      <button type="button" className="room-bar-btn danger" onClick={onLeave}>
        <Icon name="logout" size={20} />
        <span>مغادرة</span>
      </button>
      <button type="button" className="room-bar-btn" onClick={onInvite}>
        <Icon name="plus" size={20} />
        <span>دعوة</span>
      </button>
      <button type="button" className="room-bar-btn" onClick={onMembers}>
        <Icon name="users" size={20} />
        <span>الأعضاء</span>
      </button>
      <button type="button" className="room-bar-btn" onClick={onMusic}>
        <Icon name="volume" size={20} />
        <span>الموسيقى</span>
      </button>
      <button type="button" className={`room-bar-btn${chatOpen ? ' on' : ''}`} onClick={onChat}>
        <Icon name="chat" size={20} />
        <span>الدردشة</span>
      </button>
      <button type="button" className="room-bar-btn gold" onClick={onGifts}>
        <Icon name="gift" size={20} />
        <span>الهدايا</span>
      </button>
      <button type="button" className={`room-bar-btn mic${micOn ? ' on' : ''}`} onClick={onMic}>
        <Icon name={micOn && !micMuted ? 'mic' : 'micOff'} size={20} />
        <span>{micOn ? (micMuted ? 'مكتوم' : 'المايك') : 'المايك'}</span>
      </button>
    </nav>
  );
}
