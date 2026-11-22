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

-- Default cover artwork for every gift (admins can replace it per gift from the panel).
UPDATE gifts SET cover_url = 'https://media.base44.com/images/public/6addb0a6b0689d303ed3a495/0f0338134_file_000000007c54821081a33f6e0657af7c.png'
WHERE cover_url IS NULL;

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
  -- Administrative announcement: only an official admin position can post one.
  is_announcement boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE room_messages ADD COLUMN IF NOT EXISTS is_announcement boolean NOT NULL DEFAULT false;
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
