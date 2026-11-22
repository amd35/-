import http from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { pool, migrate, waitForDatabase } from './db';
import { attachRealtime, closeRealtime } from './realtime';
import { registerSocketHandlers } from './wsHandlers';
import { recoverStaleCalls, startBillingLoop } from './calls';
import { ensureBotUser } from './bot';
import { UPLOAD_DIR } from './routes/uploads';
import { HttpError } from './utils';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import callRoutes from './routes/calls';
import chatRoutes from './routes/chat';
import walletRoutes from './routes/wallet';
import notificationRoutes from './routes/notifications';
import uploadRoutes from './routes/uploads';
import frameRoutes from './routes/frames';
import giftRoutes from './routes/gifts';
import paymentRoutes from './routes/payments';
import roomRoutes from './routes/rooms';
import adminRoomRoutes from './routes/adminRooms';
import adminRoutes from './routes/admin';
import rankRoutes from './routes/ranks';
import levelRoutes from './routes/levels';
import adminProgressionRoutes from './routes/adminProgression';
import adminLookRoutes from './routes/adminLook';

const PORT = Number(process.env.PORT || 4000);
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(express.json({ limit: '2mb' }));

// The Android shell serves the UI from https://localhost (Capacitor), so API calls
// are cross-origin there. Browsers keep using the same-origin Vite/nginx proxy and
// send no Origin header, so this allowlist only affects native builds.
const CORS_ORIGINS = String(
  process.env.CORS_ORIGINS || 'https://localhost,capacitor://localhost,http://localhost,http://10.0.2.2'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true, uptime: Math.round(process.uptime()) });
  } catch (error) {
    res.status(503).json({ ok: false, db: false, error: (error as Error).message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/frames', frameRoutes);
app.use('/api/gifts', giftRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/ranks', rankRoutes);
app.use('/api/levels', levelRoutes);
app.use('/api/admin/rooms', adminRoomRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminProgressionRoutes);
app.use('/api/admin', adminLookRoutes);

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: true }));

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}`, code: 'not_found' });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
    return;
  }
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: `Upload failed: ${error.message}`, code: error.code });
    return;
  }
  if (error instanceof SyntaxError && 'body' in (error as object)) {
    res.status(400).json({ error: 'Malformed request body', code: 'invalid_json' });
    return;
  }
  const message = (error as Error)?.message || 'Unexpected error';
  if (message.includes('not allowed')) {
    res.status(400).json({ error: message, code: 'unsupported_file' });
    return;
  }
  console.error('[api] unhandled error', error);
  res.status(500).json({ error: 'Something went wrong', code: 'internal_error' });
});

const server = http.createServer(app);
attachRealtime(server);
registerSocketHandlers();

async function bootstrap(): Promise<void> {
  await waitForDatabase();
  await migrate();
  await ensureBotUser().catch((error) => console.error('[bot] seed failed', (error as Error).message));
  await recoverStaleCalls();
  startBillingLoop();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[api] listening on 0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('[api] failed to start', error);
  process.exit(1);
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    console.log(`[api] ${signal} received, shutting down`);
    closeRealtime();
    server.close(() => pool.end().then(() => process.exit(0)));
    // Drop idle keep-alive sockets so `close` fires immediately instead of
    // leaving the port refusing connections during a dev-server restart.
    server.closeAllConnections();
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
