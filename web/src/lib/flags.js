/**
 * الدول وأعلامها الحقيقية (صور فوتوغرافية بترخيص حر في `web/public/img/flags`،
 * والتراخيص والمصادر في `flags/CREDITS.md`).
 *
 * الترتيب هو ترتيب صف الأعلام في التصميم أولاً، ثم بقية الدول العربية — والعدّاد
 * الظاهر في الصفحة الرئيسية يأتي من الخادم (عدد الأعضاء الحقيقيين في كل دولة).
 */
export const COUNTRIES = [
  { code: 'AE', ar: 'الإمارات', en: 'UAE' },
  { code: 'KW', ar: 'الكويت', en: 'Kuwait' },
  { code: 'QA', ar: 'قطر', en: 'Qatar' },
  { code: 'BH', ar: 'البحرين', en: 'Bahrain' },
  { code: 'OM', ar: 'عُمان', en: 'Oman' },
  { code: 'MA', ar: 'المغرب', en: 'Morocco' },
  { code: 'TN', ar: 'تونس', en: 'Tunisia' },
  { code: 'LY', ar: 'ليبيا', en: 'Libya' },
  { code: 'IQ', ar: 'العراق', en: 'Iraq' },
  { code: 'SA', ar: 'السعودية', en: 'Saudi Arabia' },
  { code: 'EG', ar: 'مصر', en: 'Egypt' },
  { code: 'JO', ar: 'الأردن', en: 'Jordan' },
  { code: 'LB', ar: 'لبنان', en: 'Lebanon' },
  { code: 'SY', ar: 'سوريا', en: 'Syria' },
  { code: 'YE', ar: 'اليمن', en: 'Yemen' },
  { code: 'PS', ar: 'فلسطين', en: 'Palestine' },
  { code: 'SD', ar: 'السودان', en: 'Sudan' },
  { code: 'DZ', ar: 'الجزائر', en: 'Algeria' },
  { code: 'MR', ar: 'موريتانيا', en: 'Mauritania' },
  { code: 'SO', ar: 'الصومال', en: 'Somalia' },
  { code: 'DJ', ar: 'جيبوتي', en: 'Djibouti' },
  { code: 'KM', ar: 'جزر القمر', en: 'Comoros' },
]

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]))

/** رمز الدولة كما يأتي من الخادم بحرفين كبيرين، أو '' إن لم يكن معروفاً. */
export function countryCode(value = '') {
  return BY_CODE.has(String(value).toUpperCase()) ? String(value).toUpperCase() : ''
}

/** رابط علم الدولة، أو '' إن لم تكن الدولة ضمن القائمة (فنعرض الرمز النصي). */
export function flagUrl(value = '') {
  const code = countryCode(value)
  return code ? `/img/flags/${code}.png` : ''
}

export function countryName(value = '', lang = 'ar') {
  const code = countryCode(value)
  if (!code) return ''
  const country = BY_CODE.get(code)
  return lang === 'ar' ? country.ar : country.en
}
