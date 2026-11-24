import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { reqUser, requireAuth } from '../auth';
import { HttpError, asyncHandler } from '../utils';
import { assertCapability, moderateMediaForUser } from '../security/service';

export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.pdf',
  '.txt',
  '.doc',
  '.docx',
  '.mp3',
  '.m4a',
  '.ogg',
  '.webm',
  '.wav',
  '.aac',
  '.mp4',
  '.mov',
  '.m4v',
  '.3gp',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) {
      cb(new HttpError(400, 'This file type is not allowed', 'unsupported_file'));
      return;
    }
    cb(null, true);
  },
});

// App backgrounds: JPG/PNG/WebP plus animated GIF/WebP, compressed on the client first.
const IMAGE_ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

export const imageUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_ALLOWED.has(ext)) {
      cb(new HttpError(400, 'Only JPG, PNG, WebP or GIF images are allowed', 'unsupported_file'));
      return;
    }
    cb(null, true);
  },
});

// Gift media: MP4/WebM animations and cover images. Bigger limit than chat files.
const GIFT_ALLOWED = new Set(['.mp4', '.webm', '.png', '.jpg', '.jpeg', '.webp', '.gif']);

export const giftUpload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!GIFT_ALLOWED.has(ext)) {
      cb(new HttpError(400, 'Only MP4/WebM video or PNG/WebP/GIF images are allowed', 'unsupported_file'));
      return;
    }
    cb(null, true);
  },
});

// Ads: an image or a short video, uploaded from the admin panel.
const AD_ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.webm']);

export const adUpload = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!AD_ALLOWED.has(ext)) {
      cb(new HttpError(400, 'Only PNG/JPG/WebP/GIF images or MP4/WebM videos are allowed', 'unsupported_file'));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

router.post(
  '/',
  requireAuth(),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file received', 'missing_file');
    const file = req.file;
    try {
      const me = reqUser(req).id;
      await assertCapability(me, 'media');
      const kind = /^image\//.test(file.mimetype)
        ? 'image'
        : /^video\//.test(file.mimetype)
          ? 'video'
          : /^audio\//.test(file.mimetype)
            ? 'audio'
            : 'image';
      const moderation = await moderateMediaForUser({
        userId: me,
        filePath: file.path,
        filename: file.originalname,
        mime: file.mimetype,
        kind,
        surface: 'upload',
      });
      if (!moderation.allowed) {
        fs.unlinkSync(file.path);
        throw new HttpError(422, moderation.reason || 'تم رفض الملف لمخالفته سياسة السلامة', 'content_blocked', {
          category: moderation.verdict.category,
          provider: moderation.verdict.provider,
        });
      }
    } catch (error) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw error;
    }
    res.status(201).json({
      url: `/uploads/${file.filename}`,
      name: file.originalname,
      size: file.size,
      mime: file.mimetype,
    });
  })
);

export default router;
