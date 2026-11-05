import { useI18n } from '../lib/i18n.jsx'
import { COUNTRIES, countryName, flagUrl } from '../lib/flags.js'

/**
 * صف الأعلام: زر التصفية في أقصى اليسار ثم أعلام الدول الحقيقية.
 * الزر يبدّل بين «كل الدول» و«الدول التي فيها أعضاء» (وأرقامها من الخادم).
 * الصف نفسه باتجاه LTR حتى يكون ترتيب الأعلام مطابقاً للتصميم من اليسار إلى اليمين.
 */
export default function HomeCountries({ counts, selected, onSelect, showAll, onToggleShowAll }) {
  const { t, lang } = useI18n()
  const visible = COUNTRIES.filter((country) => showAll || counts[country.code])

  return (
    <div className="home-flags" dir="ltr">
      <button
        type="button"
        className={`home-flags-filter${showAll ? ' is-on' : ''}`}
        onClick={onToggleShowAll}
        aria-label={t('filterCountries')}
        title={showAll ? t('countriesAll') : t('countriesWithMembers')}
        data-testid="home-country-filter"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M3 5.5h18l-6.8 7.6v5.4l-4.4-2.4v-3z" fill="currentColor" />
        </svg>
      </button>
      <div className="home-flags-scroll" data-testid="home-flags">
        {visible.length === 0 ? <span className="home-flags-note">{t('notYet')}</span> : null}
        {visible.map((country) => {
          const total = counts[country.code] || 0
          return (
            <button
              type="button"
              key={country.code}
              className={`home-flag${selected === country.code ? ' is-active' : ''}${total ? '' : ' is-empty'}`}
              onClick={() => onSelect(selected === country.code ? '' : country.code)}
              title={`${countryName(country.code, lang)} · ${total}`}
              data-testid={`home-flag-${country.code}`}
            >
              <img src={flagUrl(country.code)} alt={countryName(country.code, lang)} loading="lazy" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
