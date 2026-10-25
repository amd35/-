import { useAuth } from '../lib/store.jsx'
import { useI18n } from '../lib/i18n.jsx'

export default function Games() {
  const { meta } = useAuth()
  const { t } = useI18n()
  const enabled = meta?.games_enabled || { ludo: false, domino: false }

  const games = [
    {
      key: 'ludo',
      name: 'لودو',
      icon: '🎲',
      lines: ['إنشاء غرفة لعبة والانضمام إليها', 'رمي النرد والتحقق من الحركات على الخادم', 'إدارة الأدوار والنتيجة'],
    },
    {
      key: 'domino',
      name: 'دومينو',
      icon: '🁫',
      lines: ['طاولات دومينو متعددة اللاعبين', 'توزيع القطع وإدارة الأدوار', 'احتساب النتائج وإنهاء المباراة'],
    },
  ]

  return (
    <div>
      <h1 className="page-title">{t('games')}</h1>
      <p className="notice" data-testid="games-notice">
        {t('gamesNote')} — {t('comingSoon')}
      </p>
      <div className="grid-two" style={{ marginTop: 12 }}>
        {games.map((game) => (
          <div className="card glass" key={game.key} data-testid={`game-${game.key}`}>
            <div className="row-between">
              <strong>
                {game.icon} {game.name}
              </strong>
              <span className="status-pill status-pending">{enabled[game.key] ? t('online') : t('comingSoon')}</span>
            </div>
            <ul className="muted" style={{ margin: '10px 0 0', paddingInlineStart: 18 }}>
              {game.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button type="button" className="btn btn-block" style={{ marginTop: 12 }} disabled>
              {t('comingSoon')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
