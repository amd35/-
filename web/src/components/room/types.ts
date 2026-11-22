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

export interface RoomData {
  id: string;
  code: string;
  name: string;
  description: string;
  coverUrl: string | null;
  rules: string;
  background: string;
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
}
