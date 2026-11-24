import { q } from './db';

/**
 * «هدية المليون»: a diamond gift worth a million or more becomes an app-wide
 * event. Its strip sweeps every screen — inside every room too — and the room
 * fills with an audience: 40% of them are the seeded bot accounts walking in on
 * their own, the remaining 60% are real members who tap the strip and join.
 */
export const BIG_GIFT_MIN_DIAMONDS = 1_000_000;
/** How many people the announcement expects to walk into the room. */
export const BIG_GIFT_CROWD = 10;
/** Share of that crowd played by the seeded bot accounts. */
export const BIG_GIFT_BOT_SHARE = 0.4;

/**
 * The crowd bots. Their IDs are reserved numeric codes (`0001xx`) so the boot
 * cleanup, which regenerates non-numeric usernames, leaves them alone, and no
 * generated account can ever take them.
 */
const CROWD_BOTS: { username: string; name: string }[] = [
  { username: '000101', name: 'نور' },
  { username: '000102', name: 'سارة' },
  { username: '000103', name: 'مريم' },
  { username: '000104', name: 'حسين' },
  { username: '000105', name: 'علي' },
  { username: '000106', name: 'زينب' },
  { username: '000107', name: 'مصطفى' },
  { username: '000108', name: 'رغد' },
];

const CROWD_USERNAMES = CROWD_BOTS.map((bot) => bot.username);

/** Seeds the crowd bots once at boot; `is_bot` rows stay out of discovery. */
export async function ensureCrowdBots(): Promise<void> {
  for (const bot of CROWD_BOTS) {
    await q(
      `INSERT INTO users (username, display_name, is_bot, provider, bio)
       VALUES ($1, $2, true, 'bot', 'عضو في يلا فون')
       ON CONFLICT (username) DO UPDATE SET is_bot = true, display_name = EXCLUDED.display_name`,
      [bot.username, bot.name]
    );
  }
}

export interface CrowdEntrant {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/**
 * The bot share of the crowd walks into the room and becomes a member, so the
 * member list and the capacity count move exactly like a real join. A room that
 * already holds every bot simply gets nobody new.
 */
export async function botCrowdEnters(roomId: string): Promise<CrowdEntrant[]> {
  const wanted = Math.max(1, Math.round(BIG_GIFT_CROWD * BIG_GIFT_BOT_SHARE));
  const bots = await q<{ id: string; display_name: string | null; avatar_url: string | null }>(
    `SELECT u.id, u.display_name, u.avatar_url
       FROM users u
      WHERE u.is_bot = true
        AND u.username = ANY($1)
        AND NOT EXISTS (
          SELECT 1 FROM room_members m WHERE m.room_id = $2 AND m.user_id = u.id
        )
      ORDER BY random()
      LIMIT $3`,
    [CROWD_USERNAMES, roomId, wanted]
  );
  if (!bots.length) return [];
  await q(
    `INSERT INTO room_members (room_id, user_id)
     SELECT $1, unnest($2::uuid[])
     ON CONFLICT DO NOTHING`,
    [roomId, bots.map((bot) => bot.id)]
  );
  return bots.map((bot) => ({
    id: bot.id,
    name: bot.display_name || '',
    avatarUrl: bot.avatar_url,
  }));
}
