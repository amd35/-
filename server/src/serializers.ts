import { one } from './db';
import { isOnline } from './realtime';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  gender: string | null;
  country: string | null;
  online: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

interface UserLike {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio?: string | null;
  gender?: string | null;
  country?: string | null;
  last_seen_at?: string | Date | null;
  created_at?: string | Date;
}

function recentlySeen(value: string | Date | null | undefined): boolean {
  if (!value) return false;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) && Date.now() - ts < 90_000;
}

export function toPublicUser(row: UserLike): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio ?? null,
    gender: row.gender ?? null,
    country: row.country ?? null,
    online: isOnline(row.id) || recentlySeen(row.last_seen_at),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

export async function getPublicUser(userId: string): Promise<PublicUser | null> {
  const row = await one<UserLike>(
    'SELECT id, username, display_name, avatar_url, bio, gender, country, last_seen_at, created_at FROM users WHERE id = $1',
    [userId]
  );
  return row ? toPublicUser(row) : null;
}
