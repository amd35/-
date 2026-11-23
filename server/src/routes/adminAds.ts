import { Router } from 'express';
import {
  adminAdsOverview,
  createAd,
  deleteAd,
  moveAd,
  toggleAd,
  updateAd,
} from '../ads';
import { requireAdmin } from '../auth';
import { HttpError, asyncHandler } from '../utils';
import { adUpload } from './uploads';

const router = Router();
router.use(requireAdmin());

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm']);

router.get(
  '/ads',
  asyncHandler(async (_req, res) => {
    res.json(await adminAdsOverview());
  })
);

router.post(
  '/ads/upload',
  adUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file received', 'missing_file');
    const extension = req.file.originalname.slice(req.file.originalname.lastIndexOf('.')).toLowerCase();
    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      mediaType: VIDEO_EXTENSIONS.has(extension) ? 'video' : 'image',
      size: req.file.size,
    });
  })
);

router.post(
  '/ads',
  asyncHandler(async (req, res) => {
    const row = await createAd(req.body ?? {});
    res.status(201).json({ ad: { id: row.id } });
  })
);

router.patch(
  '/ads/:id',
  asyncHandler(async (req, res) => {
    const row = await updateAd(req.params.id, req.body ?? {});
    res.json({ ad: { id: row.id } });
  })
);

router.post(
  '/ads/:id/toggle',
  asyncHandler(async (req, res) => {
    const row = await toggleAd(req.params.id);
    res.json({ isActive: row.is_active });
  })
);

router.post(
  '/ads/:id/move',
  asyncHandler(async (req, res) => {
    await moveAd(req.params.id, req.body?.direction);
    res.json({ moved: true });
  })
);

router.delete(
  '/ads/:id',
  asyncHandler(async (req, res) => {
    await deleteAd(req.params.id);
    res.json({ deleted: true });
  })
);

export default router;
