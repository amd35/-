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

-- Accounts are identified by a random numeric ID of 6 to 8 digits (kept in
-- `username`); users no longer choose a username. Each signup gets an unused code.
CREATE OR REPLACE FUNCTION generate_user_code() RETURNS text AS $$
DECLARE
  len integer := 6 + floor(random() * 3)::integer;
  code text;
BEGIN
  LOOP
    code := floor(random() * 9 * power(10, len - 1) + power(10, len - 1))::bigint::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE username = code);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE users ALTER COLUMN username SET DEFAULT generate_user_code();
UPDATE users SET username = generate_user_code()
WHERE is_bot = false AND username !~ '^[0-9]{6,8}$';
DROP SEQUENCE IF EXISTS user_code_seq;

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
  -- 0 = anyone can buy/equip; 1..5 = an active VIP of at least that tier is required.
  min_vip integer NOT NULL DEFAULT 0 CHECK (min_vip BETWEEN 0 AND 5),
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

-- ------------------------------------------------- store sections / cosmetics
-- The store catalog is shared: `category` says where an item is worn.
--   frame    → animated avatar frame (users.avatar_frame_id)
--   id       → badge around the numeric account ID
--   namecard → card behind the display name
--   bubble   → chat message bubble style
--   entry    → animation shown when entering a voice room
ALTER TABLE avatar_frames ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'frame';
CREATE INDEX IF NOT EXISTS avatar_frames_category_idx ON avatar_frames (category, sort_order);
ALTER TABLE avatar_frames ADD COLUMN IF NOT EXISTS min_vip integer NOT NULL DEFAULT 0;

-- The item a user wears in each non-frame category (ownership stays in user_avatar_frames).
CREATE TABLE IF NOT EXISTS user_cosmetics (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL,
  item_id uuid NOT NULL REFERENCES avatar_frames(id) ON DELETE CASCADE,
  equipped_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);

INSERT INTO avatar_frames (slug, name, name_en, kind, design, price, rarity, duration_days, is_rare, sort_order, category)
SELECT * FROM (VALUES
  ('id-neon',        'معرّف نيون وردي',        'Neon Pink ID',        'design', 'neon',   800,  'epic',      0, false, 10, 'id'),
  ('id-gold',        'معرّف ذهبي',             'Golden ID',           'design', 'gold',   1200, 'legendary', 0, true,  20, 'id'),
  ('id-blue',        'معرّف أزرق متوهج',       'Glowing Blue ID',     'design', 'blue',   500,  'rare',      0, false, 30, 'id'),
  ('id-fire',        'معرّف ناري',             'Fiery ID',            'design', 'fire',   1500, 'legendary', 0, true,  40, 'id'),
  ('id-diamond',     'معرّف ألماسي',           'Diamond ID',          'design', 'diamond',2000, 'vip',       0, true,  50, 'id'),
  ('card-glass',     'بطاقة اسم شفافة',        'Transparent Name Card','design','glass',  600,  'rare',      0, false, 10, 'namecard'),
  ('card-neon',      'بطاقة نيون',             'Neon Name Card',      'design', 'neon',   900,  'epic',      0, false, 20, 'namecard'),
  ('card-gold',      'بطاقة ذهبية',            'Golden Name Card',    'design', 'gold',   1400, 'legendary', 0, true,  30, 'namecard'),
  ('card-holo',      'بطاقة هولوغرافية',       'Holographic Card',    'design', 'holo',   1800, 'vip',       0, true,  40, 'namecard'),
  ('bubble-glass',   'فقاعة زجاجية',           'Glass Bubble',        'design', 'glass',  500,  'common',    0, false, 10, 'bubble'),
  ('bubble-neon',    'فقاعة نيون',             'Neon Bubble',         'design', 'neon',   700,  'rare',      0, false, 20, 'bubble'),
  ('bubble-gradient','فقاعة متدرجة',           'Gradient Bubble',     'design', 'gradient',900, 'epic',      0, false, 30, 'bubble'),
  ('bubble-fire',    'فقاعة نارية',            'Fiery Bubble',        'design', 'fire',   1500, 'legendary', 0, true,  40, 'bubble'),
  ('entry-rose',     'ورود متساقطة',           'Falling Roses',       'design', 'rose',   600,  'common',    0, false, 10, 'entry'),
  ('entry-lightning','برق الدخول',             'Entry Lightning',     'design', 'lightning',800,'rare',      0, false, 20, 'entry'),
  ('entry-fireworks','ألعاب نارية',            'Fireworks Entry',     'design', 'fireworks',1000,'epic',     0, false, 30, 'entry'),
  ('entry-crown',    'تاج ملكي',               'Royal Crown Entry',   'design', 'crown',  2000, 'legendary', 0, true,  40, 'entry')
) AS seed(slug, name, name_en, kind, design, price, rarity, duration_days, is_rare, sort_order, category)
ON CONFLICT (slug) DO NOTHING;

-- Premium designs added with the 3D cosmetic collection.
INSERT INTO avatar_frames (slug, name, name_en, kind, design, price, rarity, duration_days, is_rare, sort_order, category)
SELECT * FROM (VALUES
  ('bubble-glass-gold',    'فقاعة زجاجية ذهبية',   'Golden Glass Bubble',  'design', 'glass-gold',  900,  'rare',      0, false, 50, 'bubble'),
  ('bubble-glass-silver',  'فقاعة زجاجية فضية',    'Silver Glass Bubble',  'design', 'glass-silver',800,  'rare',      0, false, 60, 'bubble'),
  ('bubble-royal',         'فقاعة ملكية بنفسجية',  'Royal Purple Bubble',  'design', 'royal',       1200, 'epic',      0, false, 70, 'bubble'),
  ('bubble-eagle',         'فقاعة أجنحة النسر',    'Eagle Wing Bubble',    'design', 'eagle',       2600, 'legendary', 0, true,  80, 'bubble'),
  ('bubble-hearts',        'فقاعة القلوب الوردية', 'Pink Hearts Bubble',   'design', 'hearts',      1000, 'epic',      0, false, 90, 'bubble'),
  ('bubble-stars',         'فقاعة النجوم',         'Star Bubble',          'design', 'stars',       1100, 'epic',      0, false, 100, 'bubble'),
  ('bubble-ice',           'فقاعة ثلجية',          'Ice Bubble',           'design', 'ice',         900,  'rare',      0, false, 110, 'bubble'),
  ('bubble-crimson',       'فقاعة ياقوتية حمراء',  'Crimson Bubble',       'design', 'crimson',     950,  'rare',      0, false, 120, 'bubble'),
  ('bubble-black-gold',    'فقاعة سوداء بإضاءة ذهبية','Black Gold Bubble', 'design', 'black-gold',  2200, 'vip',       0, true,  130, 'bubble'),
  ('card-eagle-gold',      'بطاقة أجنحة النسر الذهبية','Golden Eagle Card','design', 'eagle-gold',  3000, 'legendary', 0, true,  50, 'namecard'),
  ('card-crown',           'بطاقة التاج والألماس', 'Crown Diamond Card',   'design', 'crown',       4000, 'vip',       0, true,  60, 'namecard'),
  ('card-fire',            'بطاقة نارية متحركة',   'Animated Fire Card',   'design', 'fire',        2200, 'legendary', 0, true,  70, 'namecard'),
  ('card-ice',             'بطاقة ثلجية زرقاء',    'Ice Blue Card',        'design', 'ice',         1800, 'epic',      0, false, 80, 'namecard'),
  ('card-purple',          'بطاقة بنفسجية',        'Purple Card',          'design', 'purple',      1400, 'epic',      0, false, 90, 'namecard'),
  ('card-pink',            'بطاقة وردية',          'Pink Card',            'design', 'pink',        1400, 'epic',      0, false, 100, 'namecard'),
  ('card-black-gold',      'بطاقة سوداء فاخرة',    'Black Gold Card',      'design', 'black-gold',  2600, 'vip',       0, true,  110, 'namecard'),
  ('id-crown',             'معرّف التاج الملكي',    'Royal Crown ID',       'design', 'crown',       2500, 'vip',       0, true,  60, 'id'),
  ('id-eagle',             'معرّف أجنحة النسر',    'Eagle Wing ID',        'design', 'eagle',       2800, 'legendary', 0, true,  70, 'id'),
  ('id-glass',             'معرّف زجاجي شفاف',     'Glass ID',             'design', 'glass',       900,  'rare',      0, false, 80, 'id'),
  ('id-flame',             'معرّف اللهب والبرق',   'Flame Lightning ID',   'design', 'flame',       1800, 'epic',      0, false, 90, 'id'),
  ('id-silver',            'معرّف فضي',            'Silver ID',            'design', 'silver',      1400, 'epic',      0, false, 100, 'id'),
  ('id-royal',             'معرّف بنفسجي ملكي',    'Royal Purple ID',      'design', 'royal',       2200, 'legendary', 0, true,  110, 'id')
) AS seed(slug, name, name_en, kind, design, price, rarity, duration_days, is_rare, sort_order, category)
ON CONFLICT (slug) DO NOTHING;

-- Legendary eagle-wing VIP frames. `design` keys map to the animated vector artwork in
-- web/src/components/VipEagleFrame.tsx; `min_vip` is the VIP tier needed to buy/equip.
INSERT INTO avatar_frames (slug, name, name_en, kind, design, price, rarity, duration_days, is_rare, sort_order, category, min_vip)
SELECT * FROM (VALUES
  ('vip-eagle-royal',    'النسر الملكي الذهبي',    'Royal Gold Eagle',    'design', 'vip-eagle-royal',    12000, 'vip', 0, true, 1, 'frame', 1),
  ('vip-eagle-sapphire', 'النسر الأزرق الملكي',   'Sapphire Eagle',      'design', 'vip-eagle-sapphire', 18000, 'vip', 0, true, 2, 'frame', 2),
  ('vip-eagle-emerald',  'النسر الزمردي',         'Emerald Eagle',       'design', 'vip-eagle-emerald',  22000, 'vip', 0, true, 3, 'frame', 2),
  ('vip-eagle-amethyst', 'النسر البنفسجي الملكي', 'Amethyst Eagle',      'design', 'vip-eagle-amethyst', 26000, 'vip', 0, true, 4, 'frame', 3),
  ('vip-eagle-inferno',  'النسر الناري',          'Inferno Eagle',       'design', 'vip-eagle-inferno',  30000, 'vip', 0, true, 5, 'frame', 3),
  ('vip-eagle-frost',    'النسر الجليدي',         'Frost Eagle',         'design', 'vip-eagle-frost',    36000, 'vip', 0, true, 6, 'frame', 4),
  ('vip-eagle-obsidian', 'النسر الأسود الذهبي',   'Obsidian Gold Eagle', 'design', 'vip-eagle-obsidian', 42000, 'vip', 0, true, 7, 'frame', 4),
  ('vip-eagle-diamond',  'النسر الألماسي',        'Diamond Eagle',       'design', 'vip-eagle-diamond',  60000, 'vip', 0, true, 8, 'frame', 5)
) AS seed(slug, name, name_en, kind, design, price, rarity, duration_days, is_rare, sort_order, category, min_vip)
ON CONFLICT (slug) DO NOTHING;

-- ------------------------------------------------------- premium account IDs
-- Special numeric account IDs sold in the store. Buying one moves its code into
-- `users.username` (still unique across users) and marks the row sold.
CREATE TABLE IF NOT EXISTS premium_ids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  price integer NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_sold boolean NOT NULL DEFAULT false,
  sold_to uuid REFERENCES users(id) ON DELETE SET NULL,
  sold_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS premium_ids_available_idx ON premium_ids (is_sold, price);

INSERT INTO premium_ids (code, price)
SELECT * FROM (VALUES
  ('111111', 5000),
  ('222222', 5000),
  ('555555', 6000),
  ('777777', 8000),
  ('999999', 8000),
  ('123456', 3000)
) AS seed(code, price)
ON CONFLICT (code) DO NOTHING;

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
-- How many copies of the same gift one send contains (1 by default).
ALTER TABLE gift_sends ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS gift_sends_sender_idx ON gift_sends (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_sends_recipient_idx ON gift_sends (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gift_sends_conversation_idx ON gift_sends (conversation_id, created_at DESC);

-- Gift messages reference the send so the thread can render the animation.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS gift_send_id uuid REFERENCES gift_sends(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS messages_gift_idx ON messages (gift_send_id) WHERE gift_send_id IS NOT NULL;

-- ----------------------------------------------------------------- gift bag
-- «جنطة الهدايا»: gifts the user already owns. A gift package recharge (or an
-- admin grant) adds rows here; sending one from the bag consumes a copy instead
-- of charging diamonds again.
CREATE TABLE IF NOT EXISTS gift_bag (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gift_id uuid NOT NULL REFERENCES gifts(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, gift_id)
);

-- Admin-defined bundles sold for diamonds in the gift shop. Buying one drops its
-- contents into the buyer's bag, so the gifts can be sent later for free.
CREATE TABLE IF NOT EXISTS gift_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_en text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  cover_url text,
  price integer NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gift_packages_order_idx ON gift_packages (sort_order, price);

CREATE TABLE IF NOT EXISTS gift_package_items (
  package_id uuid NOT NULL REFERENCES gift_packages(id) ON DELETE CASCADE,
  gift_id uuid NOT NULL REFERENCES gifts(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  PRIMARY KEY (package_id, gift_id)
);

-- One row per package recharge (or admin grant). `request_id` makes a retried
-- purchase idempotent, so a double tap can never charge twice.
CREATE TABLE IF NOT EXISTS gift_package_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES gift_packages(id) ON DELETE RESTRICT,
  coins integer NOT NULL DEFAULT 0,
  gift_count integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'purchase',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gift_package_purchases_user_idx
  ON gift_package_purchases (user_id, created_at DESC);

-- Starter bundles, only when the admin has not created any package yet.
INSERT INTO gift_packages (name, name_en, description, price, sort_order)
SELECT * FROM (VALUES
  ('باقة الحب',      'Love Bundle',   'بوسة حب ×5 ووردة حمراء ×3 تدخل جنطتك فوراً', 3000,  10),
  ('باقة الفخامة',   'Luxury Bundle', 'سيارة ذهبية ×1 وماسة ×2 في جنطة هداياك',     15000, 20),
  ('باقة النجوم',    'Stars Bundle',  'تنين الأسطورة ×1 وتاج ملكي ×1 لجنطتك',        9000, 30)
) AS seed(name, name_en, description, price, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM gift_packages);

INSERT INTO gift_package_items (package_id, gift_id, quantity)
SELECT p.id, g.id, seed.quantity
FROM (VALUES
  ('باقة الحب', 'kiss-love', 5),
  ('باقة الحب', 'roses', 3),
  ('باقة الفخامة', 'golden-car', 1),
  ('باقة الفخامة', 'diamond', 2),
  ('باقة النجوم', 'legend-dragon', 1),
  ('باقة النجوم', 'royal-crown', 1)
) AS seed(package_name, gift_slug, quantity)
JOIN gift_packages p ON p.name = seed.package_name
JOIN gifts g ON g.slug = seed.gift_slug
WHERE NOT EXISTS (SELECT 1 FROM gift_package_items)
ON CONFLICT DO NOTHING;

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

-- Default cover artwork for every gift (admins can replace it per gift from the panel).
-- Country-flag gifts (`design = 'flag:*'`) keep a NULL cover so the client draws
-- their animated flag scene instead of this artwork.
UPDATE gifts SET cover_url = 'https://media.base44.com/images/public/6addb0a6b0689d303ed3a495/0f0338134_file_000000007c54821081a33f6e0657af7c.png'
WHERE cover_url IS NULL AND (design IS NULL OR design NOT LIKE 'flag:%');

-- Romantic photo gifts: real artwork bundled in web/public/gifts (`design = 'photo'`
-- makes the sent animation show the photo itself instead of a built-in scene).
INSERT INTO gifts (slug, name, name_en, description, design, cover_url, price, rarity, sort_order)
SELECT * FROM (VALUES
  ('kiss-heart-balloon', 'بوسة وبالون قلب',    'Kiss with a Heart Balloon', 'بوسة رومانسية مع بالون قلب أحمر',  'photo', '/gifts/kiss-1.jpg',   800, 'rare',  200),
  ('kiss-on-lips',       'بوسة على الشفايف',   'Kiss on the Lips',          'بوسة رومانسية على الشفايف',        'photo', '/gifts/kiss-2.jpg',  1200, 'epic',  210),
  ('kiss-monochrome',    'بوسة أبيض وأسود',    'Black & White Kiss',        'لحظة بوسة بلمسة أبيض وأسود',       'photo', '/gifts/kiss-3.jpg',  1000, 'rare',  220),
  ('kiss-closeup',       'بوسة قريبة',         'Close-up Kiss',             'لقطة قريبة لبوسة حب',              'photo', '/gifts/kiss-4.jpg',  1500, 'epic',  230),
  ('kiss-leather',       'بوسة بالجاكيت الأسود','Leather Jacket Kiss',       'بوسة بالهواء الطلق',               'photo', '/gifts/kiss-5.jpg',  1200, 'rare',  240),
  ('kiss-cozy',          'بوسة بالبيت',        'Cozy Kiss',                 'بوسة رومانسية جوّا البيت',          'photo', '/gifts/kiss-6.jpg',   900, 'common',250),
  ('kiss-embrace',       'عناق وبوسة',         'Embrace & Kiss',            'عناق دافي مع بوسة',                'photo', '/gifts/kiss-7.jpg',  1300, 'rare',  260),
  ('kiss-forest',        'بوسة بالغابة',       'Forest Kiss',               'بوسة بين أشجار الغابة',            'photo', '/gifts/kiss-8.jpg',  1100, 'rare',  270),
  ('kiss-love',          'بوسة حب',            'Love Kiss',                 'بوسة حب صادقة',                    'photo', '/gifts/kiss-9.jpg',  1000, 'rare',  280),
  ('kiss-sunset',        'بوسة عند الغروب',    'Sunset Kiss',               'بوسة ذهبية وقت الغروب',            'photo', '/gifts/kiss-10.jpg', 2000, 'epic',  290)
) AS seed(slug, name, name_en, description, design, cover_url, price, rarity, sort_order)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------- settings
INSERT INTO app_settings (key, value) VALUES
  ('gifts_enabled', 'true'::jsonb),
  ('gift_recipient_percent', '60'::jsonb),
  ('gift_admin_percent', '40'::jsonb),
  ('gift_announcements_enabled', 'true'::jsonb),
  ('gift_announcement_duration', '5'::jsonb),
  ('gift_announcement_effects', 'true'::jsonb),
  ('gift_announcement_color', '"#ff2d2d"'::jsonb),
  ('gift_announcement_glow', '"#ffd45e"'::jsonb),
  ('gift_announcement_scope', '"all"'::jsonb),
  ('gift_announcement_gift_ids', '[]'::jsonb),
  ('gift_announcement_rarity_effects', '{"common":"light","rare":"medium","epic":"strong","legendary":"strong","vip":"strong"}'::jsonb),
  ('profile_show_balances', 'true'::jsonb),
  ('level_up_effects', 'true'::jsonb),
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
  ('app_name', '"يلا فون"'::jsonb),
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
-- Room owner, animated stage design and shared music track.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id) ON DELETE SET NULL;
-- Who created the room through the app (one user-created room per account).
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS background text NOT NULL DEFAULT 'fire';
-- Mic seat design chosen from the admin panel (transparent variants + accent color).
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS mic_style text NOT NULL DEFAULT 'glass';
ALTER TABLE rooms ALTER COLUMN mic_style SET DEFAULT 'glass';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS mic_color text NOT NULL DEFAULT '#ff3b0f';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS music_url text;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'العراق';
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'العربية';
-- The room's public ID is its owner's account ID (one number for both).
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS code text;
-- The room's own profile picture (the round photo in the stage header); the
-- cover behind the stage stays a separate image.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS avatar_url text;
UPDATE rooms r SET code = u.username FROM users u WHERE u.id = r.owner_id AND (r.code IS NULL OR r.code = '');

-- Delegated room staff: 'admin' runs the room, 'supervisor' moderates mics and chat.
CREATE TABLE IF NOT EXISTS room_roles (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'supervisor')),
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
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
ALTER TABLE room_mics ADD COLUMN IF NOT EXISTS muted boolean NOT NULL DEFAULT false;
-- Minutes of room XP already paid for the current occupancy of this seat.
ALTER TABLE room_mics ADD COLUMN IF NOT EXISTS xp_minutes integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS room_mics_position_uidx ON room_mics (room_id, position);
CREATE INDEX IF NOT EXISTS room_mics_user_idx ON room_mics (user_id);

-- A seat changing hands starts a fresh XP session for the new occupant.
CREATE OR REPLACE FUNCTION room_mics_reset_xp_minutes() RETURNS trigger AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    NEW.xp_minutes := 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS room_mics_xp_reset ON room_mics;
CREATE TRIGGER room_mics_xp_reset
BEFORE UPDATE ON room_mics
FOR EACH ROW EXECUTE FUNCTION room_mics_reset_xp_minutes();

-- Room level (1..100) is a pure function of this XP: only real activity inside
-- the room earns it (an accepted chat message, or a full minute on a mic while
-- connected). The level decides how many mic seats the room has.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS level_xp integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS room_xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('chat', 'mic_minute')),
  -- Chat: the message id. Mic minute: "<mic id>:<session epoch>:<minute>".
  ref_id text NOT NULL,
  xp integer NOT NULL CHECK (xp >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, kind, ref_id)
);
CREATE INDEX IF NOT EXISTS room_xp_events_room_idx ON room_xp_events (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS room_xp_events_chat_idx ON room_xp_events (room_id, kind, user_id, created_at DESC);

-- Room chat: the message list inside a voice room. A row with `type = 'gift'`
-- points at the gift send so the client can replay the gift animation.
CREATE TABLE IF NOT EXISTS room_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'text',
  gift_send_id uuid REFERENCES gift_sends(id) ON DELETE SET NULL,
  -- Administrative announcement: only an official admin position can post one.
  is_announcement boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE room_messages ADD COLUMN IF NOT EXISTS is_announcement boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS room_messages_room_idx ON room_messages (room_id, created_at DESC);

-- ============================================================================
-- Room cup & gold profit sharing
-- ----------------------------------------------------------------------------
-- Every gift sent inside a room writes one ledger row: the gold the sender spent
-- and how it splits between the room owner and the general administration.
-- `gift_send_id` is unique, so a retried send can never split (or pay) twice.
-- A reversed (refunded/cancelled) row stays for auditing but is excluded from
-- the owner payout and from the competition ranking.
ALTER TABLE gift_sends ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES rooms(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS gift_sends_room_idx ON gift_sends (room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS room_cup_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_send_id uuid NOT NULL UNIQUE REFERENCES gift_sends(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coins integer NOT NULL CHECK (coins >= 0),
  owner_coins integer NOT NULL DEFAULT 0 CHECK (owner_coins >= 0),
  admin_coins integer NOT NULL DEFAULT 0 CHECK (admin_coins >= 0),
  owner_percent integer NOT NULL DEFAULT 50,
  admin_percent integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'settled' CHECK (status IN ('settled', 'reversed')),
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (owner_coins + admin_coins = coins)
);
CREATE INDEX IF NOT EXISTS room_cup_ledger_room_idx ON room_cup_ledger (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS room_cup_ledger_owner_idx ON room_cup_ledger (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS room_cup_ledger_sender_idx ON room_cup_ledger (sender_id, created_at DESC);

-- One competition per room at a time; the partial unique index is what enforces it.
CREATE TABLE IF NOT EXISTS room_cup_competitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS room_cup_competitions_open_uidx
  ON room_cup_competitions (room_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS room_cup_competitions_due_idx ON room_cup_competitions (status, ends_at);

CREATE TABLE IF NOT EXISTS room_cup_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES room_cup_competitions(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank BETWEEN 1 AND 3),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coins bigint NOT NULL DEFAULT 0,
  prize integer NOT NULL DEFAULT 0 CHECK (prize >= 0),
  awarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, rank),
  UNIQUE (competition_id, user_id)
);
CREATE INDEX IF NOT EXISTS room_cup_winners_room_idx ON room_cup_winners (room_id, created_at DESC);

-- Defaults for the cup settings; an existing value is never overwritten.
INSERT INTO app_settings (key, value) VALUES
  ('cup_enabled', 'true'::jsonb),
  ('cup_owner_percent', '50'::jsonb),
  ('cup_period', '"weekly"'::jsonb),
  ('cup_prize_1', '5000'::jsonb),
  ('cup_prize_2', '2000'::jsonb),
  ('cup_prize_3', '1000'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- A starter room (with 15 seats: 3 rows of 5) so the feature is usable right
-- away. Seeded only when no room exists yet, so a room the admin deletes never
-- comes back.
WITH created AS (
  INSERT INTO rooms (name, description, rules, sort_order)
  SELECT 'الخدمة العملاء الرسمية', 'الغرفة الرسمية للخدمة العملاء — خذ مايك وتحدّث مع الفريق',
         'احترم الجميع ولا تخرج عن الآداب العامة', 10
  WHERE NOT EXISTS (SELECT 1 FROM rooms)
  RETURNING id
)
INSERT INTO room_mics (room_id, position, label, kind)
SELECT created.id, seat.position, labels.label, CASE WHEN seat.position = 1 THEN 'host' ELSE 'speaker' END
FROM created
CROSS JOIN generate_series(1, 15) AS seat(position)
CROSS JOIN LATERAL (
  SELECT CASE WHEN seat.position = 1 THEN 'المايك الرئيسي' ELSE 'مايك ' || seat.position END AS label
) AS labels;

-- The starter room is a 15-seat stage; top it up once if an older checkout left
-- it with fewer seats (rooms the admin deliberately trimmed are left alone).
WITH starter AS (
  SELECT id FROM rooms WHERE name = 'الخدمة العملاء الرسمية' ORDER BY created_at ASC LIMIT 1
), missing AS (
  SELECT starter.id AS room_id, seat.position
  FROM starter
  CROSS JOIN generate_series(1, 15) AS seat(position)
  WHERE NOT EXISTS (
    SELECT 1 FROM room_mics m WHERE m.room_id = starter.id AND m.position = seat.position
  )
  AND (SELECT count(*) FROM room_mics m WHERE m.room_id = starter.id) < 15
)
INSERT INTO room_mics (room_id, position, label, kind)
SELECT room_id, position, 'مايك ' || position, 'speaker' FROM missing;

-- ============================================================================
-- Official ranks & daily boxes
-- ----------------------------------------------------------------------------
-- A rank is granted by the administration only. A user wears one active rank
-- at a time (senior-management positions included); `user_ranks` keeps the full
-- history, so a revoked or expired rank is never lost. Every daily box claim is
-- keyed by the Baghdad calendar date, so a retried request or a device in
-- another timezone can never pay twice.
CREATE TABLE IF NOT EXISTS ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL DEFAULT '',
  -- 'rank' = one of the five official ranks; 'position' = a senior-management job.
  kind text NOT NULL DEFAULT 'rank',
  tier integer NOT NULL DEFAULT 1,
  -- Authority level: a manager can never grant a rank at or above their own power.
  power integer NOT NULL DEFAULT 10,
  description text NOT NULL DEFAULT '',
  daily_coins integer NOT NULL DEFAULT 0 CHECK (daily_coins >= 0),
  commission_percent integer NOT NULL DEFAULT 0 CHECK (commission_percent BETWEEN 0 AND 100),
  color text NOT NULL DEFAULT '#ffc107',
  badge_image_url text,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_days integer NOT NULL DEFAULT 0 CHECK (duration_days >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank_key text NOT NULL REFERENCES ranks(key) ON DELETE CASCADE,
  granted_by_admin uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  granted_by_user uuid REFERENCES users(id) ON DELETE SET NULL,
  note text,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  revoked_at timestamptz
);
-- One active rank per user; expired rows are deactivated before the next grant.
CREATE UNIQUE INDEX IF NOT EXISTS user_ranks_active_uidx ON user_ranks (user_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS user_ranks_rank_idx ON user_ranks (rank_key, is_active);

CREATE TABLE IF NOT EXISTS rank_boxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rank_key text NOT NULL REFERENCES ranks(key) ON DELETE CASCADE,
  name text NOT NULL,
  coins integer NOT NULL DEFAULT 0 CHECK (coins >= 0),
  -- [{ "type": "coins", "amount": 5000 }, { "type": "cosmetic", "itemId": "<uuid>" }]
  extras jsonb NOT NULL DEFAULT '[]'::jsonb,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rank_boxes_rank_uidx ON rank_boxes (rank_key);

CREATE TABLE IF NOT EXISTS rank_box_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  box_id uuid REFERENCES rank_boxes(id) ON DELETE SET NULL,
  rank_key text NOT NULL,
  claim_date date NOT NULL,
  coins integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- One box per user per Baghdad day, enforced by the database itself.
CREATE UNIQUE INDEX IF NOT EXISTS rank_box_claims_day_uidx ON rank_box_claims (user_id, claim_date);
CREATE INDEX IF NOT EXISTS rank_box_claims_rank_idx ON rank_box_claims (rank_key, claim_date DESC);

CREATE TABLE IF NOT EXISTS rank_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_kind text NOT NULL DEFAULT 'admin',
  actor_id uuid,
  actor_name text NOT NULL DEFAULT '',
  action text NOT NULL,
  target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  rank_key text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rank_audit_created_idx ON rank_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS rank_audit_user_idx ON rank_audit (target_user_id, created_at DESC);

-- The official catalog: five ranks plus the five senior-management positions.
-- ON CONFLICT DO NOTHING keeps every edit the administration makes in the panel.
INSERT INTO ranks (key, name_ar, name_en, kind, tier, power, description, daily_coins, commission_percent, color, permissions, sort_order)
SELECT * FROM (VALUES
  ('new_user', 'المستخدم الجديد', 'New User', 'rank', 1, 10,
   'صلاحيات المستخدم الأساسية فقط', 50000, 0, '#ffc107', '[]'::jsonb, 10),
  ('support', 'خدمة العملاء الرسمية', 'Official Customer Service', 'rank', 2, 20,
   'استقبال طلبات المستخدمين ومتابعة الشكاوى والاستفسارات', 100000, 0, '#3b82f6',
   '["support_tickets","view_users"]'::jsonb, 20),
  ('rooms_manager', 'إدارة غرف الأنشطة', 'Activity Rooms Management', 'rank', 3, 30,
   'إدارة غرف المسابقات والفعاليات وتنظيم الجوائز', 150000, 0, '#a855f7',
   '["manage_rooms","manage_events"]'::jsonb, 30),
  ('recharge_agent', 'وكيل الشحن الرسمي', 'Official Recharge Agent', 'rank', 4, 40,
   'لوحة الوكيل وطلبات الشحن والأرباح والعمولات', 200000, 5, '#22c55e',
   '["agent_panel","view_recharge_orders"]'::jsonb, 40),
  ('senior_admin', 'الإدارة العليا', 'Senior Management', 'rank', 5, 50,
   'الرتبة الخامسة — مناصب إدارية مستقلة', 0, 0, '#ef4444', '[]'::jsonb, 50),
  ('room_supervisor', 'مشرف غرف', 'Room Supervisor', 'position', 5, 55,
   'إدارة الغرف والمستخدمين', 250000, 0, '#a855f7',
   '["manage_rooms","support_tickets","view_users"]'::jsonb, 60),
  ('general_supervisor', 'مشرف عام', 'General Supervisor', 'position', 5, 65,
   'الإشراف العام والمتابعة', 300000, 0, '#22c55e',
   '["manage_rooms","support_tickets","view_users","view_recharge_orders"]'::jsonb, 70),
  ('general_manager', 'مدير عام', 'General Manager', 'position', 5, 75,
   'إدارة شاملة للتطبيق', 400000, 0, '#ef4444',
   '["manage_rooms","manage_events","support_tickets","view_users","view_recharge_orders","manage_boxes"]'::jsonb, 80),
  ('super_admin', 'سوبر أدمن', 'Super Admin', 'position', 5, 100,
   'صلاحيات كاملة على النظام', 500000, 0, '#3b82f6', '["*"]'::jsonb, 90),
  ('official_admin', 'إداري رسمي', 'Official Admin', 'position', 5, 85,
   'إدارة النظام والمحتوى والرتب', 350000, 0, '#f4b942',
   '["manage_ranks","manage_boxes","manage_users","manage_rooms","manage_events","support_tickets","view_users","view_recharge_orders"]'::jsonb, 100)
) AS seed(key, name_ar, name_en, kind, tier, power, description, daily_coins, commission_percent, color, permissions, sort_order)
ON CONFLICT (key) DO NOTHING;

-- One daily box per rank, starting with the official daily reward.
INSERT INTO rank_boxes (rank_key, name, coins)
SELECT r.key, 'بوكس ' || r.name_ar, r.daily_coins
FROM ranks r
ON CONFLICT (rank_key) DO NOTHING;

-- ============================================================================
-- Levels (XP) & VIP — two independent systems
-- ----------------------------------------------------------------------------
-- LEVEL is driven by XP only. XP is written by `xp_events`, whose unique
-- (user, kind, ref) index makes every real operation count exactly once: a
-- replayed webhook, a retried gift request or the same chat message can never
-- award twice. VIP is a paid/granted subscription kept in `user_vips` and has
-- no effect on XP or on the level. Both are fully configurable from the admin
-- panel.
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp bigint NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS level integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS levels (
  level integer PRIMARY KEY CHECK (level BETWEEN 1 AND 100),
  name_ar text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT '',
  -- Total XP needed to reach this level (level 1 = 0).
  xp_required bigint NOT NULL DEFAULT 0 CHECK (xp_required >= 0),
  reward_coins integer NOT NULL DEFAULT 0 CHECK (reward_coins >= 0),
  badge_color text NOT NULL DEFAULT '#ffd75e',
  badge_image_url text,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO levels (level, name_ar, name_en, xp_required, reward_coins)
SELECT n,
       'المستوى ' || n,
       'Level ' || n,
       COALESCE((SELECT SUM(100 + (k - 2) * 40) FROM generate_series(2, n) AS k), 0),
       CASE WHEN n % 10 = 0 THEN 5000 WHEN n % 5 = 0 THEN 1500 ELSE 0 END
FROM generate_series(1, 100) AS n
ON CONFLICT (level) DO NOTHING;

-- Every level ships its own royal badge artwork (web/public/levels, served by the web
-- app and by the API at the same path for the Android shell). Admins can override any.
UPDATE levels
   SET badge_image_url = '/levels/level-' || level || '.png'
 WHERE badge_image_url IS NULL OR badge_image_url = '';

CREATE TABLE IF NOT EXISTS xp_settings (
  key text PRIMARY KEY,
  value integer NOT NULL DEFAULT 0 CHECK (value >= 0),
  description text NOT NULL DEFAULT ''
);

INSERT INTO xp_settings (key, value, description)
SELECT * FROM (VALUES
  ('daily_activity', 50, 'XP يمنح مرة واحدة في اليوم عند أول نشاط'),
  ('recharge_per_100', 20, 'XP لكل 100 كونز يتم شحنها بعد تأكيد الدفع'),
  ('gift_per_100', 25, 'XP لكل 100 كونز من قيمة الهدية المرسلة'),
  ('chat_message', 2, 'XP لكل رسالة دردشة محفوظة على الخادم'),
  ('chat_daily_cap', 100, 'أقصى XP يومي من رسائل الدردشة'),
  ('achievement', 100, 'XP افتراضي للإنجاز أو المهمة المحققة')
) AS seed(key, value, description)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref_id text NOT NULL,
  xp integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- One award per real operation. This is the anti-double-count guard.
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_unique_idx ON xp_events (user_id, kind, ref_id);
CREATE INDEX IF NOT EXISTS xp_events_user_idx ON xp_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS level_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level integer NOT NULL,
  xp bigint NOT NULL,
  reward_coins integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'xp',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS level_history_user_idx ON level_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS level_history_created_idx ON level_history (created_at DESC);

-- Admin-granted level. While `level_granted` is set the account keeps that level
-- even if XP awards arrive; `users.level` is always the effective level every
-- screen reads. Revoking clears both and recomputes the level from XP.
ALTER TABLE users ADD COLUMN IF NOT EXISTS level_granted integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS level_before_grant integer;

-- Every grant / revoke, with the admin who did it, the before/after levels and
-- the optional reason. This is the admin-side audit trail.
CREATE TABLE IF NOT EXISTS level_grant_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  admin_name text NOT NULL DEFAULT '',
  action text NOT NULL CHECK (action IN ('grant', 'revoke')),
  previous_level integer NOT NULL,
  new_level integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS level_grant_log_created_idx ON level_grant_log (created_at DESC);
CREATE INDEX IF NOT EXISTS level_grant_log_user_idx ON level_grant_log (user_id, created_at DESC);

-- Server-side permission for changing user levels. The general admin keeps it;
-- any other admin account only gets it when the general admin enables it.
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS can_manage_levels boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS vip_tiers (
  tier integer PRIMARY KEY CHECK (tier BETWEEN 1 AND 5),
  name_ar text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT '',
  price_coins integer NOT NULL DEFAULT 0 CHECK (price_coins >= 0),
  duration_days integer NOT NULL DEFAULT 30 CHECK (duration_days > 0),
  color text NOT NULL DEFAULT '#ffd75e',
  badge_image_url text,
  frame_image_url text,
  bubble_image_url text,
  title_ar text NOT NULL DEFAULT '',
  title_en text NOT NULL DEFAULT '',
  perks jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO vip_tiers (tier, name_ar, name_en, price_coins, duration_days, color, title_ar, title_en, perks, sort_order)
SELECT * FROM (VALUES
  (1, 'VIP 1', 'VIP 1', 50000, 30, '#22c55e', 'النخبة', 'Elite',
   '["شارة VIP بجانب الاسم","إطار صورة ذهبي","لقب ملكي"]'::jsonb, 10),
  (2, 'VIP 2', 'VIP 2', 150000, 30, '#38bdf8', 'النبيل', 'Noble',
   '["شارة VIP مميزة","إطار متحرك","دخولية خاصة"]'::jsonb, 20),
  (3, 'VIP 3', 'VIP 3', 400000, 30, '#ffd75e', 'الفارس الذهبي', 'Golden Knight',
   '["تأثيرات دخول الغرف","هدايا مميزة","مظهر فاخر"]'::jsonb, 30),
  (4, 'VIP 4', 'VIP 4', 900000, 30, '#a855f7', 'الأمير', 'Prince',
   '["دخوليات ملكية","إطارات فاخرة","امتيازات إضافية"]'::jsonb, 40),
  (5, 'VIP 5', 'VIP 5', 2000000, 30, '#ef4444', 'الملك', 'King',
   '["تاج ملكي","مؤثرات أسطورية","مميزات حصرية كاملة"]'::jsonb, 50)
) AS seed(tier, name_ar, name_en, price_coins, duration_days, color, title_ar, title_en, perks, sort_order)
ON CONFLICT (tier) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_vips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier integer NOT NULL REFERENCES vip_tiers(tier) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'purchase',
  granted_by_admin uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- One active VIP at a time per user.
CREATE UNIQUE INDEX IF NOT EXISTS user_vips_active_uidx ON user_vips (user_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS vip_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier integer NOT NULL,
  action text NOT NULL,
  actor_kind text NOT NULL DEFAULT 'system',
  actor_id uuid,
  actor_name text NOT NULL DEFAULT '',
  coins integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vip_history_user_idx ON vip_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vip_history_created_idx ON vip_history (created_at DESC);

-- ============================================================================
-- Royal administration identity (YALLA PHONE)
-- ----------------------------------------------------------------------------
-- A set of admin-only designs (frame / name card / chat bubble / room entry)
-- that ordinary users can never buy. Each item belongs to one official admin
-- position; `admin_looks` is the design the General Admin chose for that
-- position, and it is applied to every active holder of it. `admin_look_grants`
-- lets the General Admin hand a specific design to a specific user (and take it
-- back) without changing the position defaults.
ALTER TABLE avatar_frames ADD COLUMN IF NOT EXISTS admin_only boolean NOT NULL DEFAULT false;
ALTER TABLE avatar_frames ADD COLUMN IF NOT EXISTS admin_rank text;
CREATE INDEX IF NOT EXISTS avatar_frames_admin_idx ON avatar_frames (admin_only, category, admin_rank);

-- The five royal positions that own the identity.
INSERT INTO ranks (key, name_ar, name_en, kind, tier, power, description, daily_coins, commission_percent, color, permissions, sort_order)
VALUES
  ('admin_manager',    'المدير',        'Manager',                  'position', 5, 95,  'إدارة شاملة تحت قيادة الادمن العام', 450000, 0, '#ef4444', '["manage_users","manage_rooms","manage_events","manage_ranks","manage_boxes","support_tickets","view_users"]'::jsonb, 120),
  ('admin_deputy',     'نائب المدير',   'Deputy Manager',           'position', 5, 90,  'نائب المدير — متابعة الإدارة اليومية', 400000, 0, '#f97316', '["manage_users","manage_rooms","support_tickets","view_users","view_recharge_orders"]'::jsonb, 130),
  ('admin_supervisor', 'المشرف',        'Supervisor',               'position', 5, 85,  'الإشراف على الغرف والمستخدمين', 350000, 0, '#f59e0b', '["manage_rooms","support_tickets","view_users"]'::jsonb, 140),
  ('admin_official',   'الإدارة الرسمية','Official Administration', 'position', 5, 80,  'فريق الإدارة الرسمي — تمثيل التطبيق', 300000, 0, '#b45309', '["support_tickets","view_users"]'::jsonb, 150)
ON CONFLICT (key) DO NOTHING;

INSERT INTO rank_boxes (rank_key, name, coins)
SELECT r.key, 'بوكس ' || r.name_ar, 0
FROM ranks r
WHERE r.key IN ('admin_manager','admin_deputy','admin_supervisor','admin_official')
ON CONFLICT (rank_key) DO NOTHING;

-- The royal catalog. Vector designs: transparent centre, no image download.
INSERT INTO avatar_frames (slug, name, name_en, kind, design, price, rarity, duration_days, is_rare, sort_order, category, admin_only, admin_rank)
SELECT * FROM (VALUES
  ('admin-frame-royal',      'إطار الادمن العام الملكي', 'General Admin Royal Frame', 'design', 'admin-royal',      0, 'vip', 0, true, 900, 'frame',    true, 'super_admin'),
  ('admin-frame-manager',    'إطار المدير الملكي',      'Manager Royal Frame',       'design', 'admin-manager',    0, 'vip', 0, true, 901, 'frame',    true, 'admin_manager'),
  ('admin-frame-deputy',     'إطار نائب المدير',        'Deputy Royal Frame',        'design', 'admin-deputy',     0, 'vip', 0, true, 902, 'frame',    true, 'admin_deputy'),
  ('admin-frame-supervisor', 'إطار المشرف',             'Supervisor Royal Frame',    'design', 'admin-supervisor', 0, 'vip', 0, true, 903, 'frame',    true, 'admin_supervisor'),
  ('admin-frame-official',   'إطار الإدارة الرسمية',    'Official Royal Frame',      'design', 'admin-official',   0, 'vip', 0, true, 904, 'frame',    true, 'admin_official'),
  ('admin-card-royal',       'بطاقة الادمن العام',      'General Admin Name Card',   'design', 'admin-royal',      0, 'vip', 0, true, 910, 'namecard', true, 'super_admin'),
  ('admin-card-manager',     'بطاقة المدير',            'Manager Name Card',         'design', 'admin-manager',    0, 'vip', 0, true, 911, 'namecard', true, 'admin_manager'),
  ('admin-card-deputy',      'بطاقة نائب المدير',       'Deputy Name Card',          'design', 'admin-deputy',     0, 'vip', 0, true, 912, 'namecard', true, 'admin_deputy'),
  ('admin-card-supervisor',  'بطاقة المشرف',            'Supervisor Name Card',      'design', 'admin-supervisor', 0, 'vip', 0, true, 913, 'namecard', true, 'admin_supervisor'),
  ('admin-card-official',    'بطاقة الإدارة الرسمية',   'Official Name Card',        'design', 'admin-official',   0, 'vip', 0, true, 914, 'namecard', true, 'admin_official'),
  ('admin-bubble-royal',     'فقاعة الادمن العام',      'General Admin Bubble',      'design', 'admin-royal',      0, 'vip', 0, true, 920, 'bubble',   true, NULL),
  ('admin-bubble-announce',  'فقاعة الإعلانات الإدارية','Admin Announcement Bubble', 'design', 'admin-announce',   0, 'vip', 0, true, 921, 'bubble',   true, NULL),
  ('admin-entry-eagle',      'دخولية النسر الناري',     'Fiery Eagle Entry',         'design', 'admin-eagle',      0, 'vip', 0, true, 930, 'entry',    true, NULL),
  ('admin-entry-crown',      'دخولية التاج الملكي',     'Royal Crown Entry',         'design', 'admin-crown',      0, 'vip', 0, true, 931, 'entry',    true, NULL),
  ('admin-entry-wings',      'دخولية الأجنحة الذهبية',  'Golden Wings Entry',        'design', 'admin-wings',      0, 'vip', 0, true, 932, 'entry',    true, NULL)
) AS seed(slug, name, name_en, kind, design, price, rarity, duration_days, is_rare, sort_order, category, admin_only, admin_rank)
ON CONFLICT (slug) DO NOTHING;

-- Rows seeded before the top rank was renamed: move them to super_admin.
UPDATE avatar_frames SET admin_rank = 'super_admin'
WHERE admin_rank = 'admin_general' AND slug IN ('admin-frame-royal','admin-card-royal');

-- The look each royal position wears by default (editable in «مظهر الإدارة»).
CREATE TABLE IF NOT EXISTS admin_looks (
  rank_key text PRIMARY KEY REFERENCES ranks(key) ON DELETE CASCADE,
  frame_id uuid REFERENCES avatar_frames(id) ON DELETE SET NULL,
  namecard_id uuid REFERENCES avatar_frames(id) ON DELETE SET NULL,
  bubble_id uuid REFERENCES avatar_frames(id) ON DELETE SET NULL,
  entry_id uuid REFERENCES avatar_frames(id) ON DELETE SET NULL,
  effects_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_look_grants (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES avatar_frames(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

-- The existing top rank (super_admin) *is* the General Admin of this identity.
UPDATE ranks SET name_ar = 'الادمن العام', name_en = 'General Admin', color = '#e11d48'
WHERE key = 'super_admin' AND name_ar = 'سوبر أدمن';

-- Fold a previously seeded parallel general row into the top rank, if any.
INSERT INTO admin_looks (rank_key, frame_id, namecard_id, bubble_id, entry_id, effects_enabled)
SELECT 'super_admin', frame_id, namecard_id, bubble_id, entry_id, effects_enabled
FROM admin_looks WHERE rank_key = 'admin_general'
ON CONFLICT (rank_key) DO NOTHING;
DELETE FROM admin_looks WHERE rank_key = 'admin_general';
DELETE FROM rank_boxes WHERE rank_key = 'admin_general';
DELETE FROM ranks WHERE key = 'admin_general'
  AND NOT EXISTS (SELECT 1 FROM user_ranks WHERE rank_key = 'admin_general');

INSERT INTO admin_looks (rank_key, frame_id, namecard_id, bubble_id, entry_id, effects_enabled)
SELECT p.rank_key,
  (SELECT id FROM avatar_frames WHERE slug = 'admin-frame-' || p.suffix),
  (SELECT id FROM avatar_frames WHERE slug = 'admin-card-' || p.suffix),
  (SELECT id FROM avatar_frames WHERE slug = 'admin-bubble-royal'),
  (SELECT id FROM avatar_frames WHERE slug = 'admin-entry-eagle'),
  true
FROM (VALUES
  ('super_admin', 'royal'),
  ('admin_manager', 'manager'),
  ('admin_deputy', 'deputy'),
  ('admin_supervisor', 'supervisor'),
  ('admin_official', 'official')
) AS p(rank_key, suffix)
ON CONFLICT (rank_key) DO NOTHING;

-- ------------------------------------------------------- coin column widths
-- Coin amounts outgrew 32-bit integers (an admin can grant billions of coins), so
-- every wallet, ledger and payout column holds 64-bit values. These ALTERs are
-- idempotent and keep the existing CHECK constraints.
ALTER TABLE wallets ALTER COLUMN balance TYPE bigint;
ALTER TABLE wallets ALTER COLUMN reserved TYPE bigint;
ALTER TABLE wallets ALTER COLUMN earned TYPE bigint;
ALTER TABLE wallets ALTER COLUMN spent TYPE bigint;
ALTER TABLE transactions ALTER COLUMN amount TYPE bigint;
ALTER TABLE transactions ALTER COLUMN balance_after TYPE bigint;
ALTER TABLE calls ALTER COLUMN coins_charged TYPE bigint;
ALTER TABLE calls ALTER COLUMN coins_refunded TYPE bigint;
ALTER TABLE call_sessions ALTER COLUMN coins_reserved TYPE bigint;
ALTER TABLE call_sessions ALTER COLUMN coins_charged TYPE bigint;
ALTER TABLE earnings ALTER COLUMN coins TYPE bigint;
ALTER TABLE admin_earnings ALTER COLUMN coins TYPE bigint;
ALTER TABLE gift_sends ALTER COLUMN coins TYPE bigint;
ALTER TABLE gift_sends ALTER COLUMN recipient_coins TYPE bigint;
ALTER TABLE gift_sends ALTER COLUMN admin_coins TYPE bigint;
ALTER TABLE gift_codes ALTER COLUMN coins TYPE bigint;
ALTER TABLE gift_code_redemptions ALTER COLUMN coins TYPE bigint;
ALTER TABLE profit_wallets ALTER COLUMN total_earned TYPE bigint;
ALTER TABLE profit_wallets ALTER COLUMN available TYPE bigint;
ALTER TABLE profit_wallets ALTER COLUMN pending TYPE bigint;
ALTER TABLE profit_wallets ALTER COLUMN withdrawn TYPE bigint;
ALTER TABLE profit_transactions ALTER COLUMN amount TYPE bigint;
ALTER TABLE profit_transactions ALTER COLUMN balance_after TYPE bigint;
ALTER TABLE room_cup_ledger ALTER COLUMN coins TYPE bigint;
ALTER TABLE room_cup_ledger ALTER COLUMN owner_coins TYPE bigint;
ALTER TABLE room_cup_ledger ALTER COLUMN admin_coins TYPE bigint;
ALTER TABLE room_cup_winners ALTER COLUMN prize TYPE bigint;
ALTER TABLE withdrawal_requests ALTER COLUMN coins TYPE bigint;
ALTER TABLE withdrawal_requests ALTER COLUMN amount_iqd TYPE bigint;
ALTER TABLE payment_orders ALTER COLUMN coins TYPE bigint;
ALTER TABLE payment_orders ALTER COLUMN amount TYPE bigint;
ALTER TABLE recharge_packages ALTER COLUMN coins TYPE bigint;
ALTER TABLE recharge_packages ALTER COLUMN bonus_coins TYPE bigint;
ALTER TABLE gifts ALTER COLUMN price TYPE bigint;

-- ---------------------------------------------------- room gift frames
-- A frame catalog gifted inside voice rooms, completely separate from the gift
-- store: the administration uploads a transparent PNG, sets a name and a price,
-- and members send it to a person on a mic for coins.
CREATE TABLE IF NOT EXISTS room_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_en text NOT NULL DEFAULT '',
  image_url text NOT NULL,
  price integer NOT NULL DEFAULT 99 CHECK (price >= 0),
  -- The reveal length belongs to the server; the client never receives a timer.
  duration_seconds integer NOT NULL DEFAULT 60 CHECK (duration_seconds > 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_frames_order_idx ON room_frames (sort_order, created_at);

-- One row per sent frame. `starts_at`/`expires_at` are written by the server, so
-- the remaining time survives a rejoin and can never be changed by the client.
CREATE TABLE IF NOT EXISTS room_frame_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  frame_id uuid NOT NULL REFERENCES room_frames(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price integer NOT NULL CHECK (price >= 0),
  duration_seconds integer NOT NULL DEFAULT 60,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_frame_sends_live_idx
  ON room_frame_sends (room_id, recipient_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS room_frame_sends_log_idx ON room_frame_sends (created_at DESC);

-- App backgrounds managed from the admin panel. One published row per slot is
-- live; every other row stays as history so a previous background can be restored.
CREATE TABLE IF NOT EXISTS app_backgrounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot text NOT NULL,
  title text NOT NULL DEFAULT '',
  image_url text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  -- Set the first time a row is published; saved-only drafts never fall back in.
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_backgrounds ADD COLUMN IF NOT EXISTS published_at timestamptz;
CREATE INDEX IF NOT EXISTS app_backgrounds_slot_idx ON app_backgrounds (slot, created_at DESC);
CREATE INDEX IF NOT EXISTS app_backgrounds_active_idx ON app_backgrounds (is_active);

-- Ads & events managed from the admin panel: one row per ad, shown in the home
-- carousel, as the app-open popup and on the dedicated ads page.
CREATE TABLE IF NOT EXISTS ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_ar text NOT NULL DEFAULT '',
  title_en text NOT NULL DEFAULT '',
  body_ar text NOT NULL DEFAULT '',
  body_en text NOT NULL DEFAULT '',
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  media_url text NOT NULL,
  link_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  show_banner boolean NOT NULL DEFAULT true,
  show_popup boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  click_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ads_live_idx ON ads (is_active, sort_order, created_at DESC);

-- One row per tracked interaction. The partial unique index makes a view count
-- once per user per day; clicks are always inserted.
CREATE TABLE IF NOT EXISTS ad_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('view', 'click')),
  day date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ad_events_daily_view_idx
  ON ad_events (ad_id, user_id, day) WHERE kind = 'view';
CREATE INDEX IF NOT EXISTS ad_events_ad_idx ON ad_events (ad_id, created_at DESC);

-- Official support account (one reserved row, hidden from discovery and pinned in chat).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_support boolean NOT NULL DEFAULT false;

-- Delivery receipt for chat messages: set when the recipient is online at send
-- time or when the thread is opened. `read_at` still marks "seen".
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- One support ticket per user: the private conversation with the support account.
-- `unread_admin` counts user messages the admin has not opened yet.
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  subject text,
  unread_admin integer NOT NULL DEFAULT 0,
  unread_user integer NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status, last_message_at DESC);

-- Audit trail of every support action (reply, broadcast, status change…).
CREATE TABLE IF NOT EXISTS support_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  action text NOT NULL,
  ticket_id uuid,
  user_id uuid,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_events_created_idx ON support_events (created_at DESC);

-- Deleting a frame from the admin panel must not erase the send/charge history,
-- so the log keeps its own copy of the name and the catalog link may go away.
ALTER TABLE room_frame_sends ADD COLUMN IF NOT EXISTS frame_name text NOT NULL DEFAULT '';
ALTER TABLE room_frame_sends ALTER COLUMN frame_id DROP NOT NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'room_frame_sends_frame_id_fkey' AND confdeltype = 'c'
  ) THEN
    ALTER TABLE room_frame_sends DROP CONSTRAINT room_frame_sends_frame_id_fkey;
    ALTER TABLE room_frame_sends
      ADD CONSTRAINT room_frame_sends_frame_id_fkey
      FOREIGN KEY (frame_id) REFERENCES room_frames(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ===== Official recharge agents (وكلاء الشحن الرسميون) =====
-- A row here IS the agent status: 'revoked' hides the panel and the badge but keeps
-- the money history, so an admin can never erase the audit trail.
CREATE TABLE IF NOT EXISTS agents (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  commission_percent numeric(5,2) NOT NULL DEFAULT 10 CHECK (commission_percent >= 0 AND commission_percent <= 90),
  coins_balance bigint NOT NULL DEFAULT 0 CHECK (coins_balance >= 0),
  gold_balance bigint NOT NULL DEFAULT 0 CHECK (gold_balance >= 0),
  total_sales_coins bigint NOT NULL DEFAULT 0,
  total_commission bigint NOT NULL DEFAULT 0,
  paid_commission bigint NOT NULL DEFAULT 0,
  note text,
  assigned_by text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS agents_status_idx ON agents (status, created_at DESC);

-- Recharge packages an agent sells: `amount` units cost `cost_coins` from the agent balance.
CREATE TABLE IF NOT EXISTS agent_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  currency text NOT NULL DEFAULT 'coins',
  amount bigint NOT NULL CHECK (amount > 0),
  cost_coins bigint NOT NULL CHECK (cost_coins > 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only money trail of the agent balance and the commission account.
CREATE TABLE IF NOT EXISTS agent_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  currency text NOT NULL DEFAULT 'coins',
  amount bigint NOT NULL,
  balance_after bigint NOT NULL,
  ref_type text,
  ref_id uuid,
  note text,
  actor text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_ledger_agent_idx ON agent_ledger (agent_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS agent_ledger_unique_idx ON agent_ledger (agent_id, kind, ref_id);

-- One row per delivered recharge (direct by the agent, or a completed user request).
CREATE TABLE IF NOT EXISTS agent_recharges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id uuid REFERENCES agent_packages(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'coins',
  amount bigint NOT NULL CHECK (amount > 0),
  cost_coins bigint NOT NULL CHECK (cost_coins >= 0),
  commission_coins bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  idempotency_key text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_recharges_agent_idx ON agent_recharges (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_recharges_user_idx ON agent_recharges (user_id, created_at DESC);
-- The same confirmation can never be applied twice.
CREATE UNIQUE INDEX IF NOT EXISTS agent_recharges_key_idx ON agent_recharges (agent_id, idempotency_key);

-- Customer recharge requests sent from the official agents page.
CREATE TABLE IF NOT EXISTS agent_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id uuid REFERENCES agent_packages(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'coins',
  amount bigint NOT NULL CHECK (amount > 0),
  cost_coins bigint NOT NULL CHECK (cost_coins >= 0),
  status text NOT NULL DEFAULT 'pending',
  note text,
  agent_note text,
  recharge_id uuid REFERENCES agent_recharges(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS agent_requests_agent_idx ON agent_requests (agent_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_requests_user_idx ON agent_requests (user_id, created_at DESC);

-- Gold is a second currency users receive from agents; coins stay in wallets.balance.
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS gold bigint NOT NULL DEFAULT 0 CHECK (gold >= 0);

-- ============================================================================
-- YALLA PHONE AI SECURITY — automatic moderation, penalties and appeals.
-- Every decision is written server-side; the app only renders it.
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_strikes integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_last_violation_at timestamptz;

CREATE TABLE IF NOT EXISTS security_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  engine text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  confidence numeric(4,3) NOT NULL DEFAULT 0.5,
  surface text NOT NULL,
  excerpt text,
  matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text NOT NULL,
  strike integer NOT NULL DEFAULT 1,
  restriction_id uuid,
  status text NOT NULL DEFAULT 'auto',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_violations_user_idx ON security_violations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_violations_created_idx ON security_violations (created_at DESC);
CREATE INDEX IF NOT EXISTS security_violations_category_idx ON security_violations (category, created_at DESC);

CREATE TABLE IF NOT EXISTS security_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability text NOT NULL,
  reason text NOT NULL,
  violation_id uuid,
  expires_at timestamptz,
  lifted_at timestamptz,
  lifted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_restrictions_user_idx ON security_restrictions (user_id, capability, expires_at);

CREATE TABLE IF NOT EXISTS security_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  violation_id uuid,
  restriction_id uuid,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  resolution text,
  resolved_by uuid,
  auto_resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS security_appeals_user_idx ON security_appeals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_appeals_status_idx ON security_appeals (status, created_at DESC);

CREATE TABLE IF NOT EXISTS security_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_media_hashes (
  hash text PRIMARY KEY,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- YALLA PHONE multi-currency economy
--   GOLD    → wallets.gold            (gifts / games)
--   DIAMOND → wallets.balance         (gifts in rooms and private chats)
--   BEANS   → profit_wallets.available (gift profits, withdrawable)
-- Every currency has its own append-only ledger with a reference, a timestamp
-- and the balance before/after the movement. No conversion between currencies.
-- ============================================================================

-- Gold ledger. `(user_id, type, ref_id)` is unique so a retried request can
-- never credit or debit the same reference twice.
CREATE TABLE IF NOT EXISTS gold_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount bigint NOT NULL,
  balance_before bigint NOT NULL DEFAULT 0,
  balance_after bigint NOT NULL DEFAULT 0,
  ref_type text,
  ref_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gold_transactions_user_idx ON gold_transactions (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS gold_transactions_unique_ref_idx
  ON gold_transactions (user_id, type, ref_id);

-- Balances before the movement, so a statement can always be reconstructed.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS balance_before bigint NOT NULL DEFAULT 0;
ALTER TABLE profit_transactions ADD COLUMN IF NOT EXISTS balance_before bigint NOT NULL DEFAULT 0;

-- Gift profit split: recipient (bean share), room owner (bean share) and the
-- administration (remainder). `host_percent` overrides the global default.
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS host_percent integer;
ALTER TABLE gift_sends ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'diamond';
ALTER TABLE gift_sends ADD COLUMN IF NOT EXISTS host_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE gift_sends ADD COLUMN IF NOT EXISTS host_coins bigint NOT NULL DEFAULT 0;
ALTER TABLE gift_sends ADD COLUMN IF NOT EXISTS host_percent integer NOT NULL DEFAULT 0;

-- Withdrawal review trail: the rate and fee are frozen when the request is
-- created, and the payout proof/transfer reference is recorded when it is paid.
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS rate numeric NOT NULL DEFAULT 0;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS fee_percent numeric NOT NULL DEFAULT 0;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS fee_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS net_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS balance_before bigint NOT NULL DEFAULT 0;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS transfer_ref text;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS proof_url text;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS reviewed_by uuid;
ALTER TABLE withdrawal_requests ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
CREATE INDEX IF NOT EXISTS withdrawal_requests_created_idx
  ON withdrawal_requests (created_at DESC);

-- Staff roles: superadmin (everything), moderator (operations, no money),
-- accountant (money and payouts only).
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'superadmin';
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
UPDATE admin_users SET role = 'superadmin' WHERE role IS NULL OR role = '';

-- Exchange rates, payout limits, fees and gift profit shares (admin managed).
INSERT INTO app_settings (key, value) VALUES
  ('beans_per_usd',        '1000'::jsonb),
  ('bean_to_iqd_rate',     '1'::jsonb),
  ('min_withdrawal_beans', '1000'::jsonb),
  ('max_withdrawal_beans', '5000000'::jsonb),
  ('withdrawal_fee_percent', '0'::jsonb),
  ('withdrawal_methods',   '[{"id":"manual","label":"تحويل يدوي / كاش","labelEn":"Manual transfer / cash","enabled":true,"note":"حوّل المبلغ ثم أرسل رقم الطلب للإدارة"},{"id":"zaincash","label":"ZainCash","labelEn":"ZainCash","enabled":true,"note":"محفظة زين كاش"},{"id":"fastpay","label":"FastPay","labelEn":"FastPay","enabled":true,"note":"محفظة فاست باي"},{"id":"bank","label":"حساب مصرفي","labelEn":"Bank account","enabled":true,"note":"تحويل مصرفي"}]'::jsonb),
  ('gold_gifts_enabled',   'true'::jsonb),
  ('gift_host_percent',    '10'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- Room membership, likes and the room upgrade store
-- ----------------------------------------------------------------------------
-- Presence (who has the room open right now) is live over the websocket; a
-- stored membership is what makes someone an «عضو» of the room, and the room's
-- capacity is decided by the upgrade tier it owns (1000 members when free).
-- ============================================================================
CREATE TABLE IF NOT EXISTS room_members (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS room_members_user_idx ON room_members (user_id);

-- The heart in the member list: one like per user per room.
CREATE TABLE IF NOT EXISTS room_likes (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- Rooms the user pinned from the stage (حفظ الغرفة). The saved room floats in the
-- app as a round bubble so it can be reopened with one tap.
CREATE TABLE IF NOT EXISTS saved_rooms (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room_id)
);

-- Admin-defined upgrades sold inside a room's own store. `member_capacity` is
-- the member limit the tier unlocks; `price_diamonds` is charged once per room.
CREATE TABLE IF NOT EXISTS room_upgrade_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_en text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  image_url text,
  price_diamonds integer NOT NULL DEFAULT 0 CHECK (price_diamonds >= 0),
  member_capacity integer NOT NULL DEFAULT 1000 CHECK (member_capacity > 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_upgrades (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES room_upgrade_tiers(id) ON DELETE CASCADE,
  purchased_by uuid REFERENCES users(id) ON DELETE SET NULL,
  price_paid integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, tier_id)
);
-- `id` is the wallet-ledger reference of the purchase, so a retry cannot charge twice.
ALTER TABLE room_upgrades ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS room_upgrades_id_uidx ON room_upgrades (id);

-- Temporary room bans: a banned visitor cannot join until `until`.
CREATE TABLE IF NOT EXISTS room_bans (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  until timestamptz NOT NULL,
  banned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- ---------------------------------------------------------------- «أم الحجار» game
-- A real-time two-player stone game. Gold entry fees, prizes and refunds all go
-- through `gold_transactions` (wallet.moveGold), never through a client balance.
CREATE TABLE IF NOT EXISTS game_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  entry_fee integer NOT NULL DEFAULT 100 CHECK (entry_fee >= 0),
  min_entry integer NOT NULL DEFAULT 50 CHECK (min_entry >= 0),
  max_entry integer NOT NULL DEFAULT 5000 CHECK (max_entry >= 0),
  app_percent integer NOT NULL DEFAULT 10 CHECK (app_percent BETWEEN 0 AND 50),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO game_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS game_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'quick' CHECK (mode IN ('quick', 'private')),
  code text,
  host_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished', 'cancelled')),
  entry_fee integer NOT NULL DEFAULT 0 CHECK (entry_fee >= 0),
  pot integer NOT NULL DEFAULT 0,
  app_cut integer NOT NULL DEFAULT 0,
  prize integer NOT NULL DEFAULT 0,
  winner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  turn_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_action_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS game_matches_status_idx ON game_matches (status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS game_matches_code_uidx
  ON game_matches (code) WHERE code IS NOT NULL AND status = 'waiting';

CREATE TABLE IF NOT EXISTS game_players (
  match_id uuid NOT NULL REFERENCES game_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  color text NOT NULL CHECK (color IN ('white', 'black')),
  score integer NOT NULL DEFAULT 0,
  paid integer NOT NULL DEFAULT 0,
  shots integer NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS game_players_user_idx ON game_players (user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS game_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES game_matches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'emoji', 'system')),
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_messages_match_idx ON game_messages (match_id, created_at);

CREATE TABLE IF NOT EXISTS game_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES game_matches(id) ON DELETE SET NULL,
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_bans (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  until timestamptz NOT NULL,
  banned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------- lucky gifts
-- «هدايا الحظ» inside voice rooms: every spin is one paid try. `request_id`
-- makes a retried request idempotent (one row, one charge, one prize).
CREATE TABLE IF NOT EXISTS lucky_gift_spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cost integer NOT NULL CHECK (cost >= 0),
  prize integer NOT NULL DEFAULT 0 CHECK (prize >= 0),
  tier_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lucky_gift_spins_user_idx ON lucky_gift_spins (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lucky_gift_spins_room_idx ON lucky_gift_spins (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lucky_gift_spins_created_idx ON lucky_gift_spins (created_at DESC);

INSERT INTO app_settings (key, value)
SELECT * FROM (VALUES
  ('lucky_gift_enabled', 'true'::jsonb),
  ('lucky_gift_price', '1000'::jsonb),
  ('lucky_gift_prizes', '[{"amount":0,"weight":28},{"amount":500,"weight":24},{"amount":1000,"weight":20},{"amount":2000,"weight":14},{"amount":5000,"weight":9},{"amount":10000,"weight":4},{"amount":25000,"weight":1}]'::jsonb)
) AS seed(key, value)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------ weekly login rewards
-- «مكافأة الدخول الأسبوعية»: one claim per Baghdad day. `login_reward_state`
-- holds the cursor (week + last day), `login_reward_claims` is the history and
-- the idempotency guard, so a retried claim can never pay twice.
CREATE TABLE IF NOT EXISTS login_reward_state (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cycle_no integer NOT NULL DEFAULT 1 CHECK (cycle_no >= 1),
  day_no integer NOT NULL DEFAULT 0 CHECK (day_no BETWEEN 0 AND 7),
  last_claim_on date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_reward_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle_no integer NOT NULL,
  day_no integer NOT NULL CHECK (day_no BETWEEN 1 AND 7),
  claimed_on date NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cycle_no, day_no)
);
CREATE INDEX IF NOT EXISTS login_reward_claims_user_idx ON login_reward_claims (user_id, claimed_at DESC);
