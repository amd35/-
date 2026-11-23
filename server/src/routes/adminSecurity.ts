import { Router } from 'express';
import { reqAdmin, requireAdmin } from '../auth';
import { asyncHandler } from '../utils';
import { classifyText } from '../security/text';
import {
  addMediaHash,
  dismissViolation,
  getSecurityConfig,
  listAppeals,
  listMediaHashes,
  listViolations,
  removeMediaHash,
  resolveAppeal,
  saveSecurityConfig,
  securityOverview,
  upholdViolation,
  type SecurityConfig,
} from '../security/service';

const router = Router();
router.use(requireAdmin());

/** Dashboard: today's counters, top categories, engine breakdown and recent penalties. */
router.get(
  '/security/overview',
  asyncHandler(async (_req, res) => {
    res.json({ overview: await securityOverview(), config: await getSecurityConfig(true) });
  })
);

router.get(
  '/security/violations',
  asyncHandler(async (req, res) => {
    res.json({
      violations: await listViolations({
        engine: req.query.engine ? String(req.query.engine) : undefined,
        category: req.query.category ? String(req.query.category) : undefined,
        limit: Number(req.query.limit) || 60,
      }),
    });
  })
);

router.post(
  '/security/violations/:id/dismiss',
  asyncHandler(async (req, res) => {
    res.json(await dismissViolation(reqAdmin(req).id, req.params.id, req.body?.note ? String(req.body.note) : undefined));
  })
);

router.post(
  '/security/violations/:id/uphold',
  asyncHandler(async (req, res) => {
    res.json(await upholdViolation(reqAdmin(req).id, req.params.id, req.body?.note ? String(req.body.note) : undefined));
  })
);

router.get(
  '/security/appeals',
  asyncHandler(async (req, res) => {
    res.json({
      appeals: await listAppeals(req.query.status ? String(req.query.status) : undefined),
    });
  })
);

router.post(
  '/security/appeals/:id/resolve',
  asyncHandler(async (req, res) => {
    const status = req.body?.status === 'accepted' ? 'accepted' : 'rejected';
    res.json(
      await resolveAppeal({
        adminId: reqAdmin(req).id,
        appealId: req.params.id,
        status,
        note: req.body?.note ? String(req.body.note) : undefined,
      })
    );
  })
);

router.get(
  '/security/settings',
  asyncHandler(async (_req, res) => {
    res.json({ config: await getSecurityConfig(true) });
  })
);

router.put(
  '/security/settings',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Partial<SecurityConfig>;
    const patch: Partial<SecurityConfig> = {};
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (body.sensitivity === 'low' || body.sensitivity === 'normal' || body.sensitivity === 'high') {
      patch.sensitivity = body.sensitivity;
    }
    if (typeof body.auto_penalties === 'boolean') patch.auto_penalties = body.auto_penalties;
    if (body.engines && typeof body.engines === 'object') {
      patch.engines = body.engines as SecurityConfig['engines'];
    }
    if (Array.isArray(body.custom_blocked_words)) {
      patch.custom_blocked_words = body.custom_blocked_words
        .map((word) => String(word).trim())
        .filter(Boolean)
        .slice(0, 500);
    }
    if (Array.isArray(body.whitelist_words)) {
      patch.whitelist_words = body.whitelist_words
        .map((word) => String(word).trim())
        .filter(Boolean)
        .slice(0, 500);
    }
    if (typeof body.appeal_auto_accept_confidence === 'number') {
      patch.appeal_auto_accept_confidence = Math.min(0.99, Math.max(0, body.appeal_auto_accept_confidence));
    }
    res.json({ config: await saveSecurityConfig(patch) });
  })
);

router.get(
  '/security/hashes',
  asyncHandler(async (_req, res) => {
    res.json({ hashes: await listMediaHashes() });
  })
);

router.post(
  '/security/hashes',
  asyncHandler(async (req, res) => {
    res.status(201).json(await addMediaHash(String(req.body?.hash || ''), String(req.body?.reason || '')));
  })
);

router.delete(
  '/security/hashes/:hash',
  asyncHandler(async (req, res) => {
    res.json(await removeMediaHash(req.params.hash));
  })
);

/** Live tester: paste a message and see the exact rule classification. */
router.post(
  '/security/test',
  asyncHandler(async (req, res) => {
    const config = await getSecurityConfig(true);
    const text = String(req.body?.text || '');
    const classification = classifyText(text, config.custom_blocked_words);
    res.json({ classification });
  })
);

export default router;
