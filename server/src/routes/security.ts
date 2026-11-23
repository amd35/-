import { Router } from 'express';
import { one } from '../db';
import { reqUser, requireAuth } from '../auth';
import { asyncHandler } from '../utils';
import { assertCapability, moderateVoiceTranscript, securityStatus, submitAppeal } from '../security/service';

const router = Router();

/** The signed-in user's own protection record: warnings, restrictions, appeals. */
router.get(
  '/status',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json(await securityStatus(reqUser(req).id));
  })
);

/** Plain-language policy, shown next to the appeal form. */
router.get('/policy', (_req, res) => {
  res.json({
    name: 'YALLA PHONE AI SECURITY',
    engines: [
      { id: 'text', label: 'Text Moderation', description: 'فحص الرسائل والأسماء والأوصاف والغرف' },
      { id: 'image', label: 'Image Moderation', description: 'فحص الصور قبل النشر أو الاستخدام' },
      { id: 'video', label: 'Video Moderation', description: 'فحص الفيديوهات قبل النشر' },
      { id: 'voice', label: 'Voice Moderation', description: 'تحليل نص الكلام في الغرف الصوتية بموافقة المستخدم' },
      { id: 'fraud', label: 'Fraud Detection', description: 'اكتشاف الاحتيال وروابط التصيد' },
      { id: 'account', label: 'Account Protection', description: 'حماية الحسابات من الاختراق والانتحال' },
      { id: 'spam', label: 'Anti-Spam', description: 'اكتشاف تكرار الرسائل والإزعاج' },
      { id: 'impersonation', label: 'Impersonation Detection', description: 'منع انتحال شخصية الإدارة والدعم والوكلاء' },
    ],
    ladder: [
      'تحذير أول',
      'تحذير ثانٍ + تقييد مؤقت 30 دقيقة',
      'تحذير نهائي + إيقاف ساعة',
      'إيقاف 24 ساعة',
      'إيقاف 7 أيام',
      'إيقاف 30 يوماً',
      'حظر دائم',
    ],
    serious: [
      'المحتوى الجنسي المتعلق بالأطفال',
      'التهديدات الخطيرة والابتزاز',
      'نشر المحتوى الجنسي غير الرضائي',
      'محاولات اختراق الحسابات',
      'الاحتيال المالي الخطير',
    ],
    privacy:
      'تُحلَّل الرسائل آلياً لغرض السلامة فقط، وتُحفظ مقتطفات قصيرة من المحتوى المخالف كدليل مع سبب القرار. لا تُستخدم المحادثات لأي غرض آخر ولا تُشارك مع أطراف ثالثة. يمكنك الاعتراض على أي عقوبة من مركز الحماية.',
  });
});

router.get(
  '/appeals',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const status = await securityStatus(reqUser(req).id);
    res.json({ appeals: status.appeals, strikes: status.strikes, restrictions: status.restrictions });
  })
);

/** «الاعتراض على العقوبة» — user explains their position; low-confidence cases clear automatically. */
router.post(
  '/appeals',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const message = String(req.body?.message || '').trim().slice(0, 1000);
    if (message.length < 10) {
      res.status(400).json({ error: 'اكتب توضيحاً لا يقل عن 10 أحرف', code: 'invalid_appeal' });
      return;
    }
    const result = await submitAppeal({
      userId: reqUser(req).id,
      message,
      violationId: req.body?.violationId ? String(req.body.violationId) : null,
    });
    res.status(201).json(result);
  })
);

/**
 * Voice moderation bridge. The room client (or an STT service) posts a short
 * transcript snippet while the user speaks; a confirmed violation mutes the
 * microphone server-side and applies the penalty ladder.
 */
router.post(
  '/voice-transcript',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const me = reqUser(req).id;
    await assertCapability(me, 'mic');
    const roomId = String(req.body?.roomId || '');
    const transcript = String(req.body?.transcript || '').slice(0, 2000);
    if (!roomId || transcript.trim().length < 2) {
      res.status(400).json({ error: 'Room and transcript are required', code: 'invalid_voice_sample' });
      return;
    }
    const seat = await one('SELECT 1 FROM room_mics WHERE room_id = $1 AND user_id = $2 LIMIT 1', [roomId, me]);
    if (!seat) {
      res.status(403).json({ error: 'You are not on a mic in this room', code: 'not_on_mic' });
      return;
    }
    const result = await moderateVoiceTranscript({ userId: me, roomId, transcript });
    res.json({
      allowed: result.allowed,
      muted: result.muted,
      category: result.category,
      reason: result.reason,
    });
  })
);

export default router;
