import { one, q, tx } from '../db';
import { notify } from '../notify';
import { broadcast, emitToUser } from '../realtime';
import { HttpError } from '../utils';
import type { Engine, Severity } from './lexicon';
import { moderateMediaFile, moderateStoredMedia, type MediaVerdict } from './media';
import {
  capabilityLabel,
  categoryLabel,
  planPenalty,
  type Capability,
  type Decision,
  type PenaltyPlan,
} from './policy';
import { classifyText, fingerprint, normalizeArabic, type TextClassification } from './text';

export interface SecurityConfig {
  enabled: boolean;
  engines: Record<Engine, boolean>;
  sensitivity: 'low' | 'normal' | 'high';
  auto_penalties: boolean;
  custom_blocked_words: string[];
  whitelist_words: string[];
  appeal_auto_accept_confidence: number;
  media_provider: 'auto' | 'local';
}

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  enabled: true,
  engines: {
    text: true,
    image: true,
    video: true,
    voice: true,
    fraud: true,
    spam: true,
    impersonation: true,
    account: true,
  },
  sensitivity: 'normal',
  auto_penalties: true,
  custom_blocked_words: [],
  whitelist_words: [],
  appeal_auto_accept_confidence: 0.8,
  media_provider: 'auto',
};

let configCache: { value: SecurityConfig; at: number } | null = null;

export async function getSecurityConfig(force = false): Promise<SecurityConfig> {
  if (!force && configCache && Date.now() - configCache.at < 30_000) return configCache.value;
  const rows = await q<{ value: Partial<SecurityConfig> }>(
    "SELECT value FROM security_settings WHERE key = 'config'"
  );
  const stored = rows[0]?.value ?? {};
  const value: SecurityConfig = {
    ...DEFAULT_SECURITY_CONFIG,
    ...stored,
    engines: { ...DEFAULT_SECURITY_CONFIG.engines, ...(stored.engines ?? {}) },
    custom_blocked_words: Array.isArray(stored.custom_blocked_words) ? stored.custom_blocked_words : [],
    whitelist_words: Array.isArray(stored.whitelist_words) ? stored.whitelist_words : [],
  };
  configCache = { value, at: Date.now() };
  return value;
}

export async function saveSecurityConfig(patch: Partial<SecurityConfig>): Promise<SecurityConfig> {
  const current = await getSecurityConfig(true);
  const next: SecurityConfig = {
    ...current,
    ...patch,
    engines: { ...current.engines, ...(patch.engines ?? {}) },
  };
  await q(
    `INSERT INTO security_settings (key, value) VALUES ('config', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(next)]
  );
  configCache = { value: next, at: Date.now() };
  return next;
}

/** Bots, the support desk and admins are trusted and never auto-penalized. */
async function isTrusted(userId: string): Promise<boolean> {
  const row = await one<{ is_bot: boolean; is_support: boolean; is_admin: boolean; role: string }>(
    'SELECT is_bot, is_support, is_admin, role FROM users WHERE id = $1',
    [userId]
  );
  if (!row) return true;
  return Boolean(row.is_bot || row.is_support || row.is_admin || row.role === 'admin');
}

export interface ViolationResult {
  violationId: string;
  strike: number;
  decision: Decision;
  penalty: PenaltyPlan;
  restrictionUntil: string | null;
}

async function applyViolation(input: {
  userId: string;
  engine: Engine;
  category: string;
  severity: Severity;
  confidence: number;
  surface: string;
  excerpt?: string | null;
  matches?: unknown;
  evidence?: Record<string, unknown>;
}): Promise<ViolationResult> {
  const outcome = await tx(async (c) => {
    const userResult = await c.query<{
      security_strikes: number;
      security_last_violation_at: string | null;
      is_banned: boolean;
      suspended_until: string | null;
    }>(
      'SELECT security_strikes, security_last_violation_at, is_banned, suspended_until FROM users WHERE id = $1 FOR UPDATE',
      [input.userId]
    );
    const user = userResult.rows[0];
    if (!user) throw new HttpError(404, 'User not found', 'user_not_found');
    if (user.is_banned) {
      throw new HttpError(403, 'Account is banned', 'banned');
    }

    // Good behaviour forgiveness: strikes older than 30 days no longer count.
    const stale =
      !user.security_last_violation_at ||
      Date.now() - new Date(user.security_last_violation_at).getTime() > 30 * 24 * 60 * 60 * 1000;
    const strike = (stale ? 0 : Number(user.security_strikes || 0)) + 1;

    const penalty = planPenalty({
      category: input.category,
      severity: input.severity,
      strike,
      engine: input.engine,
      surface: input.surface,
    });

    if (penalty.permanentBan) {
      await c.query(
        "UPDATE users SET security_strikes = $2, security_last_violation_at = now(), is_banned = true, ban_reason = $3, suspended_until = NULL WHERE id = $1",
        [input.userId, strike, `YALLA PHONE AI SECURITY: ${categoryLabel(input.category)}`]
      );
    } else {
      await c.query(
        `UPDATE users SET security_strikes = $2, security_last_violation_at = now(),
           suspended_until = CASE WHEN $3::int IS NULL THEN suspended_until
             ELSE GREATEST(COALESCE(suspended_until, now()), now() + ($3::int * interval '1 minute')) END
         WHERE id = $1`,
        [input.userId, strike, penalty.suspendMinutes]
      );
    }

    const violation = await c.query<{ id: string }>(
      `INSERT INTO security_violations
         (user_id, engine, category, severity, confidence, surface, excerpt, matches, decision, strike, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb)
       RETURNING id`,
      [
        input.userId,
        input.engine,
        input.category,
        input.severity,
        input.confidence,
        input.surface,
        (input.excerpt ?? '').slice(0, 400),
        JSON.stringify(input.matches ?? []),
        penalty.decision,
        strike,
        JSON.stringify(input.evidence ?? {}),
      ]
    );
    const violationId = violation.rows[0].id;

    let restrictionUntil: string | null = null;
    for (const restriction of penalty.restrictions) {
      const inserted = await c.query<{ expires_at: string | null }>(
        `INSERT INTO security_restrictions (user_id, capability, reason, violation_id, expires_at)
         VALUES ($1,$2,$3,$4, CASE WHEN $5::int IS NULL OR $5::int = 0 THEN NULL ELSE now() + ($5::int * interval '1 minute') END)
         RETURNING expires_at`,
        [input.userId, restriction.capability, restriction.reason, violationId, restriction.minutes || null]
      );
      if (restriction.capability === 'account') {
        restrictionUntil = inserted.rows[0]?.expires_at ?? null;
      }
    }

    await c.query(
      `UPDATE security_violations SET restriction_id =
         (SELECT id FROM security_restrictions WHERE violation_id = $1 ORDER BY created_at DESC LIMIT 1)
       WHERE id = $1`,
      [violationId]
    );

    return { violationId, strike, penalty, restrictionUntil };
  });

  await notify(
    input.userId,
    'security_warning',
    outcome.penalty.warningTitle,
    outcome.penalty.warningBody,
    {
      violationId: outcome.violationId,
      category: input.category,
      categoryLabel: categoryLabel(input.category),
      severity: input.severity,
      strike: outcome.strike,
      decision: outcome.penalty.decision,
      until: outcome.restrictionUntil,
      penalty: outcome.penalty.penaltyLabel,
    }
  );

  return {
    violationId: outcome.violationId,
    strike: outcome.strike,
    decision: outcome.penalty.decision,
    penalty: outcome.penalty,
    restrictionUntil: outcome.restrictionUntil,
  };
}

export interface ModerationResult {
  allowed: boolean;
  action: Decision | 'allow';
  category: string | null;
  severity: Severity | null;
  reason: string | null;
  violationId?: string;
  strike?: number;
  until?: string | null;
  classification?: TextClassification;
}

function thresholdFor(config: SecurityConfig): number {
  if (config.sensitivity === 'high') return 0.55;
  if (config.sensitivity === 'low') return 0.85;
  return 0.7;
}

/**
 * Scans one piece of text (chat message, profile name, bio, room name …).
 * Returns `allowed: false` when the content must not be stored/published, and
 * has already recorded the violation + penalty by the time it resolves.
 */
export async function moderateTextForUser(input: {
  userId: string;
  text: string;
  surface: string;
  /** Skip the penalty for an edit of a value that already passed (not used today). */
  dryRun?: boolean;
}): Promise<ModerationResult> {
  const config = await getSecurityConfig();
  if (!config.enabled) return { allowed: true, action: 'allow', category: null, severity: null, reason: null };
  if (await isTrusted(input.userId)) {
    return { allowed: true, action: 'allow', category: null, severity: null, reason: null };
  }

  const classification = classifyText(input.text, config.custom_blocked_words);
  if (classification.clean) {
    return { allowed: true, action: 'allow', category: null, severity: null, reason: null, classification };
  }
  if (classification.engine !== 'text' && !config.engines[classification.engine]) {
    return { allowed: true, action: 'allow', category: null, severity: null, reason: null, classification };
  }
  if (!config.engines.text) {
    return { allowed: true, action: 'allow', category: null, severity: null, reason: null, classification };
  }

  const threshold = thresholdFor(config);
  const severity = classification.severity ?? 'low';

  // Admin whitelist: a listed word/phrase suppresses a low/medium finding
  // (high and critical categories are never whitelisted).
  if (
    config.whitelist_words.length &&
    severity !== 'high' &&
    severity !== 'critical' &&
    config.whitelist_words.some((word) => normalizeArabic(input.text).includes(normalizeArabic(word)))
  ) {
    return { allowed: true, action: 'allow', category: null, severity: null, reason: null, classification };
  }
  const severeEnough = severity === 'critical' || severity === 'high';
  const confidence = classification.confidence;
  if (!severeEnough && confidence < threshold) {
    return { allowed: true, action: 'allow', category: null, severity, reason: null, classification };
  }

  if (input.dryRun) {
    return {
      allowed: false,
      action: 'block',
      category: classification.category,
      severity,
      reason: `تصنيف تجريبي: ${categoryLabel(classification.category)}`,
      classification,
    };
  }

  // A single mild insult inside a clear joke, on a clean record, is not punished.
  if (classification.humour) {
    const row = await one<{ security_strikes: number }>(
      'SELECT security_strikes FROM users WHERE id = $1',
      [input.userId]
    );
    if (!row?.security_strikes) {
      return {
        allowed: true,
        action: 'allow',
        category: classification.category,
        severity,
        reason: null,
        classification,
      };
    }
  }

  const outcome = await applyViolation({
    userId: input.userId,
    engine: classification.engine,
    category: classification.category ?? 'insult',
    severity,
    confidence,
    surface: input.surface,
    excerpt: input.text,
    matches: classification.matches,
  });

  return {
    allowed: false,
    action: outcome.decision,
    category: classification.category,
    severity,
    reason: outcome.penalty.warningBody,
    violationId: outcome.violationId,
    strike: outcome.strike,
    until: outcome.restrictionUntil,
    classification,
  };
}

/** Throws a 403 the client can render when a capability is currently restricted. */
export async function assertCapability(userId: string, capability: Capability): Promise<void> {
  const user = await one<{ suspended_until: string | null; is_banned: boolean; ban_reason: string | null }>(
    'SELECT suspended_until, is_banned, ban_reason FROM users WHERE id = $1',
    [userId]
  );
  if (!user) throw new HttpError(401, 'Account not found', 'account_missing');
  if (user.is_banned) {
    throw new HttpError(403, user.ban_reason || 'Account is banned', 'banned', {
      capability: 'account',
      permanent: true,
    });
  }
  if (user.suspended_until && new Date(user.suspended_until).getTime() > Date.now()) {
    throw new HttpError(403, 'Your account is temporarily suspended', 'account_suspended', {
      capability: 'account',
      until: user.suspended_until,
    });
  }
  if (capability === 'account') return;

  const restriction = await one<{ capability: string; reason: string; expires_at: string | null }>(
    `SELECT capability, reason, expires_at FROM security_restrictions
     WHERE user_id = $1 AND capability = $2 AND lifted_at IS NULL
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY created_at DESC LIMIT 1`,
    [userId, capability]
  );
  if (restriction) {
    throw new HttpError(
      403,
      `تم تقييد ${capabilityLabel(capability)} مؤقتاً: ${restriction.reason}`,
      'restricted',
      { capability, until: restriction.expires_at, reason: restriction.reason }
    );
  }
}

export async function activeRestrictions(userId: string) {
  const rows = await q<{
    id: string;
    capability: string;
    reason: string;
    expires_at: string | null;
    created_at: string;
  }>(
    `SELECT id, capability, reason, expires_at, created_at FROM security_restrictions
     WHERE user_id = $1 AND lifted_at IS NULL AND (expires_at IS NULL OR expires_at > now())
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    capability: row.capability,
    label: capabilityLabel(row.capability),
    reason: row.reason,
    expiresAt: row.expires_at,
    permanent: row.expires_at === null,
    createdAt: row.created_at,
  }));
}

export async function securityStatus(userId: string) {
  const user = await one<{
    security_strikes: number;
    suspended_until: string | null;
    is_banned: boolean;
    ban_reason: string | null;
  }>('SELECT security_strikes, suspended_until, is_banned, ban_reason FROM users WHERE id = $1', [userId]);

  const warnings = await q<{
    id: string;
    engine: string;
    category: string;
    severity: string;
    decision: string;
    strike: number;
    excerpt: string | null;
    created_at: string;
  }>(
    `SELECT id, engine, category, severity, decision, strike, excerpt, created_at
     FROM security_violations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`,
    [userId]
  );

  const appeals = await q<{
    id: string;
    violation_id: string | null;
    message: string;
    status: string;
    resolution: string | null;
    auto_resolved: boolean;
    created_at: string;
    resolved_at: string | null;
  }>(
    `SELECT id, violation_id, message, status, resolution, auto_resolved, created_at, resolved_at
     FROM security_appeals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [userId]
  );

  const config = await getSecurityConfig();
  const suspended = Boolean(user?.suspended_until && new Date(user.suspended_until).getTime() > Date.now());

  return {
    strikes: Number(user?.security_strikes ?? 0),
    suspended,
    suspendedUntil: suspended ? user?.suspended_until : null,
    banned: Boolean(user?.is_banned),
    banReason: user?.ban_reason ?? null,
    restrictions: await activeRestrictions(userId),
    warnings: warnings.map((row) => ({
      id: row.id,
      engine: row.engine,
      category: row.category,
      categoryLabel: categoryLabel(row.category),
      severity: row.severity,
      decision: row.decision,
      strike: row.strike,
      excerpt: row.excerpt,
      createdAt: row.created_at,
    })),
    appeals: appeals.map((row) => ({
      id: row.id,
      violationId: row.violation_id,
      message: row.message,
      status: row.status,
      resolution: row.resolution,
      autoResolved: row.auto_resolved,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
    })),
    config: { enabled: config.enabled, appealAutoAcceptConfidence: config.appeal_auto_accept_confidence },
  };
}

/** Repeated identical messages or a message burst → spam penalty. */
export async function detectSpamBurst(input: {
  userId: string;
  conversationId?: string | null;
  roomId?: string | null;
  body: string;
}): Promise<ModerationResult> {
  const config = await getSecurityConfig();
  if (!config.enabled || !config.engines.spam) {
    return { allowed: true, action: 'allow', category: null, severity: null, reason: null };
  }
  if (await isTrusted(input.userId)) {
    return { allowed: true, action: 'allow', category: null, severity: null, reason: null };
  }
  const fp = fingerprint(input.body);
  if (fp.length < 2) return { allowed: true, action: 'allow', category: null, severity: null, reason: null };

  const recent = input.conversationId
    ? await q<{ body: string }>(
        `SELECT body FROM messages WHERE sender_id = $1 AND conversation_id = $2
         ORDER BY created_at DESC LIMIT 6`,
        [input.userId, input.conversationId]
      )
    : await q<{ body: string }>(
        `SELECT body FROM room_messages WHERE user_id = $1 AND room_id = $2
         ORDER BY created_at DESC LIMIT 6`,
        [input.userId, input.roomId]
      );
  const repeats = recent.filter((row) => fingerprint(row.body) === fp).length;

  const burst = await one<{ count: string }>(
    `SELECT count(*)::text AS count FROM messages
     WHERE sender_id = $1 AND created_at > now() - interval '30 seconds'`,
    [input.userId]
  );

  if (repeats < 2 && Number(burst?.count ?? 0) < 25) {
    return { allowed: true, action: 'allow', category: null, severity: null, reason: null };
  }

  const outcome = await applyViolation({
    userId: input.userId,
    engine: 'spam',
    category: 'spam',
    severity: 'medium',
    confidence: repeats >= 2 ? 0.92 : 0.8,
    surface: input.conversationId ? 'private_chat' : 'room_chat',
    excerpt: input.body,
    matches: [{ kind: 'burst', repeats, recent: Number(burst?.count ?? 0) }],
  });

  return {
    allowed: false,
    action: outcome.decision,
    category: 'spam',
    severity: 'medium',
    reason: outcome.penalty.warningBody,
    violationId: outcome.violationId,
    strike: outcome.strike,
    until: outcome.restrictionUntil,
  };
}

export async function moderateMediaForUser(input: {
  userId: string;
  filePath: string;
  filename: string;
  mime: string;
  kind: 'image' | 'video' | 'audio';
  surface: string;
}): Promise<{ allowed: boolean; verdict: MediaVerdict; reason: string | null }> {
  const config = await getSecurityConfig();
  if (!config.enabled) {
    return {
      allowed: true,
      verdict: { allowed: true, hash: '', provider: 'local', category: null, severity: null, confidence: 0, reason: null, details: {} },
      reason: null,
    };
  }
  if (input.kind !== 'audio' && !config.engines[input.kind]) {
    return {
      allowed: true,
      verdict: { allowed: true, hash: '', provider: 'local', category: null, severity: null, confidence: 0, reason: null, details: {} },
      reason: null,
    };
  }
  if (await isTrusted(input.userId)) {
    const verdict = await moderateMediaFile({
      filePath: input.filePath,
      filename: input.filename,
      mime: input.mime,
      kind: input.kind,
    });
    return { allowed: true, verdict, reason: null };
  }

  const verdict = await moderateMediaFile({
    filePath: input.filePath,
    filename: input.filename,
    mime: input.mime,
    kind: input.kind,
  });
  if (verdict.allowed) return { allowed: true, verdict, reason: null };

  const outcome = await applyViolation({
    userId: input.userId,
    engine: input.kind === 'video' ? 'video' : 'image',
    category: verdict.category ?? 'media_blocked',
    severity: verdict.severity ?? 'high',
    confidence: verdict.confidence,
    surface: input.surface,
    excerpt: input.filename,
    matches: [{ hash: verdict.hash, provider: verdict.provider }],
    evidence: { hash: verdict.hash, filename: input.filename, mime: input.mime, ...verdict.details },
  });

  return { allowed: false, verdict, reason: outcome.penalty.warningBody };
}

/** Re-checks an attachment that is already stored (`/uploads/...`). */
export async function moderateAttachmentForUser(input: {
  userId: string;
  url: string;
  filename?: string | null;
  surface: string;
}): Promise<{ allowed: boolean; reason: string | null }> {
  if (!input.url) return { allowed: true, reason: null };
  const config = await getSecurityConfig();
  if (!config.enabled) return { allowed: true, reason: null };
  if (await isTrusted(input.userId)) return { allowed: true, reason: null };
  const verdict = await moderateStoredMedia(input.url, input.filename ?? undefined);
  if (!verdict || verdict.allowed) return { allowed: true, reason: null };
  const kind = verdict.hash && input.url.match(/\.(mp4|webm|mov|m4v|3gp)$/i) ? 'video' : 'image';
  const outcome = await applyViolation({
    userId: input.userId,
    engine: kind,
    category: verdict.category ?? 'media_blocked',
    severity: verdict.severity ?? 'high',
    confidence: verdict.confidence,
    surface: input.surface,
    excerpt: input.filename ?? input.url,
    matches: [{ hash: verdict.hash, provider: verdict.provider }],
    evidence: { hash: verdict.hash, url: input.url, ...verdict.details },
  });
  return { allowed: false, reason: outcome.penalty.warningBody };
}

/** Voice moderation: the client (or a speech-to-text bridge) sends a transcript snippet. */
export async function moderateVoiceTranscript(input: {
  userId: string;
  roomId: string;
  transcript: string;
}): Promise<ModerationResult & { muted: boolean }> {
  const config = await getSecurityConfig();
  if (!config.enabled || !config.engines.voice) {
    return { allowed: true, action: 'allow', category: null, severity: null, reason: null, muted: false };
  }
  const result = await moderateTextForUser({
    userId: input.userId,
    text: input.transcript,
    surface: 'voice',
  });
  if (result.allowed) return { ...result, muted: false };

  const seat = await one<{ id: string }>(
    'SELECT id FROM room_mics WHERE room_id = $1 AND user_id = $2 LIMIT 1',
    [input.roomId, input.userId]
  );
  if (seat) {
    await q('UPDATE room_mics SET muted = true WHERE id = $1', [seat.id]);
    emitToUser(input.userId, 'room:force_mute', { roomId: input.roomId, micId: seat.id, muted: true });
    broadcast('room', { roomId: input.roomId });
  }
  return { ...result, muted: Boolean(seat) };
}

export async function submitAppeal(input: {
  userId: string;
  message: string;
  violationId?: string | null;
}) {
  const config = await getSecurityConfig();
  const violation = input.violationId
    ? await one<{
        id: string;
        confidence: number;
        status: string;
        strike: number;
        category: string;
        severity: string;
        restriction_id: string | null;
      }>(
        'SELECT id, confidence, status, strike, category, severity, restriction_id FROM security_violations WHERE id = $1 AND user_id = $2',
        [input.violationId, input.userId]
      )
    : await one<{
        id: string;
        confidence: number;
        status: string;
        strike: number;
        category: string;
        severity: string;
        restriction_id: string | null;
      }>(
        `SELECT id, confidence, status, strike, category, severity, restriction_id FROM security_violations
         WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [input.userId]
      );
  if (!violation) throw new HttpError(404, 'No penalty found to appeal', 'no_violation');

  const appeal = await one<{ id: string; created_at: string }>(
    `INSERT INTO security_appeals (user_id, violation_id, restriction_id, message)
     VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [input.userId, violation.id, violation.restriction_id, input.message.slice(0, 1000)]
  );
  if (!appeal) throw new HttpError(500, 'Could not create the appeal', 'appeal_failed');

  // Only low/medium severity findings can clear automatically; serious ones
  // (threats, fraud, impersonation, child safety) always wait for a human.
  const autoAccept =
    violation.status === 'dismissed' ||
    ((violation.severity === 'low' || violation.severity === 'medium') &&
      Number(violation.confidence) < config.appeal_auto_accept_confidence);
  if (autoAccept) {
    await liftViolationPenalty(violation.id, input.userId, true);
    await q(
      `UPDATE security_appeals SET status = 'accepted', auto_resolved = true,
         resolution = 'تم قبول الاعتراض تلقائياً لانخفاض مستوى الثقة في التصنيف وإعادة الصلاحيات.',
         resolved_at = now() WHERE id = $1`,
      [appeal.id]
    );
    await notify(input.userId, 'security_appeal', 'تم قبول اعتراضك', 'أعاد النظام صلاحيات حسابك بعد مراجعة آلية للتصنيف.', {
      appealId: appeal.id,
      status: 'accepted',
    });
    return { id: appeal.id, status: 'accepted', autoResolved: true };
  }

  await notify(input.userId, 'security_appeal', 'تم استلام اعتراضك', 'سيتم مراجعة اعتراضك من فريق السلامة.', {
    appealId: appeal.id,
    status: 'pending',
  });
  return { id: appeal.id, status: 'pending', autoResolved: false };
}

async function liftViolationPenalty(violationId: string, userId: string, decrementStrike: boolean) {
  await q(
    `UPDATE security_restrictions SET lifted_at = now()
     WHERE violation_id = $1 AND lifted_at IS NULL`,
    [violationId]
  );
  const stillSuspended = await one(
    `SELECT 1 FROM security_restrictions
     WHERE user_id = $1 AND capability = 'account' AND lifted_at IS NULL
       AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`,
    [userId]
  );
  if (!stillSuspended) {
    await q('UPDATE users SET suspended_until = NULL WHERE id = $1', [userId]);
  }
  if (decrementStrike) {
    await q('UPDATE users SET security_strikes = GREATEST(security_strikes - 1, 0) WHERE id = $1', [userId]);
  }
}

export async function dismissViolation(adminId: string, violationId: string, note?: string) {
  const violation = await one<{ id: string; user_id: string; category: string; decision: string }>(
    'SELECT id, user_id, category, decision FROM security_violations WHERE id = $1',
    [violationId]
  );
  if (!violation) throw new HttpError(404, 'Violation not found', 'violation_not_found');
  await q(
    "UPDATE security_violations SET status = 'dismissed', reviewed_by = $2, reviewed_at = now() WHERE id = $1",
    [violationId, adminId]
  );
  await liftViolationPenalty(violationId, violation.user_id, true);
  await notify(
    violation.user_id,
    'security_appeal',
    'تم رفع العقوبة',
    `راجع فريق السلامة الحالة وتم رفع العقوبة${note ? `: ${note}` : ''}.`,
    { violationId, status: 'dismissed' }
  );
  return { dismissed: true };
}

export async function upholdViolation(adminId: string, violationId: string, note?: string) {
  const violation = await one<{ id: string; user_id: string }>(
    'SELECT id, user_id FROM security_violations WHERE id = $1',
    [violationId]
  );
  if (!violation) throw new HttpError(404, 'Violation not found', 'violation_not_found');
  await q(
    "UPDATE security_violations SET status = 'upheld', reviewed_by = $2, reviewed_at = now() WHERE id = $1",
    [violationId, adminId]
  );
  await notify(violation.user_id, 'security_appeal', 'تم تثبيت العقوبة', note || 'راجع فريق السلامة الحالة وثبّت العقوبة المطبقة.', {
    violationId,
    status: 'upheld',
  });
  return { upheld: true };
}

export async function resolveAppeal(input: {
  adminId: string;
  appealId: string;
  status: 'accepted' | 'rejected';
  note?: string;
}) {
  const appeal = await one<{ id: string; user_id: string; violation_id: string | null }>(
    'SELECT id, user_id, violation_id FROM security_appeals WHERE id = $1',
    [input.appealId]
  );
  if (!appeal) throw new HttpError(404, 'Appeal not found', 'appeal_not_found');

  if (input.status === 'accepted' && appeal.violation_id) {
    await q("UPDATE security_violations SET status = 'dismissed', reviewed_by = $2, reviewed_at = now() WHERE id = $1", [
      appeal.violation_id,
      input.adminId,
    ]);
    await liftViolationPenalty(appeal.violation_id, appeal.user_id, true);
  }

  await q(
    `UPDATE security_appeals SET status = $2, resolution = $3, resolved_by = $4, resolved_at = now() WHERE id = $1`,
    [input.appealId, input.status, input.note || null, input.adminId]
  );
  await notify(
    appeal.user_id,
    'security_appeal',
    input.status === 'accepted' ? 'تم قبول اعتراضك' : 'تم رفض اعتراضك',
    input.note || (input.status === 'accepted' ? 'أعاد النظام صلاحيات حسابك.' : 'راجع فريق السلامة الحالة وأبقى العقوبة.'),
    { appealId: appeal.id, status: input.status }
  );
  return { resolved: true, status: input.status };
}

export async function listViolations(filters: { engine?: string; category?: string; limit?: number }) {
  const params: unknown[] = [];
  let where = 'WHERE 1=1';
  if (filters.engine) {
    params.push(filters.engine);
    where += ` AND v.engine = $${params.length}`;
  }
  if (filters.category) {
    params.push(filters.category);
    where += ` AND v.category = $${params.length}`;
  }
  const limit = Math.min(200, Math.max(1, filters.limit ?? 60));
  const rows = await q<{
    id: string;
    user_id: string;
    username: string;
    display_name: string;
    engine: string;
    category: string;
    severity: string;
    confidence: string;
    surface: string;
    excerpt: string | null;
    decision: string;
    strike: number;
    status: string;
    created_at: string;
  }>(
    `SELECT v.id, v.user_id, u.username, u.display_name, v.engine, v.category, v.severity,
            v.confidence, v.surface, v.excerpt, v.decision, v.strike, v.status, v.created_at
     FROM security_violations v JOIN users u ON u.id = v.user_id
     ${where}
     ORDER BY v.created_at DESC LIMIT ${limit}`,
    params
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    engine: row.engine,
    category: row.category,
    categoryLabel: categoryLabel(row.category),
    severity: row.severity,
    confidence: Number(row.confidence),
    surface: row.surface,
    excerpt: row.excerpt,
    decision: row.decision,
    strike: row.strike,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export async function listAppeals(status?: string) {
  const params: unknown[] = [];
  let where = 'WHERE 1=1';
  if (status) {
    params.push(status);
    where += ` AND a.status = $${params.length}`;
  }
  const rows = await q<{
    id: string;
    user_id: string;
    username: string;
    display_name: string;
    message: string;
    status: string;
    resolution: string | null;
    auto_resolved: boolean;
    category: string | null;
    decision: string | null;
    created_at: string;
    resolved_at: string | null;
  }>(
    `SELECT a.id, a.user_id, u.username, u.display_name, a.message, a.status, a.resolution,
            a.auto_resolved, v.category, v.decision, a.created_at, a.resolved_at
     FROM security_appeals a
     JOIN users u ON u.id = a.user_id
     LEFT JOIN security_violations v ON v.id = a.violation_id
     ${where}
     ORDER BY a.created_at DESC LIMIT 100`,
    params
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    message: row.message,
    status: row.status,
    resolution: row.resolution,
    autoResolved: row.auto_resolved,
    category: row.category,
    categoryLabel: row.category ? categoryLabel(row.category) : null,
    decision: row.decision,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));
}

export async function securityOverview() {
  const startOfDay = "(date_trunc('day', now() AT TIME ZONE 'Asia/Baghdad') AT TIME ZONE 'Asia/Baghdad')";
  const [today, totals, suspended, topCategories, byEngine, recent, appeals] = await Promise.all([
    one<{
      violations: string;
      warnings: string;
      media: string;
      messages: string;
      profanity: string;
      fraud: string;
      impersonation: string;
      spam: string;
    }>(
      `SELECT count(*)::text AS violations,
              count(*) FILTER (WHERE decision IN ('block','suspend','ban'))::text AS warnings,
              count(*) FILTER (WHERE engine IN ('image','video') AND decision <> 'allow')::text AS media,
              count(*) FILTER (WHERE engine = 'text')::text AS messages,
              count(*) FILTER (WHERE category IN ('insult','sexual_insult','profanity','harassment'))::text AS profanity,
              count(*) FILTER (WHERE category IN ('fraud','phishing'))::text AS fraud,
              count(*) FILTER (WHERE category = 'impersonation')::text AS impersonation,
              count(*) FILTER (WHERE category = 'spam')::text AS spam
       FROM security_violations WHERE created_at >= ${startOfDay}`
    ),
    one<{ violations: string; bans: string }>(
      `SELECT count(*)::text AS violations,
              count(*) FILTER (WHERE decision = 'ban')::text AS bans
       FROM security_violations`
    ),
    one<{ count: string }>(
      `SELECT count(*)::text AS count FROM users
       WHERE is_banned = true OR (suspended_until IS NOT NULL AND suspended_until > now())`
    ),
    q<{ category: string; count: string }>(
      `SELECT category, count(*)::text AS count FROM security_violations
       WHERE created_at > now() - interval '7 days'
       GROUP BY category ORDER BY count(*) DESC LIMIT 8`
    ),
    q<{ engine: string; count: string }>(
      `SELECT engine, count(*)::text AS count FROM security_violations
       WHERE created_at > now() - interval '7 days' GROUP BY engine`
    ),
    listViolations({ limit: 12 }),
    one<{ pending: string; total: string }>(
      `SELECT count(*) FILTER (WHERE status = 'pending')::text AS pending,
              count(*)::text AS total FROM security_appeals`
    ),
  ]);

  return {
    today: {
      violations: Number(today?.violations ?? 0),
      warnings: Number(today?.warnings ?? 0),
      rejectedMedia: Number(today?.media ?? 0),
      messageViolations: Number(today?.messages ?? 0),
      profanityCases: Number(today?.profanity ?? 0),
      fraudCases: Number(today?.fraud ?? 0),
      impersonationCases: Number(today?.impersonation ?? 0),
      spamCases: Number(today?.spam ?? 0),
    },
    totals: {
      violations: Number(totals?.violations ?? 0),
      permanentBans: Number(totals?.bans ?? 0),
    },
    suspendedAccounts: Number(suspended?.count ?? 0),
    topCategories: topCategories.map((row) => ({
      category: row.category,
      label: categoryLabel(row.category),
      count: Number(row.count),
    })),
    engines: byEngine.map((row) => ({ engine: row.engine, count: Number(row.count) })),
    recent,
    appeals: { pending: Number(appeals?.pending ?? 0), total: Number(appeals?.total ?? 0) },
    provider: {
      externalMedia: Boolean(process.env.MODERATION_API_KEY || process.env.OPENAI_API_KEY),
    },
  };
}

export async function listMediaHashes() {
  return q<{ hash: string; reason: string; created_at: string }>(
    'SELECT hash, reason, created_at FROM security_media_hashes ORDER BY created_at DESC LIMIT 200'
  );
}

export async function addMediaHash(hash: string, reason: string) {
  const clean = String(hash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(clean)) {
    throw new HttpError(400, 'Hash must be a sha256 hex digest', 'invalid_hash');
  }
  await q(
    `INSERT INTO security_media_hashes (hash, reason) VALUES ($1, $2)
     ON CONFLICT (hash) DO UPDATE SET reason = EXCLUDED.reason`,
    [clean, String(reason || 'محظور من الإدارة').slice(0, 200)]
  );
  return { hash: clean };
}

export async function removeMediaHash(hash: string) {
  await q('DELETE FROM security_media_hashes WHERE hash = $1', [hash]);
  return { removed: true };
}
