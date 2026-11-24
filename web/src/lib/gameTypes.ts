/** Shared «أم الحجار» client types (mirrors the server payloads). */

export type StoneColor = 'white' | 'black';

export interface StoneState {
  id: string;
  color: StoneColor;
  x: number;
  y: number;
}

export interface MatchState {
  stones: StoneState[];
  striker: { x: number; y: number };
  turn: StoneColor;
  scores: Record<StoneColor, number>;
  shots: Record<StoneColor, number>;
  pocketed: Record<StoneColor, number>;
}

export interface GamePlayer {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: StoneColor;
  score: number;
  shots: number;
}

export interface GameMessage {
  id: string;
  userId: string;
  kind: 'text' | 'emoji' | 'system';
  body: string;
  createdAt: string;
}

export interface GameMatchInfo {
  id: string;
  mode: 'quick' | 'private';
  code: string | null;
  status: 'waiting' | 'playing' | 'finished' | 'cancelled';
  entryFee: number;
  pot: number;
  appCut: number;
  prize: number;
  winnerId: string | null;
  turnUserId: string | null;
  state: MatchState | Record<string, never>;
  startedAt: string | null;
  endedAt: string | null;
}

export interface MatchDetail {
  match: GameMatchInfo;
  players: GamePlayer[];
  myColor: StoneColor | null;
  messages: GameMessage[];
  gold: number;
}

export interface GameSettingsInfo {
  enabled: boolean;
  entryFee: number;
  minEntry: number;
  maxEntry: number;
  appPercent: number;
}

export interface GameSnapshot {
  settings: GameSettingsInfo;
  gold: number;
  online: number;
  stats: { played: number; wins: number; losses: number };
  active: { matchId: string; status: string; mode: string; code: string | null; fee: number } | null;
  history: {
    id: string;
    entryFee: number;
    prize: number;
    won: boolean;
    endedAt: string | null;
    opponent: { displayName: string; avatarUrl: string | null };
  }[];
  leaderboard: {
    rank: number;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    wins: number;
    played: number;
  }[];
  openRooms: { id: string; code: string; entryFee: number; hostName: string; hostAvatar: string | null }[];
}

export const BOARD_SIZE = 1000;
export const STONE_RADIUS = 22;
export const STRIKER_RADIUS = 27;
export const POCKET_RADIUS = 54;
export const MAX_SHOTS = 30;

export const POCKETS = [
  { x: 72, y: 72 },
  { x: BOARD_SIZE - 72, y: 72 },
  { x: 72, y: BOARD_SIZE - 72 },
  { x: BOARD_SIZE - 72, y: BOARD_SIZE - 72 },
];

export function baselineFor(color: StoneColor): number {
  return color === 'white' ? 900 : 100;
}

export const GAME_EMOJIS = ['❤️', '🌹', '😂', '👏', '🔥', '👑', '😮', '😡', '👍', '💪', '🎉', '😎'];
