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

## Android shell (Capacitor)
- `web/android/` is a Capacitor 8 project (`appId com.connectplus.app`), configured by `web/capacitor.config.ts`.
  After any `web/` change run `npm run sync:android` (builds `dist`, then `cap sync`) before Gradle builds.
- Native builds need `VITE_API_URL` = public HTTPS API origin (no `/api`, no trailing slash): the WebView is
  served from `https://localhost`, so `web/src/lib/api.ts` prefixes API calls and `/uploads` URLs (`assetUrl()`).
- Server CORS: `CORS_ORIGINS` (comma separated) allowlists the Capacitor origins; browsers stay same-origin
  through the Vite proxy and are unaffected.
- `web/src/lib/native.ts` (dynamic imports, no-op in a browser): status bar, splash, Android back button.
- Manifest permissions: CAMERA/RECORD_AUDIO for WebRTC, POST_NOTIFICATIONS. Cleartext HTTP is blocked except
  `10.0.2.2`/`localhost` (`res/xml/network_security_config.xml`).
- The host has no JDK/Android SDK, but an APK can be built in a throwaway `eclipse-temurin:21-jdk` container
  with the SDK kept in the `android-sdk` volume — exact commands in `docs/ANDROID.md`. Debug APKs are signed
  with the debug key and installable; release builds need the user's own keystore.

## In-app companion (Lina)
- `server/src/bot.ts` seeds a real `users` row (`username = 'lina'`, `is_bot = true`) so chat list, thread,
  unread badges and realtime all work unchanged. `is_bot` rows are hidden from discovery and admin lists.
- `GET /api/chat/bot` returns her intro + the user's conversation; `GET /api/chat/conversations` also
  ensures that conversation exists and seeds one welcome message per user.
- Replies come from local intent matching (`replyFor`) after a `chat:typing` event — no external AI call,
  so the assistant works with zero integration credits. Messages are inserted as Lina and pushed by websocket.

## Preview specifics
- `web/vite.config.ts` adds the sandbox host wildcard and the public preview host to `allowedHosts`
  only when `BASE44_PREVIEW_MODE === '1'`; `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` is passed through.
- Without an SMS/SMTP provider, OTP codes and password-reset tokens are echoed in the API response
  **only** when `BASE44_PREVIEW_MODE === '1'`, so signup can be completed in the sandbox.
- SMS delivery: `server/src/sms.ts` uses Twilio when `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` +
  (`TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`) are set, else the legacy
  `SMS_PROVIDER_URL`/`SMS_PROVIDER_KEY` webhook. With a provider configured, a rejected send returns
  `502 sms_failed` instead of silently echoing the code.
- Google sign-in: `/auth/providers` returns `googleClientId`, the client loads Google Identity Services
  on demand (`web/src/lib/google.ts`) and sends `{ idToken?, accessToken }`; `/auth/google` verifies it
  through `oauth2.googleapis.com/tokeninfo` and checks `aud === GOOGLE_CLIENT_ID`.
  Google blocks OAuth inside the Android WebView, so the native shell still needs a native Google plugin.
- Admin panel: `/admin`, username `admin`. The password starts as the `ADMIN_PASSWORD` secret; once it is
  changed from the panel's **Security** tab, the stored hash wins (`admin_users.password_source = 'custom'`)
  and a boot no longer overwrites it. Setting the secret again only affects a row still on `'secret'`.
