import PhotoIcon from './PhotoIcon.jsx'
import RoomMemberList from './RoomMemberList.jsx'
import { useI18n } from '../lib/i18n.jsx'

/**
 * أدوات الغرفة: تُفتح من الشريط السفلي (أدوات) أو من زر الأعضاء في الهيدر.
 * تجمع ما كان أسفل صفحة الغرفة (الأعضاء، القوانين، خلفيات المالك، قائمة المحظورين، والمشاركة)
 * في لوحة واحدة، فيبقى ترتيب الغرفة مطابقًا للتصميم دون حذف أي وظيفة.
 */
export default function RoomToolsSheet({
  room,
  me,
  isOwner,
  canBan,
  backgroundName,
  onClose,
  onSelectMember,
  onOpenBackgrounds,
  onOpenBans,
  onShare,
}) {
  const { t } = useI18n()

  return (
    <div className="overlay" data-testid="room-tools-sheet" onClick={onClose}>
      <div className="glass sheet stack room-tools" onClick={(event) => event.stopPropagation()}>
        <div className="row-between">
          <h3 className="section-title" style={{ margin: 0 }}>
            <PhotoIcon name="palette" size={18} /> {t('roomToolsTitle')}
          </h3>
          <button type="button" className="btn" data-testid="close-tools" onClick={onClose}>
            {t('close')}
          </button>
        </div>

        {isOwner ? (
          <button type="button" className="btn" data-testid="open-backgrounds" onClick={onOpenBackgrounds}>
            <PhotoIcon name="palette" size={16} /> {t('roomBackgrounds')}
            <span className="muted"> · {backgroundName}</span>
          </button>
        ) : null}

        {canBan ? (
          <button type="button" className="btn" data-testid="toggle-bans" onClick={onOpenBans}>
            <PhotoIcon name="lock" size={16} /> {t('banList')}
          </button>
        ) : null}

        <button type="button" className="btn" data-testid="tools-share" onClick={onShare}>
          <PhotoIcon name="party" size={16} /> {t('shareRoom')}
        </button>

        {room.rules ? (
          <div>
            <h4 className="section-title room-section-title" style={{ marginBottom: 6 }}>
              {t('rules')}
            </h4>
            <ul className="rules-list">
              {room.rules.split('\n').map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <RoomMemberList room={room} me={me} onSelect={onSelectMember} />
      </div>
    </div>
  )
}
