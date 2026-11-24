import type { RoomMessageData } from '../RoomGiftSheet';
import type { GiftTickerItem } from '../../lib/giftTicker';
import type { SeatUser, RoomMic } from './MicSeat';

export type { RoomMic, SeatUser };
export type { RoomMessageData };

export interface RoomRoleEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'admin' | 'supervisor';
}

export type RoomMemberRole = 'owner' | 'admin' | 'supervisor' | 'member';

/** Staff the room may appoint, by the level its upgrades gave it. */
export interface RoomStaff {
  level: number;
  supervisorCount: number;
  supervisorLimit: number;
  viceCount: number;
  viceLimit: number;
}

/** Members stored for the room vs. the limit the owned upgrade allows. */
export interface RoomCapacity {
  count: number;
  limit: number;
  tierId: string | null;
  tierName: string | null;
}

export interface RoomMemberEntry {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  online: boolean;
  role: RoomMemberRole;
  joinedAt: string | null;
}

/** One admin-defined upgrade sold inside the room's own store. */
export interface RoomUpgradeTier {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  imageUrl: string | null;
  priceDiamonds: number;
  memberCapacity: number;
  owned: boolean;
}

export interface RoomStoreData {
  tiers: RoomUpgradeTier[];
  capacity: RoomCapacity;
  balance: number;
  isOwner: boolean;
  canManage: boolean;
}

export interface RoomFrameWear {
  userId: string;
  frameId: string;
  name: string;
  imageUrl: string;
  expiresAt: string;
  remainingMs: number;
}

export interface RoomData {
  id: string;
  code: string;
  name: string;
  description: string;
  coverUrl: string | null;
  avatarUrl: string | null;
  rules: string;
  background: string;
  micStyle: string;
  micColor: string;
  musicUrl: string | null;
  country: string;
  language: string;
  ownerId: string | null;
  /** Room level 1..100, derived on the server from real activity inside the room. */
  level: number;
  levelXp: number;
  levelXpFloor: number;
  levelXpNext: number | null;
  /** Mic seats the level opens (5 → 10 → 15). */
  micSlots: number;
  owner: SeatUser | null;
  role: 'owner' | 'admin' | 'supervisor' | 'member';
  canManage: boolean;
  canModerate: boolean;
  roles: RoomRoleEntry[];
  mics: RoomMic[];
  /** Latest gift sent in this room, shown in the fixed announcement bar. */
  lastGift?: GiftTickerItem | null;
  /** Frames still running in this room (server clock). */
  frames: RoomFrameWear[];
  capacity: RoomCapacity;
  staff: RoomStaff;
  /** Is the caller a stored member of this room? */
  member: boolean;
  /** Is the room pinned to the caller's floating bubble (حفظ الغرفة)? */
  saved: boolean;
  liked: boolean;
  likes: number;
}
