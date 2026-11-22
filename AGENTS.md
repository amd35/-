# Agent notes — Connect+ (non-obvious setup facts)

## Running the app
- The dev Compose file is **environment-owned** (`$BASE44_CONFIG_ROOT/docker-compose.base44.yml`), not in this repo.
  Run: `docker compose --project-name app --project-directory "$BASE44_PROJECT_ROOT" -f "$BASE44_CONFIG_ROOT/docker-compose.base44.yml" up -d`
- `web` serves port **3000** (public entry). `api` listens on 4000 inside the network and is published on **8000**.
- Both app services install dependencies on start (`npm ci`) into named volumes; source is bind-mounted,
  so edits hot-reload (`tsx watch` / `vite`). Do not add a `Dockerfile` that copies source — it would freeze the edit loop.
- `web` proxies `/api`, `/ws` (websocket) and `/uploads` to `api`, so everything is same-origin.

## Database
- Schema is applied automatically at API boot from `server/src/schema.sql` (all `CREATE ... IF NOT EXISTS`,
  idempotent). There is no separate migration service.
- The admin account is upserted from the `ADMIN_PASSWORD` secret on every boot (`admin_users.username = 'admin'`).
- `uploads/` is a named volume at `/workspace/uploads`; it is gitignored.

## Billing invariants (do not break)
- Free attempts live in `daily_free_calls`, keyed by **Baghdad date** computed with `Intl` on the server.
  `free_call_uses.call_id` is a primary key, so one attempt can never be linked to two calls.
- Coins are reserved **per minute** in `call_sessions` at accept and at each 60 s boundary; settlement
  charges `ceil(seconds*rate/60)` capped by the reservation and refunds the difference.
- `transactions` has a unique index on `(user_id, type, ref_id)`; all money helpers use
  `ON CONFLICT DO NOTHING` so retries/webhook replays cannot double-credit.
- `earnings.call_id` is unique — the earnings split can only be inserted once per call.
- On boot, `recoverStaleCalls()` closes calls left open by a restart and refunds unspent reservations.

## Verification
- `docker compose exec -T api npx tsx src/tests/e2e.ts` — 63 real checks (accounts, free attempts,
  reject/cancel, paid billing, refunds, earnings, auto-end, recharge idempotency, withdrawal,
  concurrency, chat read receipts, ban). It deletes the accounts it creates.
- Type checks: `npx tsc --noEmit` in both `server/` and `web/`.

## Preview specifics
- `web/vite.config.ts` adds the sandbox host wildcard and the public preview host to `allowedHosts`
  only when `BASE44_PREVIEW_MODE === '1'`; `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` is passed through.
- Without an SMS/SMTP provider, OTP codes and password-reset tokens are echoed in the API response
  **only** when `BASE44_PREVIEW_MODE === '1'`, so signup can be completed in the sandbox.
- Admin panel: `/admin`, username `admin`, password = the `ADMIN_PASSWORD` secret.
