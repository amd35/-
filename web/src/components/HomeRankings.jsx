import Avatar from './Avatar.jsx'
import PhotoIcon from './PhotoIcon.jsx'
import { useI18n } from '../lib/i18n.jsx'

/**
 * لوحات الترتيب الثلاث: العشاق (هدايا مُستلمة) · الشرف (نقاط رويال) · اللاعبين (نقاط الخبرة).
 * كل صورة عضو حقيقي من الخادم وتُفتح في بطاقته — ولا رقم مكتوب في الواجهة.
 */
// الترتيب هنا معكوس عن ترتيب القراءة العربية لأن التصميم يضع «العشاق» في أقصى اليسار.
const BOARDS = [
  { key: 'players', icon: 'trophy', labelKey: 'rankPlayers' },
  { key: 'honor', icon: 'crown', labelKey: 'rankHonor' },
  { key: 'lovers', icon: 'rose', labelKey: 'rankLovers' },
]

export default function HomeRankings({ rankings, onOpenUser }) {
  const { t } = useI18n()

  return (
    <section className="home-ranks" data-testid="home-rankings">
      {BOARDS.map((board) => {
        const rows = rankings?.[board.key] || []
        return (
          <article className="home-rank" key={board.key} data-testid={`home-rank-${board.key}`}>
            <header className="home-rank-head">
              <PhotoIcon name={board.icon} size={16} />
              <span>{t(board.labelKey)}</span>
            </header>
            <div className="home-rank-list">
              {rows.length === 0 ? <span className="home-rank-empty">—</span> : null}
              {rows.map((entry, index) => (
                <button
                  type="button"
                  className="home-rank-user"
                  key={entry.id}
                  onClick={() => onOpenUser(entry)}
                  data-testid={`home-rank-${board.key}-${index + 1}`}
                >
                  <Avatar user={entry} size={34} />
                  <span className="home-rank-badge">{`TOP ${index + 1}`}</span>
                </button>
              ))}
            </div>
          </article>
        )
      })}
    </section>
  )
}
