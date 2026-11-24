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

## Accounts
- Users have **no username**: each account is identified by a 6-digit numeric ID kept in
  `users.username`, handed out by the `user_code_seq` sequence (column default), and used to log in
  (`/auth/login` matches email, phone or that ID). The companion bot keeps the reserved ID `000001`.
- Admins can push that ID to a user as an in-app notification: `POST /api/admin/users/:id/send-id`.
- A room's public ID (`rooms.code`) is **the owner's account ID** — one number for the profile and the room.
  `schema.sql` re-syncs it at boot, and every username change (admin set-id, premium-ID purchase) updates the
  owner's rooms in the same transaction. `roomCode(uuid)` is only a fallback for ownerless admin rooms.

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

## Notifications (إشعارات يلا فون)
- Native Android uses `@capacitor/local-notifications` through `web/src/lib/appNotify.ts` (dynamic import, so the
  browser bundle stays clean). Three Android channels: `yalal_messages` (friend messages, neon pink),
  `yalal_system` (royal gold) and `yalal_reengage` (come-back reminder). Small icon
  `res/drawable/ic_stat_yalal.xml` (white heart), large icon `res/drawable/ic_notification_logo.png` (the app logo),
  title always the app name «يلا فون».
- Leaving the app schedules «أهلا صار هواي ماشايفينك تعال يا نغل» for +5 h (`COME_BACK_HOURS`) and returning
  cancels it (`native.ts` → `appStateChange`). Scheduled alarms survive the app being closed.
- `NotifyProvider` (`web/src/lib/notifyCenter.tsx`) converts realtime `message:new` (sender ≠ me) and
  `notification` events into the luxury in-app card (`components/LuxuryNotification.tsx` + `notifications.css`),
  and posts an OS notification instead when `document.hidden`. It skips messages for the conversation on screen.
  The server adds `senderName`/`senderAvatar` to `message:new` (chat route + Lina bot) so the card shows the sender.
- Settings → «إشعارات التطبيق» requests the OS permission, previews the card and reports blocked permission.
- Friend messages while the app is fully closed still need Firebase Cloud Messaging
  (`@capacitor/push-notifications` + `google-services.json`); Local Notifications only cover reminders and
  messages that reach the open WebSocket.

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
- Calls to Lina: `inviteCall` auto-accepts a call whose callee is `is_bot` (after 1.4 s), so billing, free
  attempts, ticks and history behave exactly like a real call. `POST /api/calls` returns `isBot`, and the client
  then skips WebRTC signaling: `web/src/components/BotCall.tsx` draws her portrait on a canvas captured as a
  MediaStream and speaks her lines with the device speech engine (shown as captions when no voice exists).

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

## In-app admin mode (وضع الأدمن)
- `users.is_admin = true` lets that app account call every `/api/admin/*` route with its **own user token**
  (`currentAdmin` accepts it and returns the general `admin_users` row, so audit columns that reference
  `admin_users(id)` stay valid). The admin panel row in Settings is rendered only for such accounts.
- Activation: `POST /api/auth/admin-mode { password }` checks the password against `admin_users.username = 'admin'`
  (bcrypt, throttled) and sets the flag; `DELETE /api/auth/admin-mode` turns it off. Nothing else sets the flag.
- In-app powers currently wired: admin tools sheet on another user's profile (ban/unban, coin adjust via
  `/admin/users/:id/...`), and deleting any chat message with `DELETE /api/chat/messages/:id`
  (sender or `users.is_admin`; pushes `message:deleted` to the other members).

## Lucky gifts (هدايا الحظ) and the repeat-send bar
- `lucky_gift_spins` is both the history and the idempotency ledger (`request_id` unique). Settings:
  `lucky_gift_enabled`, `lucky_gift_price` (default 1000), `lucky_gift_prizes` = `[{amount, weight}]`.
- `POST /api/rooms/:id/lucky-gifts` inserts the spin, charges `transactions.type = 'lucky_gift'`, draws a
  prize with `pickLuckyPrize` (`server/src/luckyGifts.ts`, crypto random, admin weights), credits
  `'lucky_gift_prize'` and broadcasts `room_lucky_gift`. Both ledger rows use the spin id, so a retried
  request can never charge or pay twice; an insufficient balance returns 402.
- Client: `LuckyGiftOverlay` (bubble → burst → prize, sounds in `lib/luckySound.ts`) is queued one at a
  time in `Room.tsx`; `GiftRepeatBar` is the 5-second «أرسل المزيد» bar that opens after a room gift and
  queues rapid taps so none are dropped.
- Admin: the «هدايا الحظ 🍀» tab edits the price/ladder (weights → % shown live) and lists spins via
  `GET /api/admin/lucky-gifts`.

## Gift bag (جنطة الهدايا) and gift bundles (باقات الهدايا)
- `gift_bag (user_id, gift_id, quantity)` is the user's owned-gift inventory. `gift_packages` /
  `gift_package_items` are admin-defined bundles sold for diamonds; `gift_package_purchases`
  (`request_id` unique) is both the history and the idempotency ledger.
- `POST /api/gifts/packages/:id/buy` charges the bundle price once (`transactions.type = 'gift_package'`)
  and adds every line to the bag in the same transaction. `GET /api/gifts` returns `bag` + `packages`
  alongside the catalog, so both gift sheets render the bag without extra calls.
- Sending an owned gift passes `fromBag: true` to `POST /api/gifts/send` or `POST /api/rooms/:id/gifts`:
  `takeFromBag()` decrements the row atomically and the sender is **not** charged (the bundle already
  paid), while the recipient/host earnings split still runs as for a paid gift.
- Admin: `/admin/gift-packages` CRUD plus `/admin/gift-packages/:id/grant` and `/admin/gifts/:id/grant`
  drop bundles/gifts straight into a user's bag (`source = 'admin_grant'`, no charge).
- Three starter bundles are seeded only when `gift_packages` is empty.
- Client: `web/src/components/GiftBag.tsx` (`GiftBagGrid`, `GiftPackagesGrid`) is shared by `GiftShop`
  (chat: الهدايا / الباقات / الجنطة) and `RoomGiftSheet` (الهدايا / الجنطة / هدايا الحظ).

## Country-flag gifts (أعلام الدول)
- `ensureFlagGifts()` (`server/src/flagGifts.ts`, called at boot) seeds one gift row per country from
  `server/src/flagCountries.ts` — generated from `web/src/lib/countries.ts`, so add a country there and
  regenerate the list. Slug `flag-<iso>`, `design = 'flag:<iso>'`, price 1000 diamonds,
  `ON CONFLICT (slug) DO NOTHING` (admin edits survive a boot).
- The default-cover `UPDATE` in `schema.sql` skips `design LIKE 'flag:%'`, so a flag keeps a NULL cover and
  the client draws its scene instead of the shared artwork.
- Client: `web/src/components/FlagGift.tsx` renders the flag from `flag-icons` (self-hosted SVGs, imported
  CSS) as a waving cloth in a gold frame with a liquid SVG ripple and two water sheens; `GiftCatalog.tsx`
  holds the «الهدايا» / «أعلام الدول» sections plus country search, shared by `GiftShop` and `RoomGiftSheet`.

## Room levels (مستوى الغرفة)
- `rooms.level_xp` is the only stored value; the level (1..100) is a pure function of it
  (`server/src/roomLevels.ts`), so it can always be recomputed and never drifts.
- XP comes only from real, server-observed activity inside the room: an accepted chat message
  (`ROOM_CHAT_XP = 2`, capped at `ROOM_CHAT_DAILY_CAP = 200` messages per user/room/Baghdad day)
  and each full minute a *connected* user sits on a mic (`ROOM_MIC_MINUTE_XP = 3`, capped at 240
  minutes per seat session). `room_xp_events` has a unique `(room_id, kind, ref_id)` index, so a
  retried request or replayed tick counts once; the client can never claim points.
- `startRoomLevelLoop()` ticks `creditMicMinutes()` every 60 s; `room_mics.xp_minutes` records how
  far the current session is paid and a trigger resets it whenever the seat changes hands.
- Curve: `xpForRoomLevel(L) = 100*(L-1) + 10*(L-1)^2` (level 10 ≈ 1.7k XP, level 50 ≈ 29k, level 100 ≈ 108k).
- Seats follow the level: 5 from level 1, 10 from level 10, 15 from level 50 (`micSlotsForLevel`).
  `syncRoomMics()` adds seats on a level-up (never kicks anyone) and `syncAllRoomMics()` trims empty
  seats above the allowance at boot; admin-created rooms start at 5 too.
- The client shows the level, progress bar and seat count in the room header and an `LV` pill on the
  room list; a level-up broadcasts `room`, so every open stage re-renders with its new seats.

## Official recharge agents (وكلاء الشحن)
- `agents` is the single source of truth for an agency: `status` (`active` | `suspended` | `revoked`),
  commission rate, and the coins/gold stock. The admin panel (`/admin` → إدارة الوكلاء) is the only writer;
  agents have no admin token, so `/api/admin/agents/*` is unreachable for them by design.
- The agent panel (`/agent`) is a UI convenience: every endpoint behind it calls `requireAgent()` and re-checks
  the agency status on the server, so a revoked agency loses the panel and the badge immediately
  (`/auth/me` → `agent: null`, public profile → `isAgent: false`).
- Money invariants: the client never sends a price. `agent_packages` defines `amount` units for `cost_coins`;
  the server prices any quantity as `ceil(cost * qty / amount)`. A recharge locks the `agents` row, refuses a
  negative balance, writes `agent_recharges` (unique `(agent_id, idempotency_key)`, plus a 5 s double-tap window
  for direct recharges), then moves the user's coins through the normal wallet ledger
  (`transactions.type = 'agent_recharge'`, unique per recharge id) or adds `wallets.gold` for gold.
- Commission = `floor(cost * commission_percent / 100)`, kept in `agents.total_commission`; payouts add to
  `paid_commission`, so the due amount is always `total - paid`. Every movement (credit, debit, recharge,
  commission, payout) writes an append-only `agent_ledger` row (unique per `kind` + `ref_id`).
- Customer requests (`agent_requests`) are priced server-side at creation; completing one runs the same
  recharge path with `idempotency_key = request:<id>`, so a double accept can never pay twice.
- Gold is a second currency in `wallets.gold` (agent stock lives in `agents.gold_balance`); it is not spendable
  in the app yet, it is only credited by agents and shown in the wallet.

## YALLA PHONE AI SECURITY (`server/src/security/`)
- `moderateTextForUser()` gates private/room chat, profile name & bio, room names and voice transcripts;
  `moderateMediaForUser()` / `moderateAttachmentForUser()` gate every upload, avatar change and chat attachment.
  Bot, support and admin accounts are skipped.
- Rules live in `security/lexicon.ts` (normalized Arabic/Iraqi/English terms; normalization collapses diacritics,
  tatweel, letter variants, spacing and leet digits). Admins extend them from «الحماية الذكية AI» →
  `security_settings` (30 s cache), so rules change without an app update.
- Every decision writes `security_violations` + `security_restrictions` (capabilities: chat, mic, avatar, media,
  gifts, calls, account) and a `security_warning` notification. Strikes live in `users.security_strikes` and decay
  after 30 clean days.
- Enforcement is server-side only: `requireAuth()` makes a banned/suspended account read-only (only
  `POST /api/security/appeals` passes) and `assertCapability()` blocks a single capability. Never trust the client.
- Ladder: warn → 30 min capability → 1 h → 24 h → 7 d → 30 d → permanent. Serious categories (threat, fraud,
  phishing, impersonation, sexual, child_safety) start at 24 h; child safety / critical = immediate permanent ban
  with evidence kept in `security_violations.evidence`.
- Appeals (`POST /api/security/appeals`) are auto-accepted when the classification confidence is below
  `appeal_auto_accept_confidence`; otherwise the admin resolves them in the AI security tab.
- Media: SHA-256 blocklist (`security_media_hashes`) + filename hints always run. Real pixel analysis requires
  `OPENAI_API_KEY` / `MODERATION_API_KEY` (OpenAI `omni-moderation-latest`); without it the API reports
  `provider: 'local'` instead of pretending it analysed the image.
- Voice: the room client (opt-in button, Web Speech API) posts short transcripts to
  `POST /api/security/voice-transcript`; a confirmed violation force-mutes the mic server-side. Android WebView
  has no Web Speech API — any STT bridge can call the same endpoint.
