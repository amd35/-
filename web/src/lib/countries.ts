/**
 * Every country the app offers in its pickers (ISO 3166-1 alpha-2 + dialling code).
 * The ISO code is what gets stored; names and the flag are derived from it, so a
 * room or profile saved as `IQ` reads "🇮🇶 العراق · IQ +964" in either language.
 */
export interface Country {
  /** ISO 3166-1 alpha-2 code — the value stored in the database. */
  code: string;
  /** International dialling code. */
  dial: string;
  ar: string;
  en: string;
}

export const COUNTRIES: Country[] = [
  { code: 'AF', dial: '+93', ar: 'أفغانستان', en: 'Afghanistan' },
  { code: 'AL', dial: '+355', ar: 'ألبانيا', en: 'Albania' },
  { code: 'DZ', dial: '+213', ar: 'الجزائر', en: 'Algeria' },
  { code: 'AD', dial: '+376', ar: 'أندورا', en: 'Andorra' },
  { code: 'AO', dial: '+244', ar: 'أنغولا', en: 'Angola' },
  { code: 'AG', dial: '+1-268', ar: 'أنتيغوا وبربودا', en: 'Antigua and Barbuda' },
  { code: 'AR', dial: '+54', ar: 'الأرجنتين', en: 'Argentina' },
  { code: 'AM', dial: '+374', ar: 'أرمينيا', en: 'Armenia' },
  { code: 'AU', dial: '+61', ar: 'أستراليا', en: 'Australia' },
  { code: 'AT', dial: '+43', ar: 'النمسا', en: 'Austria' },
  { code: 'AZ', dial: '+994', ar: 'أذربيجان', en: 'Azerbaijan' },
  { code: 'BS', dial: '+1-242', ar: 'الباهاما', en: 'Bahamas' },
  { code: 'BH', dial: '+973', ar: 'البحرين', en: 'Bahrain' },
  { code: 'BD', dial: '+880', ar: 'بنغلاديش', en: 'Bangladesh' },
  { code: 'BB', dial: '+1-246', ar: 'بربادوس', en: 'Barbados' },
  { code: 'BY', dial: '+375', ar: 'بيلاروسيا', en: 'Belarus' },
  { code: 'BE', dial: '+32', ar: 'بلجيكا', en: 'Belgium' },
  { code: 'BZ', dial: '+501', ar: 'بليز', en: 'Belize' },
  { code: 'BJ', dial: '+229', ar: 'بنين', en: 'Benin' },
  { code: 'BT', dial: '+975', ar: 'بوتان', en: 'Bhutan' },
  { code: 'BO', dial: '+591', ar: 'بوليفيا', en: 'Bolivia' },
  { code: 'BA', dial: '+387', ar: 'البوسنة والهرسك', en: 'Bosnia and Herzegovina' },
  { code: 'BW', dial: '+267', ar: 'بوتسوانا', en: 'Botswana' },
  { code: 'BR', dial: '+55', ar: 'البرازيل', en: 'Brazil' },
  { code: 'BN', dial: '+673', ar: 'بروناي', en: 'Brunei' },
  { code: 'BG', dial: '+359', ar: 'بلغاريا', en: 'Bulgaria' },
  { code: 'BF', dial: '+226', ar: 'بوركينا فاسو', en: 'Burkina Faso' },
  { code: 'BI', dial: '+257', ar: 'بوروندي', en: 'Burundi' },
  { code: 'CV', dial: '+238', ar: 'الرأس الأخضر', en: 'Cabo Verde' },
  { code: 'KH', dial: '+855', ar: 'كمبوديا', en: 'Cambodia' },
  { code: 'CM', dial: '+237', ar: 'الكاميرون', en: 'Cameroon' },
  { code: 'CA', dial: '+1', ar: 'كندا', en: 'Canada' },
  { code: 'CF', dial: '+236', ar: 'جمهورية أفريقيا الوسطى', en: 'Central African Republic' },
  { code: 'TD', dial: '+235', ar: 'تشاد', en: 'Chad' },
  { code: 'CL', dial: '+56', ar: 'تشيلي', en: 'Chile' },
  { code: 'CN', dial: '+86', ar: 'الصين', en: 'China' },
  { code: 'CO', dial: '+57', ar: 'كولومبيا', en: 'Colombia' },
  { code: 'KM', dial: '+269', ar: 'جزر القمر', en: 'Comoros' },
  { code: 'CG', dial: '+242', ar: 'الكونغو', en: 'Congo' },
  { code: 'CD', dial: '+243', ar: 'الكونغو الديمقراطية', en: 'Congo (DRC)' },
  { code: 'CR', dial: '+506', ar: 'كوستاريكا', en: 'Costa Rica' },
  { code: 'CI', dial: '+225', ar: 'ساحل العاج', en: "Côte d'Ivoire" },
  { code: 'HR', dial: '+385', ar: 'كرواتيا', en: 'Croatia' },
  { code: 'CU', dial: '+53', ar: 'كوبا', en: 'Cuba' },
  { code: 'CY', dial: '+357', ar: 'قبرص', en: 'Cyprus' },
  { code: 'CZ', dial: '+420', ar: 'التشيك', en: 'Czechia' },
  { code: 'DK', dial: '+45', ar: 'الدنمارك', en: 'Denmark' },
  { code: 'DJ', dial: '+253', ar: 'جيبوتي', en: 'Djibouti' },
  { code: 'DM', dial: '+1-767', ar: 'دومينيكا', en: 'Dominica' },
  { code: 'DO', dial: '+1-809', ar: 'جمهورية الدومينيكان', en: 'Dominican Republic' },
  { code: 'EC', dial: '+593', ar: 'الإكوادور', en: 'Ecuador' },
  { code: 'EG', dial: '+20', ar: 'مصر', en: 'Egypt' },
  { code: 'SV', dial: '+503', ar: 'السلفادور', en: 'El Salvador' },
  { code: 'GQ', dial: '+240', ar: 'غينيا الاستوائية', en: 'Equatorial Guinea' },
  { code: 'ER', dial: '+291', ar: 'إريتريا', en: 'Eritrea' },
  { code: 'EE', dial: '+372', ar: 'إستونيا', en: 'Estonia' },
  { code: 'SZ', dial: '+268', ar: 'إسواتيني', en: 'Eswatini' },
  { code: 'ET', dial: '+251', ar: 'إثيوبيا', en: 'Ethiopia' },
  { code: 'FJ', dial: '+679', ar: 'فيجي', en: 'Fiji' },
  { code: 'FI', dial: '+358', ar: 'فنلندا', en: 'Finland' },
  { code: 'FR', dial: '+33', ar: 'فرنسا', en: 'France' },
  { code: 'GA', dial: '+241', ar: 'الغابون', en: 'Gabon' },
  { code: 'GM', dial: '+220', ar: 'غامبيا', en: 'Gambia' },
  { code: 'GE', dial: '+995', ar: 'جورجيا', en: 'Georgia' },
  { code: 'DE', dial: '+49', ar: 'ألمانيا', en: 'Germany' },
  { code: 'GH', dial: '+233', ar: 'غانا', en: 'Ghana' },
  { code: 'GR', dial: '+30', ar: 'اليونان', en: 'Greece' },
  { code: 'GD', dial: '+1-473', ar: 'غرينادا', en: 'Grenada' },
  { code: 'GT', dial: '+502', ar: 'غواتيمالا', en: 'Guatemala' },
  { code: 'GN', dial: '+224', ar: 'غينيا', en: 'Guinea' },
  { code: 'GW', dial: '+245', ar: 'غينيا بيساو', en: 'Guinea-Bissau' },
  { code: 'GY', dial: '+592', ar: 'غيانا', en: 'Guyana' },
  { code: 'HT', dial: '+509', ar: 'هايتي', en: 'Haiti' },
  { code: 'HN', dial: '+504', ar: 'هندوراس', en: 'Honduras' },
  { code: 'HK', dial: '+852', ar: 'هونغ كونغ', en: 'Hong Kong' },
  { code: 'HU', dial: '+36', ar: 'هنغاريا', en: 'Hungary' },
  { code: 'IS', dial: '+354', ar: 'آيسلندا', en: 'Iceland' },
  { code: 'IN', dial: '+91', ar: 'الهند', en: 'India' },
  { code: 'ID', dial: '+62', ar: 'إندونيسيا', en: 'Indonesia' },
  { code: 'IR', dial: '+98', ar: 'إيران', en: 'Iran' },
  { code: 'IQ', dial: '+964', ar: 'العراق', en: 'Iraq' },
  { code: 'IE', dial: '+353', ar: 'أيرلندا', en: 'Ireland' },
  { code: 'IL', dial: '+972', ar: 'إسرائيل', en: 'Israel' },
  { code: 'IT', dial: '+39', ar: 'إيطاليا', en: 'Italy' },
  { code: 'JM', dial: '+1-876', ar: 'جامايكا', en: 'Jamaica' },
  { code: 'JP', dial: '+81', ar: 'اليابان', en: 'Japan' },
  { code: 'JO', dial: '+962', ar: 'الأردن', en: 'Jordan' },
  { code: 'KZ', dial: '+7', ar: 'كازاخستان', en: 'Kazakhstan' },
  { code: 'KE', dial: '+254', ar: 'كينيا', en: 'Kenya' },
  { code: 'KI', dial: '+686', ar: 'كيريباتي', en: 'Kiribati' },
  { code: 'KW', dial: '+965', ar: 'الكويت', en: 'Kuwait' },
  { code: 'KG', dial: '+996', ar: 'قيرغيزستان', en: 'Kyrgyzstan' },
  { code: 'LA', dial: '+856', ar: 'لاوس', en: 'Laos' },
  { code: 'LV', dial: '+371', ar: 'لاتفيا', en: 'Latvia' },
  { code: 'LB', dial: '+961', ar: 'لبنان', en: 'Lebanon' },
  { code: 'LS', dial: '+266', ar: 'ليسوتو', en: 'Lesotho' },
  { code: 'LR', dial: '+231', ar: 'ليبيريا', en: 'Liberia' },
  { code: 'LY', dial: '+218', ar: 'ليبيا', en: 'Libya' },
  { code: 'LI', dial: '+423', ar: 'ليختنشتاين', en: 'Liechtenstein' },
  { code: 'LT', dial: '+370', ar: 'ليتوانيا', en: 'Lithuania' },
  { code: 'LU', dial: '+352', ar: 'لوكسمبورغ', en: 'Luxembourg' },
  { code: 'MO', dial: '+853', ar: 'ماكاو', en: 'Macau' },
  { code: 'MG', dial: '+261', ar: 'مدغشقر', en: 'Madagascar' },
  { code: 'MW', dial: '+265', ar: 'مالاوي', en: 'Malawi' },
  { code: 'MY', dial: '+60', ar: 'ماليزيا', en: 'Malaysia' },
  { code: 'MV', dial: '+960', ar: 'المالديف', en: 'Maldives' },
  { code: 'ML', dial: '+223', ar: 'مالي', en: 'Mali' },
  { code: 'MT', dial: '+356', ar: 'مالطا', en: 'Malta' },
  { code: 'MH', dial: '+692', ar: 'جزر مارشال', en: 'Marshall Islands' },
  { code: 'MR', dial: '+222', ar: 'موريتانيا', en: 'Mauritania' },
  { code: 'MU', dial: '+230', ar: 'موريشيوس', en: 'Mauritius' },
  { code: 'MX', dial: '+52', ar: 'المكسيك', en: 'Mexico' },
  { code: 'FM', dial: '+691', ar: 'ميكرونيزيا', en: 'Micronesia' },
  { code: 'MD', dial: '+373', ar: 'مولدوفا', en: 'Moldova' },
  { code: 'MC', dial: '+377', ar: 'موناكو', en: 'Monaco' },
  { code: 'MN', dial: '+976', ar: 'منغوليا', en: 'Mongolia' },
  { code: 'ME', dial: '+382', ar: 'الجبل الأسود', en: 'Montenegro' },
  { code: 'MA', dial: '+212', ar: 'المغرب', en: 'Morocco' },
  { code: 'MZ', dial: '+258', ar: 'موزمبيق', en: 'Mozambique' },
  { code: 'MM', dial: '+95', ar: 'ميانمار', en: 'Myanmar' },
  { code: 'NA', dial: '+264', ar: 'ناميبيا', en: 'Namibia' },
  { code: 'NR', dial: '+674', ar: 'ناورو', en: 'Nauru' },
  { code: 'NP', dial: '+977', ar: 'نيبال', en: 'Nepal' },
  { code: 'NL', dial: '+31', ar: 'هولندا', en: 'Netherlands' },
  { code: 'NZ', dial: '+64', ar: 'نيوزيلندا', en: 'New Zealand' },
  { code: 'NI', dial: '+505', ar: 'نيكاراغوا', en: 'Nicaragua' },
  { code: 'NE', dial: '+227', ar: 'النيجر', en: 'Niger' },
  { code: 'NG', dial: '+234', ar: 'نيجيريا', en: 'Nigeria' },
  { code: 'KP', dial: '+850', ar: 'كوريا الشمالية', en: 'North Korea' },
  { code: 'MK', dial: '+389', ar: 'مقدونيا الشمالية', en: 'North Macedonia' },
  { code: 'NO', dial: '+47', ar: 'النرويج', en: 'Norway' },
  { code: 'OM', dial: '+968', ar: 'عُمان', en: 'Oman' },
  { code: 'PK', dial: '+92', ar: 'باكستان', en: 'Pakistan' },
  { code: 'PW', dial: '+680', ar: 'بالاو', en: 'Palau' },
  { code: 'PS', dial: '+970', ar: 'فلسطين', en: 'Palestine' },
  { code: 'PA', dial: '+507', ar: 'بنما', en: 'Panama' },
  { code: 'PG', dial: '+675', ar: 'بابوا غينيا الجديدة', en: 'Papua New Guinea' },
  { code: 'PY', dial: '+595', ar: 'باراغواي', en: 'Paraguay' },
  { code: 'PE', dial: '+51', ar: 'بيرو', en: 'Peru' },
  { code: 'PH', dial: '+63', ar: 'الفلبين', en: 'Philippines' },
  { code: 'PL', dial: '+48', ar: 'بولندا', en: 'Poland' },
  { code: 'PT', dial: '+351', ar: 'البرتغال', en: 'Portugal' },
  { code: 'PR', dial: '+1-787', ar: 'بورتوريكو', en: 'Puerto Rico' },
  { code: 'QA', dial: '+974', ar: 'قطر', en: 'Qatar' },
  { code: 'RO', dial: '+40', ar: 'رومانيا', en: 'Romania' },
  { code: 'RU', dial: '+7', ar: 'روسيا', en: 'Russia' },
  { code: 'RW', dial: '+250', ar: 'رواندا', en: 'Rwanda' },
  { code: 'KN', dial: '+1-869', ar: 'سانت كيتس ونيفيس', en: 'Saint Kitts and Nevis' },
  { code: 'LC', dial: '+1-758', ar: 'سانت لوسيا', en: 'Saint Lucia' },
  { code: 'VC', dial: '+1-784', ar: 'سانت فينسنت والغرينادين', en: 'Saint Vincent and the Grenadines' },
  { code: 'WS', dial: '+685', ar: 'ساموا', en: 'Samoa' },
  { code: 'SM', dial: '+378', ar: 'سان مارينو', en: 'San Marino' },
  { code: 'ST', dial: '+239', ar: 'ساو تومي وبرينسيبي', en: 'Sao Tome and Principe' },
  { code: 'SA', dial: '+966', ar: 'السعودية', en: 'Saudi Arabia' },
  { code: 'SN', dial: '+221', ar: 'السنغال', en: 'Senegal' },
  { code: 'RS', dial: '+381', ar: 'صربيا', en: 'Serbia' },
  { code: 'SC', dial: '+248', ar: 'سيشل', en: 'Seychelles' },
  { code: 'SL', dial: '+232', ar: 'سيراليون', en: 'Sierra Leone' },
  { code: 'SG', dial: '+65', ar: 'سنغافورة', en: 'Singapore' },
  { code: 'SK', dial: '+421', ar: 'سلوفاكيا', en: 'Slovakia' },
  { code: 'SI', dial: '+386', ar: 'سلوفينيا', en: 'Slovenia' },
  { code: 'SB', dial: '+677', ar: 'جزر سليمان', en: 'Solomon Islands' },
  { code: 'SO', dial: '+252', ar: 'الصومال', en: 'Somalia' },
  { code: 'ZA', dial: '+27', ar: 'جنوب أفريقيا', en: 'South Africa' },
  { code: 'KR', dial: '+82', ar: 'كوريا الجنوبية', en: 'South Korea' },
  { code: 'SS', dial: '+211', ar: 'جنوب السودان', en: 'South Sudan' },
  { code: 'ES', dial: '+34', ar: 'إسبانيا', en: 'Spain' },
  { code: 'LK', dial: '+94', ar: 'سريلانكا', en: 'Sri Lanka' },
  { code: 'SD', dial: '+249', ar: 'السودان', en: 'Sudan' },
  { code: 'SR', dial: '+597', ar: 'سورينام', en: 'Suriname' },
  { code: 'SE', dial: '+46', ar: 'السويد', en: 'Sweden' },
  { code: 'CH', dial: '+41', ar: 'سويسرا', en: 'Switzerland' },
  { code: 'SY', dial: '+963', ar: 'سوريا', en: 'Syria' },
  { code: 'TW', dial: '+886', ar: 'تايوان', en: 'Taiwan' },
  { code: 'TJ', dial: '+992', ar: 'طاجيكستان', en: 'Tajikistan' },
  { code: 'TZ', dial: '+255', ar: 'تنزانيا', en: 'Tanzania' },
  { code: 'TH', dial: '+66', ar: 'تايلاند', en: 'Thailand' },
  { code: 'TL', dial: '+670', ar: 'تيمور الشرقية', en: 'Timor-Leste' },
  { code: 'TG', dial: '+228', ar: 'توغو', en: 'Togo' },
  { code: 'TO', dial: '+676', ar: 'تونغا', en: 'Tonga' },
  { code: 'TT', dial: '+1-868', ar: 'ترينيداد وتوباغو', en: 'Trinidad and Tobago' },
  { code: 'TN', dial: '+216', ar: 'تونس', en: 'Tunisia' },
  { code: 'TR', dial: '+90', ar: 'تركيا', en: 'Türkiye' },
  { code: 'TM', dial: '+993', ar: 'تركمانستان', en: 'Turkmenistan' },
  { code: 'TV', dial: '+688', ar: 'توفالو', en: 'Tuvalu' },
  { code: 'UG', dial: '+256', ar: 'أوغندا', en: 'Uganda' },
  { code: 'UA', dial: '+380', ar: 'أوكرانيا', en: 'Ukraine' },
  { code: 'AE', dial: '+971', ar: 'الإمارات', en: 'United Arab Emirates' },
  { code: 'GB', dial: '+44', ar: 'المملكة المتحدة', en: 'United Kingdom' },
  { code: 'US', dial: '+1', ar: 'الولايات المتحدة', en: 'United States' },
  { code: 'UY', dial: '+598', ar: 'أوروغواي', en: 'Uruguay' },
  { code: 'UZ', dial: '+998', ar: 'أوزبكستان', en: 'Uzbekistan' },
  { code: 'VU', dial: '+678', ar: 'فانواتو', en: 'Vanuatu' },
  { code: 'VA', dial: '+379', ar: 'الفاتيكان', en: 'Vatican City' },
  { code: 'VE', dial: '+58', ar: 'فنزويلا', en: 'Venezuela' },
  { code: 'VN', dial: '+84', ar: 'فيتنام', en: 'Vietnam' },
  { code: 'YE', dial: '+967', ar: 'اليمن', en: 'Yemen' },
  { code: 'ZM', dial: '+260', ar: 'زامبيا', en: 'Zambia' },
  { code: 'ZW', dial: '+263', ar: 'زيمبابوي', en: 'Zimbabwe' },
];

const BY_CODE = new Map(COUNTRIES.map((item) => [item.code, item]));

/** Flag emoji derived from the ISO code, so no image assets are needed. */
export function flagOf(code: string): string {
  const upper = code.trim().toUpperCase();
  if (upper.length !== 2) return '🌐';
  return String.fromCodePoint(...[...upper].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

function norm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064b-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve a stored value: an ISO code, a dialling code or a name in either language. */
export function findCountry(value?: string | null): Country | undefined {
  const raw = (value ?? '').trim();
  if (!raw) return undefined;
  const byCode = BY_CODE.get(raw.toUpperCase());
  if (byCode) return byCode;
  const needle = norm(raw);
  return COUNTRIES.find(
    (item) => norm(item.ar) === needle || norm(item.en) === needle || item.dial === raw
  );
}

/** Localised country name; legacy free-text values are shown as they were stored. */
export function countryName(value: string | null | undefined, lang: 'ar' | 'en' = 'ar'): string {
  const found = findCountry(value);
  if (found) return lang === 'ar' ? found.ar : found.en;
  return (value ?? '').trim();
}

/** Flag emoji for a stored value (globe when it is unknown). */
export function countryFlag(value: string | null | undefined): string {
  const found = findCountry(value);
  return found ? flagOf(found.code) : '🌐';
}

/** Picker search: name in either language, ISO code, or dialling code. */
export function searchCountries(query: string): Country[] {
  const needle = norm(query);
  if (!needle) return COUNTRIES;
  const digits = query.replace(/\D/g, '');
  return COUNTRIES.filter((item) => {
    if (norm(item.ar).includes(needle) || norm(item.en).includes(needle)) return true;
    if (item.code.toLowerCase().includes(needle)) return true;
    return digits.length > 0 && item.dial.replace(/\D/g, '').startsWith(digits);
  });
}
