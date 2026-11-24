import { Router } from 'express';
import { requireAdmin } from '../auth';
import {
  adminBackgroundsOverview,
  createBackground,
  deleteBackground,
  publishBackground,
  updateBackground,
} from '../backgrounds';
import { HttpError, asyncHandler } from '../utils';
import { imageUpload } from './uploads';

const router = Router();
router.use(requireAdmin());

router.get(
  '/backgrounds',
  asyncHandler(async (_req, res) => {
    res.json(await adminBackgroundsOverview());
  })
);

router.post(
  '/backgrounds/upload',
  imageUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file received', 'missing_file');
    res.status(201).json({ url: `/uploads/${req.file.filename}`, size: req.file.size });
  })
);

router.post(
  '/backgrounds',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const row = await createBackground({
      slot: body.slot,
      title: body.title,
      imageUrl: body.imageUrl,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      publish: body.publish === true,
    });
    res.status(201).json({ background: { id: row.id, slot: row.slot } });
  })
);

router.patch(
  '/backgrounds/:id',
  asyncHandler(async (req, res) => {
    await updateBackground(req.params.id, req.body ?? {});
    res.json({ saved: true });
  })
);

router.post(
  '/backgrounds/:id/publish',
  asyncHandler(async (req, res) => {
    await publishBackground(req.params.id);
    res.json({ published: true });
  })
);

router.delete(
  '/backgrounds/:id',
  asyncHandler(async (req, res) => {
    await deleteBackground(req.params.id);
    res.json({ deleted: true });
  })
);

export default router;
