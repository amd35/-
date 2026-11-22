# API reference — Connect+

Base URL in the sandbox: `http://localhost:8000/api` (or same-origin `/api` through the web app).
All authenticated routes take `Authorization: Bearer <jwt>`.

Responses are JSON. Errors use `{ "error": "message", "code": "machine_code", "details": {...} }`
with a matching HTTP status (`400/401/402/403/404/409/429/500`).

## Auth

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | `{ email?, phone?, phoneToken?, password, username?, displayName, avatarUrl? }` | Phone signup requires a `phoneToken` from OTP verification |
| POST | `/auth/login` | `{ identifier, password }` | `identifier` = email, phone or username |
| POST | `/auth/otp/request` | `{ phone }` | Returns `{ sent, expiresInSeconds, delivery, devCode? }` (`devCode` only in preview mode without an SMS gateway) |
| POST | `/auth/otp/verify` | `{ phone, code }` | Returns `{ verified, phone, phoneToken }` (15 min) |
| POST | `/auth/google` | `{ idToken }` | Requires `GOOGLE_CLIENT_ID`; verifies the Google ID token |
| POST | `/auth/forgot-password` | `{ email }` | Returns `{ sent, devToken? }` |
| POST | `/auth/reset-password` | `{ token, password }` | |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` | Auth |
| GET | `/auth/me` | — | Auth → `{ user, wallet, freeCalls, unreadNotifications, friendRequests, unreadMessages, config }` |
| PATCH | `/auth/me` | `{ displayName?, username?, bio?, avatarUrl?, gender?, country? }` | Auth |
| DELETE | `/auth/me` | `{ password }` | Auth, deletes the account and cascades data |

## Users & social graph

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/users?q=&filter=all\|online\|favorites\|friends` | Feed with `isFavorite/isFriend/isFollowing/isBlocked/online` |
| GET | `/users/suggestions` | Up to 8 non-friends |
| GET | `/users/:id` | `{ user, counts, earnings, isSelf }` |
| POST | `/users/:id/follow` · `/favorite` · `/friend` · `/block` | All toggle; `/friend` returns `{ status }` |
| POST | `/users/:id/report` | `{ reason, details? }` |
| GET | `/users/friends/requests` | Incoming pending requests |
| POST | `/users/friends/:id/accept` | Accept a request |
| GET | `/users/me/free-calls` · `/users/me/blocked` | |

## Calls

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/calls` | `{ calleeId, kind: "voice"\|"video" }` → `{ callId, ratePerMinute, freeAvailable }`. No charge at this step |
| POST | `/calls/:id/accept` | Callee only. Consumes a free attempt **or** reserves one minute (100 coins) |
| POST | `/calls/:id/reject` | No attempt consumed, no charge |
| POST | `/calls/:id/cancel` | Caller cancels while ringing |
| POST | `/calls/:id/end` | Settles: pro-rata charge, refund of the unused reservation, earnings split |
| GET | `/calls/history?filter=all\|voice\|video\|missed` | `direction`, `missed`, `durationSeconds`, `coinsCharged`, `isFree` |
| GET | `/calls/active` | Current ringing/accepted call |
| GET | `/calls/free-state` | `{ enabled, perDay, used, remaining, nextResetAt, usageDate, shared }` |

**Billing rules enforced server-side**

1. A free attempt is consumed only on accept, never on invite/reject/miss/expire.
2. Paid calls reserve one minute at accept and one more at every 60-second boundary.
3. If the next minute cannot be reserved, the call ends automatically (`end_reason=insufficient_balance`).
4. Settlement charges `ceil(seconds × rate / 60)` (capped by the reservation) and refunds the rest.
5. The receiver is never charged; they receive `floor(charged × host_percent / 100)`.
6. Every movement is a ledger row in `transactions`, unique per reference (no double charge).

## Realtime (WebSocket)

Connect: `wss://<host>/ws?token=<jwt>`.

Server → client: `ready`, `presence`, `call:incoming`, `call:created`, `call:accepted`, `call:tick`,
`call:ended`, `webrtc:signal`, `message:new`, `message:read`, `chat:typing`, `notification`,
`wallet:update`, `free:update`, `error`.

Client → server: `call:invite`, `call:accept`, `call:reject`, `call:cancel`, `call:end`,
`webrtc:signal` (`{ callId, payload: { type: "offer"|"answer"|"candidate", sdp?, candidate? } }`),
`chat:typing`, `ping`.

## Chat

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/chat/conversations` | With peer, last message and unread count |
| POST | `/chat/conversations` | `{ userId }` → `{ conversationId }` (reuses an existing direct chat) |
| GET | `/chat/conversations/:id/messages?before=&limit=` | |
| POST | `/chat/conversations/:id/messages` | `{ body, type: "text"\|"image"\|"file", attachmentUrl?, attachmentName? }` |
| POST | `/chat/conversations/:id/read` | Marks the other side's messages read |
| DELETE | `/chat/conversations/:id` | Deletes the conversation (members only) |

## Wallet, recharge, withdrawals

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/wallet` | `{ wallet, transactions, earnings, withdrawals, minWithdrawalCoins, coinToIqdRate }` |
| GET | `/wallet/packages` | Active packages + available payment methods |
| POST | `/wallet/orders` | `{ packageId, currency: "IQD"\|"USD", provider }` → pending order |
| POST | `/wallet/orders/:id/mark-paid` | User reports payment; **does not** credit coins |
| GET | `/wallet/orders` | My orders |
| POST | `/wallet/withdrawals` | `{ coins }` — holds the coins immediately |
| GET | `/wallet/earnings` | Earnings log |
| POST | `/payments/webhook` | Provider callback. Header `x-signature` = HMAC-SHA256 of the raw JSON body with `PAYMENT_WEBHOOK_SECRET` |

## Uploads

`POST /api/uploads` — multipart field `file` (max 8 MB; images/pdf/doc/audio).
Returns `{ url, name, size, mime }`. Files are served from `/uploads/...`
(stored publicly — anyone with the link can open them).

## Admin (`/api/admin`)

`POST /admin/login { username, password }` → `{ token, admin }`. Every other admin route needs that token.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/overview` | Today's calls/coins/profit, users, 7-day series, current settings |
| GET | `/admin/users?q=&status=all\|active\|banned` | Search accounts |
| POST | `/admin/users/:id/ban` · `/unban` | Ban ends any active call |
| POST | `/admin/users/:id/coins` | `{ amount, note }` — signed ledger adjustment |
| GET | `/admin/calls?kind=&status=` | Call log |
| GET/PUT | `/admin/settings` | Prices, free attempts, split, withdrawal limits |
| GET/POST/PUT/DELETE | `/admin/packages` | Recharge packages |
| GET | `/admin/orders?status=` | Payment orders |
| POST | `/admin/orders/:id/confirm` · `/reject` | Confirm credits coins exactly once |
| GET | `/admin/earnings` | Admin profit, entries, top hosts |
| GET | `/admin/withdrawals` · POST `/:id/approve` · `/:id/reject` | Reject refunds the coins |
| GET | `/admin/reports` · POST `/:id/resolve` | Abuse reports |
| GET | `/admin/free-calls` | Free-attempt settings, usage and totals |
| GET | `/admin/financial?period=day\|month` | Daily (30) / monthly (12) financial report |
| POST | `/admin/notifications/broadcast` | `{ title, body }` to all active accounts |

## Database tables

`users`, `profiles` (view), `wallets`, `transactions`, `friendships`, `follows`, `favorites`,
`blocked_users`, `conversations`, `conversation_members`, `messages`, `calls`, `call_participants`,
`call_sessions`, `daily_free_calls`, `free_call_uses`, `earnings`, `admin_earnings`,
`recharge_packages`, `payment_orders`, `withdrawal_requests`, `notifications`, `reports`,
`admin_users`, `app_settings`, `otp_codes`, `password_resets`, `auth_attempts`.
