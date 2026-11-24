import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { UserCardData } from '../UserCard';

export interface OwnedFrame {
  id: string;
  name: string;
  design: string | null;
  kind: string;
  imageUrl: string | null;
  rarity: string;
}

export interface UserProfileData {
  user: UserCardData;
  counts: { friends: number; followers: number; following: number };
  earnings: { total: number; calls: number } | null;
  gifts: { count: number; coins: number };
  balances: { coins: number } | null;
  frames: OwnedFrame[];
  isSelf: boolean;
}

/** Shared loader for the quick room card and the full profile screen. */
export function useUserProfile(userId: string | null) {
  const [data, setData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setData(await api<UserProfileData>(`/users/${userId}`));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    void load();
  }, [userId, load]);

  const patchUser = useCallback((changes: Partial<UserCardData>) => {
    setData((current) => (current ? { ...current, user: { ...current.user, ...changes } } : current));
  }, []);

  return { data, loading, load, patchUser };
}
