import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { q } from '../db';
import type { Severity } from './lexicon';
import { mediaNameHint } from './text';

/**
 * Media moderation.
 *
 * Three layers, cheapest first:
 *  1. SHA-256 hash against the admin-managed blocklist (`security_media_hashes`).
 *  2. Filename/extension hints ("porn", "gore" …) — catches careless uploads.
 *  3. Optional external AI provider: an OpenAI-compatible moderation endpoint
 *     (`MODERATION_API_URL`, default OpenAI `omni-moderation-latest`) that is
 *     only called when `OPENAI_API_KEY` / `MODERATION_API_KEY` is configured.
 *
 * Without a provider key the server still enforces layers 1–2 and reports the
 * provider as `local`, so the pipeline never silently pretends to have
 * analysed pixels it did not see.
 */

export interface MediaVerdict {
  allowed: boolean;
  hash: string;
  provider: 'local' | 'external';
  category: string | null;
  severity: Severity | null;
  confidence: number;
  reason: string | null;
  details: Record<string, unknown>;
}

export function fileHash(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

async function hashBlocked(hash: string): Promise<string | null> {
  const row = await q<{ reason: string }>('SELECT reason FROM security_media_hashes WHERE hash = $1', [hash]);
  return row[0]?.reason ?? null;
}

interface ProviderResult {
  flagged: boolean;
  category: string | null;
  severity: Severity | null;
  confidence: number;
}

const SEVERITY_BY_CATEGORY: Record<string, Severity> = {
  'sexual/minors': 'critical',
  'sexual': 'high',
  'violence/graphic': 'high',
  'violence': 'high',
  'hate/threatening': 'high',
  'harassment/threatening': 'high',
  'hate': 'high',
  'harassment': 'medium',
  'self-harm/intent': 'high',
  'self-harm': 'medium',
  'self-harm/instructions': 'high',
};

async function providerCheck(filePath: string, mime: string): Promise<ProviderResult | null> {
  const key = process.env.MODERATION_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return null;
  const url = process.env.MODERATION_API_URL || 'https://api.openai.com/v1/moderations';
  const size = fs.statSync(filePath).size;
  // The moderation API accepts still images only; very large files are skipped.
  if (size > 8 * 1024 * 1024) return null;
  if (!/^image\//.test(mime)) return null;

  try {
    const base64 = fs.readFileSync(filePath).toString('base64');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.MODERATION_MODEL || 'omni-moderation-latest',
        input: [{ type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } }],
      }),
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      results?: {
        flagged?: boolean;
        categories?: Record<string, boolean>;
        category_scores?: Record<string, number>;
      }[];
    };
    const result = payload.results?.[0];
    if (!result) return null;
    const hit = Object.entries(result.categories ?? {})
      .filter(([, value]) => value)
      .map(([name]) => name)
      .sort((a, b) => (SEVERITY_BY_CATEGORY[b] ? 1 : 0) - (SEVERITY_BY_CATEGORY[a] ? 1 : 0))[0];
    if (!result.flagged || !hit) return { flagged: false, category: null, severity: null, confidence: 0 };
    return {
      flagged: true,
      category: hit.startsWith('sexual/minors')
        ? 'child_safety'
        : hit.startsWith('sexual')
          ? 'sexual'
          : hit.startsWith('violence')
            ? 'violence'
            : hit.startsWith('hate')
              ? 'racism'
              : 'harassment',
      severity: SEVERITY_BY_CATEGORY[hit] ?? 'high',
      confidence: Math.min(0.99, Math.max(0.75, Number(result.category_scores?.[hit] ?? 0.8))),
    };
  } catch {
    return null;
  }
}

export async function moderateMediaFile(options: {
  filePath: string;
  filename: string;
  mime: string;
  kind: 'image' | 'video' | 'audio';
}): Promise<MediaVerdict> {
  const hash = fileHash(options.filePath);

  const blockedReason = await hashBlocked(hash);
  if (blockedReason) {
    return {
      allowed: false,
      hash,
      provider: 'local',
      category: 'media_blocked',
      severity: 'high',
      confidence: 0.99,
      reason: blockedReason,
      details: { layer: 'hash' },
    };
  }

  const hint = mediaNameHint(options.filename || path.basename(options.filePath));
  if (hint && options.kind !== 'audio') {
    return {
      allowed: false,
      hash,
      provider: 'local',
      category: hint.term === 'cp' || hint.term === 'childporn' ? 'child_safety' : hint.severity === 'high' ? 'sexual' : 'media_blocked',
      severity: hint.severity,
      confidence: 0.7,
      reason: `اسم الملف يحتوي على "${hint.term}"`,
      details: { layer: 'filename', term: hint.term },
    };
  }

  if (options.kind === 'image') {
    const provider = await providerCheck(options.filePath, options.mime);
    if (provider?.flagged) {
      return {
        allowed: false,
        hash,
        provider: 'external',
        category: provider.category,
        severity: provider.severity,
        confidence: provider.confidence,
        reason: 'تحليل الذكاء الاصطناعي رصد محتوى مخالفاً في الصورة',
        details: { layer: 'provider', category: provider.category },
      };
    }
    if (provider) {
      return {
        allowed: true,
        hash,
        provider: 'external',
        category: null,
        severity: null,
        confidence: 0,
        reason: null,
        details: { layer: 'provider', flagged: false },
      };
    }
  }

  return {
    allowed: true,
    hash,
    provider: 'local',
    category: null,
    severity: null,
    confidence: 0,
    reason: null,
    details: { layer: 'local', providerConfigured: Boolean(process.env.MODERATION_API_KEY || process.env.OPENAI_API_KEY) },
  };
}

/** Checks an already-stored local upload (avatars arrive as `/uploads/<file>`). */
export async function moderateStoredMedia(url: string, filename?: string): Promise<MediaVerdict | null> {
  if (!url.startsWith('/uploads/')) return null;
  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  const filePath = path.join(uploadDir, path.basename(url));
  if (!fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).toLowerCase();
  const kind = ['.mp4', '.webm', '.mov', '.m4v', '.3gp'].includes(ext)
    ? 'video'
    : ['.mp3', '.m4a', '.ogg', '.wav', '.aac'].includes(ext)
      ? 'audio'
      : 'image';
  const mime = kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : 'image/jpeg';
  return moderateMediaFile({ filePath, filename: filename || path.basename(filePath), mime, kind });
}
