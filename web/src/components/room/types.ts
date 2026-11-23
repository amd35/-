import type { RoomMessageData } from '../RoomGiftSheet';
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
  rules: string;
  background: string;
  micStyle: string;
  micColor: string;
  musicUrl: string | null;
  country: string;
  language: string;
  ownerId: string | null;
  owner: SeatUser | null;
  role: 'owner' | 'admin' | 'supervisor' | 'member';
  canManage: boolean;
  canModerate: boolean;
  roles: RoomRoleEntry[];
  mics: RoomMic[];
  /** Frames still running in this room (server clock). */
  frames: RoomFrameWear[];
  capacity: RoomCapacity;
  /** Is the caller a stored member of this room? */
  member: boolean;
  liked: boolean;
  likes: number;
}
