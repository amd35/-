-- Connect+ database schema (PostgreSQL)
-- All monetary / coin movements are integer coin amounts and are recorded in `transactions`.

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  phone text UNIQUE,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text,
  avatar_url text,
  bio text,
  gender text,
  country text,
  role text NOT NULL DEFAULT 'user',
  is_admin boolean NOT NULL DEFAULT false,
  is_banned boolean NOT NULL DEFAULT false,
  ban_reason text,
  phone_verified boolean NOT NULL DEFAULT false,
  email_verified boolean NOT NULL DEFAULT false,
  provider text NOT NULL DEFAULT 'password',
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_last_seen_idx ON users (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS users_display_name_idx ON users (lower(display_name));
-- Public profile age, shown on the discovery cards.
ALTER TABLE users ADD COLUMN IF NOT EXISTS age integer;
-- Automated companion account (Lina); hidden from discovery and admin user lists.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false;

-- Public profile data, exposed as a view over `users` so there is a single source of truth.
CREATE OR REPLACE VIEW profiles AS
  SELECT id AS user_id, username, display_name, avatar_url, bio, country, gender,
         last_seen_at, created_at
  FROM users;

CREATE TABLE IF NOT EXISTS wallets (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  earned integer NOT NULL DEFAULT 0,
  spent integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  ref_type text,
  ref_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_user_idx ON transactions (user_id, created_at DESC);
-- A financial effect can be applied at most once per (user, type, reference).
-- NULL references stay distinct, so free-form entries are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_unique_ref_idx
  ON transactions (user_id, type, ref_id);

CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON friendships (addressee_id, status);

CREATE TABLE IF NOT EXISTS follows (
  follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS follows_following_idx ON follows (following_id);

CREATE TABLE IF NOT EXISTS favorites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_id)
);

CREATE TABLE IF NOT EXISTS blocked_users (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS blocked_users_blocked_idx ON blocked_users (blocked_id);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'direct',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON conversation_members (user_id);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'text',
  attachment_url text,
  attachment_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('voice', 'video')),
  status text NOT NULL DEFAULT 'ringing',
  is_free boolean NOT NULL DEFAULT false,
  rate_per_minute integer NOT NULL DEFAULT 100,
  admin_percent integer NOT NULL DEFAULT 50,
  coins_charged integer NOT NULL DEFAULT 0,
  coins_refunded integer NOT NULL DEFAULT 0,
  duration_seconds integer NOT NULL DEFAULT 0,
  end_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS calls_caller_idx ON calls (caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_callee_idx ON calls (callee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_active_idx ON calls (status) WHERE status IN ('ringing', 'accepted');

CREATE TABLE IF NOT EXISTS call_participants (
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL,
  joined_at timestamptz,
  left_at timestamptz,
  PRIMARY KEY (call_id, user_id)
);

-- One row per reserved (pre-paid) minute of a paid call.
CREATE TABLE IF NOT EXISTS call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  minute_index integer NOT NULL,
  coins_reserved integer NOT NULL,
  coins_charged integer NOT NULL DEFAULT 0,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (call_id, minute_index)
);

CREATE TABLE IF NOT EXISTS daily_free_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  attempts_used integer NOT NULL DEFAULT 0,
  voice_used integer NOT NULL DEFAULT 0,
  video_used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, usage_date)
);

-- Guarantees one free attempt can never be consumed twice for the same call.
CREATE TABLE IF NOT EXISTS free_call_uses (
  call_id uuid PRIMARY KEY REFERENCES calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  coins integer NOT NULL,
  percent integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_id)
);

CREATE TABLE IF NOT EXISTS admin_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE UNIQUE,
  coins integer NOT NULL,
  percent integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recharge_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  coins integer NOT NULL,
  bonus_coins integer NOT NULL DEFAULT 0,
  price_iqd integer NOT NULL DEFAULT 0,
  price_usd_cents integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id uuid REFERENCES recharge_packages(id) ON DELETE SET NULL,
  coins integer NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'IQD',
  provider text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'pending',
  provider_ref text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS payment_orders_user_idx ON payment_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_orders_status_idx ON payment_orders (status, created_at DESC);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coins integer NOT NULL,
  amount_iqd integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS withdrawal_requests_status_idx ON withdrawal_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL DEFAULT 'Administrator',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);
-- 'secret' = hash comes from the ADMIN_PASSWORD secret on boot; 'custom' = changed in the panel.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS password_source text NOT NULL DEFAULT 'secret';

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'register',
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_codes_phone_idx ON otp_codes (phone, created_at DESC);

CREATE TABLE IF NOT EXISTS password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_attempts_identifier_idx ON auth_attempts (identifier, created_at DESC);

-- -------------------------------------------------------------- gift codes
-- Admin-issued redeem codes: the user enters the code and the coins land in the wallet.
CREATE TABLE IF NOT EXISTS gift_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  coins integer NOT NULL CHECK (coins > 0),
  max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count integer NOT NULL DEFAULT 0,
  note text,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gift_codes_created_idx ON gift_codes (created_at DESC);

CREATE TABLE IF NOT EXISTS gift_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_code_id uuid NOT NULL REFERENCES gift_codes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coins integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gift_code_id, user_id)
);

-- ------------------------------------------------------------ avatar frames
-- Store catalog. `kind = 'design'` renders one of the built-in animated SVG frames
-- (keyed by `design`); `kind = 'image'` renders an uploaded transparent PNG/WebP.
CREATE TABLE IF NOT EXISTS avatar_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  name_en text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'design' CHECK (kind IN ('design', 'image')),
  design text,
  image_url text,
  price integer NOT NULL DEFAULT 0 CHECK (price >= 0),
  rarity text NOT NULL DEFAULT 'common',
  duration_days integer NOT NULL DEFAULT 0 CHECK (duration_days >= 0),
  is_rare boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS avatar_frames_order_idx ON avatar_frames (sort_order, price);

-- One row per (user, frame): permanent when expires_at is NULL.
CREATE TABLE IF NOT EXISTS user_avatar_frames (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  frame_id uuid NOT NULL REFERENCES avatar_frames(id) ON DELETE CASCADE,
  expires_at timestamptz,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, frame_id)
);
CREATE INDEX IF NOT EXISTS user_avatar_frames_user_idx ON user_avatar_frames (user_id);

-- The frame the user currently wears. It is only rendered while the matching
-- user_avatar_frames row exists and has not expired.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_frame_id uuid REFERENCES avatar_frames(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_avatar_frame_idx ON users (avatar_frame_id);

INSERT INTO avatar_frames (slug, name, name_en, kind, design, price, rarity, duration_days, is_rare, sort_order)
SELECT * FROM (VALUES
  ('eagle-gold',     'أجنحة النسر الذهبية',   'Golden Eagle Wings',  'design', 'eagle-gold',     5000, 'legendary', 0,  true,  10),
  ('eagle-silver',   'أجنحة النسر الفضية',    'Silver Eagle Wings',  'design', 'eagle-silver',   3000, 'epic',      0,  true,  20),
  ('royal-crown',    'النسر الملكي مع التاج', 'Royal Eagle Crown',   'design', 'royal-crown',    8000, 'vip',       0,  true,  30),
  ('diamond-gold',   'ذهبي مرصع بالألماس',    'Diamond Gold',        'design', 'diamond-gold',   4000, 'legendary', 0,  true,  40),
  ('sports-car',     'سيارة رياضية فخمة',     'Luxury Sports Car',   'design', 'sports-car',     2500, 'rare',      30, true,  50),
  ('racing-led',     'سيارة سباق بأضواء LED', 'Racing LED',          'design', 'racing-led',     2000, 'rare',      30, true,  60),
  ('fire',           'إطار ناري متحرك',       'Animated Fire',       'design', 'fire',           1500, 'epic',      0,  false, 70),
  ('lightning',      'البرق الأزرق',          'Blue Lightning',      'design', 'lightning',      1200, 'rare',      0,  false, 80),
  ('royal-purple',   'ملكي باللون البنفسجي',  'Royal Purple',        'design', 'royal-purple',    900, 'rare',      0,  false, 90),
  ('emerald',        'الزمرد الملكي',         'Royal Emerald',       'design', 'emerald',        1000, 'rare',      0,  false, 100),
  ('aurora',         'الشفق القطبي',          'Aurora',              'design', 'aurora',          700, 'common',    0,  false, 110),
  ('galaxy',         'المجرة',                'Galaxy',              'design', 'galaxy',           0, 'common',    0,  false, 120),
  ('rainbow',        'قوس قزح',               'Rainbow',             'design', 'rainbow',          0, 'common',    0,  false, 130)
) AS seed(slug, name, name_en, kind, design, price, rarity, duration_days, is_rare, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM avatar_frames);

-- ------------------------------------------------------------------- gifts
-- Animated gift catalog. `design` renders one of the built-in animated scenes;
-- `video_url` (MP4/WebM uploaded from the admin panel) takes priority when set.
CREATE TABLE IF NOT EXISTS gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  name_en text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  design text,
  video_url text,
  cover_url text,
  price integer NOT NULL DEFAULT 0 CHECK (price >= 0),
  -- NULL = use the global `gift_recipient_percent` setting.
  recipient_percent integer CHECK (recipient_percent BETWEEN 0 AND 100),
  rarity text NOT NULL DEFAULT 'common',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gifts_order_idx ON gifts (sort_order, price);

-- One row per gift sent inside a private chat. `request_id` makes the client's
-- retried request idempotent: a second insert hits the unique index and the
-- original send (charge + earnings) is returned instead of charging twice.
CREATE TABLE IF NOT EXISTS gift_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  gift_id uuid NOT NULL REFERENCES gifts(id) ON DELETE RESTRICT,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  message_id uuid,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coins integer NOT NULL CHECK (coins >= 0),
  recipient_coins integer NOT NULL DEFAULT 0,
  admin_coins integer NOT NULL DEFAULT 0,
  recipient_percent integer NOT NULL DEFAULT 0,
  admin_percent integer NOT NULL DEFAULT 0,
  gift_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS gift_sends_sender_idx ON gift_sends (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_sends_recipient_idx ON gift_sends (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_sends_conversation_idx ON gift_sends (conversation_id, created_at DESC);

-- Gift messages reference the send so the thread can render the animation.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS gift_send_id uuid REFERENCES gift_sends(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS messages_gift_idx ON messages (gift_send_id) WHERE gift_send_id IS NOT NULL;

-- ---------------------------------------------------------- earnings wallet
-- Independent wallet for gift earnings. Coins here are profit, not spendable
-- balance: available can be withdrawn, pending is held by an open request.
CREATE TABLE IF NOT EXISTS profit_wallets (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_earned integer NOT NULL DEFAULT 0,
  available integer NOT NULL DEFAULT 0 CHECK (available >= 0),
  pending integer NOT NULL DEFAULT 0 CHECK (pending >= 0),
  withdrawn integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  ref_type text,
  ref_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profit_transactions_user_idx ON profit_transactions (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS profit_transactions_unique_ref_idx
  ON profit_transactions (user_id, type, ref_id);

-- Withdrawals can come from the spendable coin wallet ('coins') or from gift
-- earnings ('profit'). `amount` is the payout in the chosen currency.
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'coins';
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'IQD';
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'manual';
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS payout_details text NOT NULL DEFAULT '';
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS withdrawal_requests_user_idx ON withdrawal_requests (user_id, created_at DESC);

INSERT INTO gifts (slug, name, name_en, description, design, price, rarity, sort_order)
SELECT * FROM (VALUES
  ('sports-car',   'سيارة رياضية فخمة',  'Luxury Sports Car',  'سيارة خارقة تنطلق وسط أضواء النيون', 'sports-car',   5000,  'epic',      10),
  ('golden-car',   'سيارة ذهبية',        'Golden Supercar',    'سيارة من ذهب خالص تلمع تحت الأضواء',  'golden-car',   8000,  'legendary', 20),
  ('private-jet',  'طائرة خاصة',         'Private Jet',        'طائرة خاصة تحلق بين الغيوم',          'private-jet',  12000, 'legendary', 30),
  ('royal-yacht',  'يخت ملكي',           'Royal Yacht',        'يخت فاخر يبحر على أمواج ذهبية',       'royal-yacht',  15000, 'vip',       40),
  ('royal-crown',  'تاج ملكي',           'Royal Crown',        'تاج مرصع بالجواهر يتلألأ',            'royal-crown',  3000,  'epic',      50),
  ('roses',        'باقة ورود متحركة',   'Animated Roses',     'باقة ورود حمراء تتطاير بتلاتها',      'roses',        500,   'common',    60),
  ('golden-lion',  'أسد ذهبي',           'Golden Lion',        'أسد من ذهب بزئير يهز المكان',         'golden-lion',  6000,  'legendary', 70),
  ('golden-eagle', 'نسر بأجنحة ذهبية',   'Golden Eagle',       'نسر يحلق بأجنحة من ذهب',              'golden-eagle', 7000,  'legendary', 80),
  ('diamond',      'ألماس وماسات',       'Diamonds',           'ماسة دوارة تنشر ألوان الطيف',         'diamond',      2000,  'rare',      90),
  ('treasure',     'صندوق كنوز',         'Treasure Chest',     'صندوق كنز ينفتح على بريق الذهب',      'treasure',     4000,  'epic',      100),
  ('hearts',       'قلوب متحركة',        'Floating Hearts',    'موجة من القلوب المتطايرة',            'hearts',       300,   'common',    110),
  ('legend-dragon','التنين الأسطوري',     'Legendary Dragon',   'تنين أسطوري بلهب بنفسجي',             'legend-dragon',25000, 'vip',       120)
) AS seed(slug, name, name_en, description, design, price, rarity, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM gifts);

-- ---------------------------------------------------------------- settings
INSERT INTO app_settings (key, value) VALUES
  ('gifts_enabled', 'true'::jsonb),
  ('gift_recipient_percent', '60'::jsonb),
  ('gift_admin_percent', '40'::jsonb),
  ('coin_to_usd_rate', '0.001'::jsonb),
  ('voice_price', '100'::jsonb),
  ('video_price', '100'::jsonb),
  ('paid_calls_enabled', 'true'::jsonb),
  ('free_calls_enabled', 'true'::jsonb),
  ('free_calls_per_day', '5'::jsonb),
  ('free_calls_shared', 'true'::jsonb),
  ('free_calls_exempt_user_ids', '[]'::jsonb),
  ('admin_percent', '50'::jsonb),
  ('host_percent', '50'::jsonb),
  ('min_withdrawal_coins', '1000'::jsonb),
  ('coin_to_iqd_rate', '5'::jsonb),
  ('app_name', '"Connect+"'::jsonb),
  ('support_contact', '"support@connectplus.app"'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO recharge_packages (name, coins, bonus_coins, price_iqd, price_usd_cents, sort_order)
SELECT * FROM (VALUES
  ('Starter', 500, 0, 2500, 199, 1),
  ('Popular', 1200, 200, 5000, 399, 2),
  ('Pro', 2500, 500, 10000, 799, 3),
  ('Elite', 6000, 1500, 25000, 1999, 4)
) AS seed(name, coins, bonus_coins, price_iqd, price_usd_cents, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM recharge_packages);

-- ---------------------------------------------------------------- chat rooms
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  cover_url text,
  rules text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per microphone seat. `position` is the seat order the admin arranges;
-- `user_id` is the occupant, cleared automatically when that account is deleted.
CREATE TABLE IF NOT EXISTS room_mics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  position integer NOT NULL,
  label text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'speaker',
  is_locked boolean NOT NULL DEFAULT false,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS room_mics_position_uidx ON room_mics (room_id, position);
CREATE INDEX IF NOT EXISTS room_mics_user_idx ON room_mics (user_id);

-- Room chat: the message list inside a voice room. A row with `type = 'gift'`
-- points at the gift send so the client can replay the gift animation.
CREATE TABLE IF NOT EXISTS room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'text',
  gift_send_id uuid REFERENCES gift_sends(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_messages_room_idx ON room_messages (room_id, created_at DESC);

-- A starter room (with 8 seats) so the feature is usable right away. Seeded only
-- when no room exists yet, so a room the admin deletes never comes back.
WITH created AS (
  INSERT INTO rooms (name, description, rules, sort_order)
  SELECT 'الخدمة العملاء الرسمية', 'الغرفة الرسمية للخدمة العملاء — خذ مايك وتحدّث مع الفريق',
         'احترم الجميع ولا تخرج عن الآداب العامة', 10
  WHERE NOT EXISTS (SELECT 1 FROM rooms)
  RETURNING id
)
INSERT INTO room_mics (room_id, position, label, kind)
SELECT created.id, seat.position, seat.label, CASE WHEN seat.position = 1 THEN 'host' ELSE 'speaker' END
FROM created
CROSS JOIN (VALUES
  (1, 'المايك الرئيسي'), (2, 'مايك 2'), (3, 'مايك 3'), (4, 'مايك 4'),
  (5, 'مايك 5'), (6, 'مايك 6'), (7, 'مايك 7'), (8, 'مايك 8')
) AS seat(position, label);
