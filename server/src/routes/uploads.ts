import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth';
import { HttpError } from '../utils';

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

router.post('/', requireAuth(), upload.single('file'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file received', 'missing_file');
  res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    name: req.file.originalname,
    size: req.file.size,
    mime: req.file.mimetype,
  });
});

export default router;
