import { useMemo, useState } from 'react';
import { Sheet } from '../lib/ui';
import { useI18n } from '../lib/i18n';
import { countryFlag, countryName, findCountry, flagOf, searchCountries } from '../lib/countries';

interface CountryPickerProps {
  /** Stored value: ISO code, or a legacy free-text country name. */
  value: string | null | undefined;
  /** Emits the ISO code of the chosen country. */
  onChange: (code: string) => void;
  label?: string;
  placeholder?: string;
}

/**
 * Country field with the full flag list: shows flag + name + code, and the sheet
 * filters by Arabic/English name, ISO code or dialling code.
 */
export function CountryPicker({ value, onChange, label, placeholder }: CountryPickerProps) {
  const { lang, t } = useI18n();
  const ar = lang === 'ar';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = findCountry(value);
  const rows = useMemo(() => searchCountries(query), [query]);
  const title = label ?? t('country');

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <div className="field">
        {label ? <label>{label}</label> : null}
        <button type="button" className="input country-field" onClick={() => setOpen(true)}>
          <span className="country-flag">{selected ? flagOf(selected.code) : '🌐'}</span>
          <span className="country-field-name">
            {selected ? countryName(selected.code, lang) : placeholder ?? (ar ? 'اختر الدولة' : 'Choose a country')}
          </span>
          {selected ? (
            <span className="country-code" dir="ltr">
              {selected.code} · {selected.dial}
            </span>
          ) : null}
        </button>
      </div>

      <Sheet open={open} onClose={close} title={title}>
        <input
          className="input country-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={ar ? 'ابحث بالاسم أو الرمز…' : 'Search by name or code…'}
        />
        <div className="country-list">
          {rows.length === 0 ? (
            <p className="tiny muted center">{ar ? 'لا توجد نتائج' : 'No results'}</p>
          ) : null}
          {rows.map((item) => (
            <button
              key={item.code}
              type="button"
              className={`country-row${item.code === selected?.code ? ' active' : ''}`}
              onClick={() => {
                onChange(item.code);
                close();
              }}
            >
              <span className="country-flag">{flagOf(item.code)}</span>
              <span className="country-row-name">{ar ? item.ar : item.en}</span>
              <span className="country-row-code" dir="ltr">
                {item.code}
              </span>
              <span className="country-row-dial" dir="ltr">
                {item.dial}
              </span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

/** Inline flag + name for places that only display a stored country. */
export function CountryLabel({ value, className }: { value: string | null | undefined; className?: string }) {
  const { lang } = useI18n();
  const name = countryName(value, lang);
  if (!name) return null;
  return (
    <span className={className}>
      {countryFlag(value)} {name}
    </span>
  );
}
