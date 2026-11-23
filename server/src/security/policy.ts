import type { Severity } from './lexicon';

export type Capability = 'chat' | 'mic' | 'avatar' | 'media' | 'gifts' | 'calls' | 'account';

export type Decision = 'allow' | 'warn' | 'block' | 'suspend' | 'ban';

export interface PenaltyPlan {
  decision: Decision;
  strike: number;
  /** Arabic fallback copy; the client localizes the structured fields too. */
  warningTitle: string;
  warningBody: string;
  restrictions: { capability: Capability; minutes: number; reason: string }[];
  suspendMinutes: number | null;
  permanentBan: boolean;
  /** Human-readable Arabic name of the applied penalty, stored with the record. */
  penaltyLabel: string;
}

/** Violations that skip the three-warning ladder and act immediately. */
export const SERIOUS_CATEGORIES = new Set([
  'child_safety',
  'threat',
  'fraud',
  'impersonation',
  'phishing',
  'sexual',
  'violence',
  'account_hacking',
]);

export const CATEGORY_LABELS: Record<string, string> = {
  profanity: 'سب وشتم',
  insult: 'إهانة شخصية',
  sexual_insult: 'إساءة جنسية',
  sexual: 'محتوى جنسي',
  child_safety: 'محتوى يمس الأطفال',
  threat: 'تهديد وابتزاز',
  harassment: 'تحرش ومضايقة',
  racism: 'عنصرية وطائفية',
  fraud: 'احتيال مالي',
  impersonation: 'انتحال شخصية',
  phishing: 'رابط تصيد',
  spam: 'إزعاج وإعلانات',
  violence: 'عنف ودموية',
  custom: 'كلمة محظورة من الإدارة',
  media_blocked: 'وسائط محظورة',
  account_hacking: 'محاولة اختراق',
};

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return 'مخالفة';
  return CATEGORY_LABELS[category] ?? category;
}

export function capabilityLabel(capability: string): string {
  switch (capability) {
    case 'chat':
      return 'إرسال الرسائل';
    case 'mic':
      return 'استخدام المايك';
    case 'avatar':
      return 'تغيير الصورة الشخصية';
    case 'media':
      return 'نشر الصور والفيديوهات';
    case 'gifts':
      return 'إرسال الهدايا';
    case 'calls':
      return 'إجراء المكالمات';
    default:
      return 'استخدام الحساب';
  }
}

export function defaultCapabilityFor(engine: string, surface: string): Capability {
  if (surface === 'voice' || engine === 'voice') return 'mic';
  if (surface === 'upload') return 'media';
  if (surface === 'profile' || surface === 'avatar') return 'avatar';
  if (surface === 'gift_note') return 'gifts';
  return 'chat';
}

const LADDER: { minStrike: number; suspendMinutes: number | null; restrictMinutes: number | null; label: string }[] = [
  { minStrike: 1, suspendMinutes: null, restrictMinutes: null, label: 'تحذير أول' },
  { minStrike: 2, suspendMinutes: null, restrictMinutes: 30, label: 'تحذير ثانٍ + تقييد مؤقت 30 دقيقة' },
  { minStrike: 3, suspendMinutes: 60, restrictMinutes: 60, label: 'تحذير نهائي + إيقاف ساعة' },
  { minStrike: 4, suspendMinutes: 24 * 60, restrictMinutes: 24 * 60, label: 'إيقاف 24 ساعة' },
  { minStrike: 5, suspendMinutes: 7 * 24 * 60, restrictMinutes: 7 * 24 * 60, label: 'إيقاف 7 أيام' },
  { minStrike: 6, suspendMinutes: 30 * 24 * 60, restrictMinutes: 30 * 24 * 60, label: 'إيقاف 30 يوماً' },
  { minStrike: 7, suspendMinutes: null, restrictMinutes: null, label: 'حظر دائم' },
];

/**
 * Turns a confirmed violation into the penalty the server will apply.
 *
 * Standard violations climb the three-warning ladder; serious ones
 * (child safety, threats, extortion, fraud, impersonation, hacking) act on the
 * first confirmed hit and escalate faster on repeat.
 */
export function planPenalty(input: {
  category: string;
  severity: Severity;
  strike: number;
  engine: string;
  surface: string;
}): PenaltyPlan {
  const { category, severity, strike, engine, surface } = input;
  const capability = defaultCapabilityFor(engine, surface);
  const label = categoryLabel(category);

  if (severity === 'critical' || category === 'child_safety') {
    return {
      decision: 'ban',
      strike,
      warningTitle: 'حظر دائم — محتوى خطير',
      warningBody: `تم إيقاف الحساب نهائياً بسبب ${label}. تم حفظ الأدلة ومراجعة الحالة من فريق السلامة.`,
      restrictions: [{ capability: 'account', minutes: 0, reason: label }],
      suspendMinutes: null,
      permanentBan: true,
      penaltyLabel: 'حظر دائم',
    };
  }

  if (SERIOUS_CATEGORIES.has(category)) {
    const seriousLadder = [
      { strike: 1, minutes: 24 * 60, label: 'إيقاف 24 ساعة' },
      { strike: 2, minutes: 7 * 24 * 60, label: 'إيقاف 7 أيام' },
      { strike: 3, minutes: 30 * 24 * 60, label: 'إيقاف 30 يوماً' },
    ];
    const step = seriousLadder.find((entry) => strike <= entry.strike);
    if (!step) {
      return {
        decision: 'ban',
        strike,
        warningTitle: 'حظر دائم — مخالفة خطيرة متكررة',
        warningBody: `تم حظر الحساب نهائياً بعد تكرار ${label}.`,
        restrictions: [{ capability: 'account', minutes: 0, reason: label }],
        suspendMinutes: null,
        permanentBan: true,
        penaltyLabel: 'حظر دائم',
      };
    }
    return {
      decision: 'suspend',
      strike,
      warningTitle: `إيقاف الحساب — ${label}`,
      warningBody: `تم اكتشاف ${label} وتم إيقاف الحساب لمدة ${step.label.replace('إيقاف ', '')}. يمكنك تقديم اعتراض من مركز الحماية.`,
      restrictions: [
        { capability: 'account', minutes: step.minutes, reason: label },
        { capability, minutes: step.minutes, reason: label },
      ],
      suspendMinutes: step.minutes,
      permanentBan: false,
      penaltyLabel: step.label,
    };
  }

  const step = [...LADDER].reverse().find((entry) => strike >= entry.minStrike) ?? LADDER[0];
  if (step.minStrike === 7) {
    return {
      decision: 'ban',
      strike,
      warningTitle: 'حظر دائم — تكرار المخالفات',
      warningBody: `تم حظر الحساب نهائياً بعد تكرار ${label} سبع مرات.`,
      restrictions: [{ capability: 'account', minutes: 0, reason: label }],
      suspendMinutes: null,
      permanentBan: true,
      penaltyLabel: 'حظر دائم',
    };
  }

  const restrictions: PenaltyPlan['restrictions'] = [];
  if (step.restrictMinutes) {
    restrictions.push({ capability, minutes: step.restrictMinutes, reason: label });
    if (step.suspendMinutes) {
      restrictions.push({ capability: 'account', minutes: step.suspendMinutes, reason: label });
    }
  }

  return {
    decision: step.suspendMinutes ? 'suspend' : 'block',
    strike,
    warningTitle: step.minStrike === 1 ? `تحذير أول — ${label}` : step.minStrike === 2 ? `تحذير ثانٍ — ${label}` : `تحذير نهائي — ${label}`,
    warningBody:
      step.minStrike === 1
        ? `تم رفض المحتوى لاحتوائه على ${label}. هذه أول مخالفة؛ تكرارها سيؤدي إلى تقييد الحساب.`
        : step.minStrike === 2
          ? `تم رفض المحتوى بسبب ${label}. تكرار المخالفة سيؤدي إلى إيقاف الحساب.`
          : `هذا التحذير النهائي بسبب ${label}. تم ${step.label.split('+')[1]?.trim() ?? 'تقييد الحساب'}.`,
    restrictions,
    suspendMinutes: step.suspendMinutes,
    permanentBan: false,
    penaltyLabel: step.label,
  };
}
