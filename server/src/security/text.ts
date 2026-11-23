import {
  HUMOUR_MARKERS,
  MEDIA_FILENAME_TERMS,
  MINOR_MARKERS,
  RULES,
  WHITELIST,
  type Engine,
  type Rule,
  type Severity,
} from './lexicon';

/**
 * Text normalization for Arabic (MSA + Iraqi dialect) and English.
 *
 * It removes diacritics/tatweel, unifies letter variants (أ/إ/آ → ا, ة → ه,
 * ى → ي, گ → ك …), and produces three views of the text: one with digits kept,
 * one with Arabic chat digits (3 = ع, 7 = ح …) and one with Latin leet digits
 * (3 = e, 0 = o, @ = a …). The compact view has every separator removed, so
 * "ك ل ب", "ك.ل.ب" and "كــلــب" all reach the same rule.
 */

const AR_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

const ARABIC_DIGIT_MAP: Record<string, string> = {
  '2': 'ء',
  '3': 'ع',
  '5': 'خ',
  '6': 'ط',
  '7': 'ح',
  '8': 'ق',
  '9': 'ص',
};

const LATIN_DIGIT_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  '$': 's',
  '!': 'i',
  '|': 'l',
};

export function normalizeArabic(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(INVISIBLE, '')
    .replace(AR_DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .replace(/[گڪ]/g, 'ك')
    .replace(/[چ]/g, 'ج')
    .replace(/[پ]/g, 'ب')
    .replace(/[ڤ]/g, 'ف')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Variants {
  spaced: string;
  compact: string;
  tokens: Set<string>;
}

function buildVariants(spaced: string): Variants {
  const compact = spaced.replace(/[^\p{L}\p{N}]/gu, '');
  const tokens = new Set(spaced.split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  return { spaced: ` ${spaced} `, compact, tokens };
}

export function textVariants(input: string): Variants[] {
  const base = normalizeArabic(input);
  const arabicDigits = base.replace(/[2356789]/g, (d) => ARABIC_DIGIT_MAP[d] ?? d);
  const latinDigits = base.replace(/[013456789@$!|]/g, (d) => LATIN_DIGIT_MAP[d] ?? d);
  // Collapse runs of the same letter ("كلببب" → "كلب", "fuuuck" → "fuck").
  const squashed = base.replace(/(\p{L})\1{2,}/gu, '$1');
  return [buildVariants(base), buildVariants(arabicDigits), buildVariants(latinDigits), buildVariants(arabicDigits.replace(/(.)\1{2,}/g, '$1'))].filter(
    (v) => v.spaced.trim().length > 0
  );
}

function inWhitelist(compact: string): boolean {
  return WHITELIST.some((word) => compact.includes(normalizeArabic(word).replace(/[^\p{L}\p{N}]/gu, '')));
}

function termMatches(term: string, variants: Variants[]): boolean {
  const normalized = normalizeArabic(term);
  const compactTerm = normalized.replace(/[^\p{L}\p{N}]/gu, '');
  if (!compactTerm) return false;
  const isLatin = /^[a-z]/.test(normalized);
  const isPhrase = normalized.includes(' ');

  for (const variant of variants) {
    if (isPhrase) {
      if (variant.spaced.includes(` ${normalized} `)) return true;
      if (variant.compact.includes(compactTerm) && compactTerm.length >= 6) return true;
      continue;
    }
    // Two-letter Arabic terms only match as a whole token, so "كس" cannot fire
    // inside "بكس". From three letters on, the compact view catches "ك ل ب",
    // "كــلــب" and similar spacing tricks.
    if (variant.tokens.has(normalized)) return true;
    if (compactTerm.length <= 2) continue;
    if (isLatin) {
      if (variant.compact.includes(compactTerm) && !inWhitelist(variant.compact)) return true;
      continue;
    }
    if (variant.compact.includes(compactTerm) && !inWhitelist(variant.compact)) return true;
  }
  return false;
}

export interface TextMatch {
  ruleId: string;
  engine: Engine;
  category: string;
  severity: Severity;
  term: string;
  weight: number;
}

export interface TextClassification {
  clean: boolean;
  matches: TextMatch[];
  /** Highest severity found, or null. */
  severity: Severity | null;
  category: string | null;
  engine: Engine;
  confidence: number;
  /** True when the only finding is a mild insult inside an obvious joke. */
  humour: boolean;
}

const SEVERITY_ORDER: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export function maxSeverity(a: Severity | null, b: Severity | null): Severity | null {
  if (!a) return b;
  if (!b) return a;
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

export function classifyText(input: string, extraRules: string[] = []): TextClassification {
  const text = String(input || '').slice(0, 4000);
  if (!text.trim()) {
    return { clean: true, matches: [], severity: null, category: null, engine: 'text', confidence: 0, humour: false };
  }
  const variants = textVariants(text);
  const lower = normalizeArabic(text);
  const matches: TextMatch[] = [];

  const rules: Rule[] = extraRules.length
    ? [
        ...RULES,
        {
          id: 'custom.blocked_word',
          engine: 'text',
          category: 'custom',
          severity: 'medium',
          weight: 0.75,
          terms: extraRules,
        },
      ]
    : RULES;

  for (const rule of rules) {
    for (const term of rule.terms) {
      if (termMatches(term, variants)) {
        matches.push({
          ruleId: rule.id,
          engine: rule.engine,
          category: rule.category,
          severity: rule.severity,
          term: normalizeArabic(term),
          weight: rule.weight,
        });
        break;
      }
    }
  }

  // Sexual content aimed at a minor is always critical, even when the words
  // are individually below the block threshold.
  const hasSexual = matches.some((m) => m.category === 'sexual' || m.category === 'sexual_insult');
  const hasMinor = MINOR_MARKERS.some((marker) => lower.includes(normalizeArabic(marker)));
  if (hasSexual && hasMinor) {
    matches.push({
      ruleId: 'child_safety.contextual',
      engine: 'text',
      category: 'child_safety',
      severity: 'critical',
      term: 'sexual+minor',
      weight: 0.95,
    });
  }

  if (!matches.length) {
    return { clean: true, matches: [], severity: null, category: null, engine: 'text', confidence: 0, humour: false };
  }

  let severity: Severity | null = null;
  for (const match of matches) severity = maxSeverity(severity, match.severity);
  // Category priority decides the label when one message breaks several rules
  // ("I'm the admin, send coins" is fraud first, impersonation second).
  const PRIORITY = [
    'child_safety',
    'threat',
    'sexual',
    'violence',
    'fraud',
    'phishing',
    'impersonation',
    'racism',
    'harassment',
    'sexual_insult',
    'insult',
    'spam',
    'custom',
  ];
  const strongest =
    [...matches].sort((a, b) => {
      const pa = PRIORITY.indexOf(a.category);
      const pb = PRIORITY.indexOf(b.category);
      return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    })[0] ?? matches[0];

  const confidence = Math.min(
    0.98,
    0.55 + matches.reduce((sum, m) => sum + m.weight * 0.25, 0)
  );
  const humour =
    severity === 'medium' &&
    matches.length === 1 &&
    HUMOUR_MARKERS.some((marker) => lower.includes(normalizeArabic(marker)));

  return {
    clean: false,
    matches,
    severity,
    category: strongest.category,
    engine: strongest.engine,
    confidence,
    humour,
  };
}

/** Filename / URL hints used before an image or video is stored. */
export function mediaNameHint(name: string): { term: string; severity: Severity } | null {
  const lower = normalizeArabic(name).replace(/[^\p{L}\p{N}]+/gu, ' ');
  for (const term of MEDIA_FILENAME_TERMS) {
    const normalized = normalizeArabic(term);
    if (new RegExp(`(^|\\s)${normalized}(\\s|$)`).test(lower)) {
      return { term, severity: normalized.length <= 3 ? 'medium' : 'high' };
    }
  }
  return null;
}

/** Repeated-message spam: identical normalized body sent over and over. */
export function fingerprint(text: string): string {
  return normalizeArabic(text).replace(/[^\p{L}\p{N}]+/gu, '');
}
