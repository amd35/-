/**
 * «أم الحجار» — server-authoritative stone physics.
 *
 * The client only sends the aim (angle + power). The server simulates the shot
 * with fixed time steps and returns the frames both clients animate, so a
 * tampered client can never move stones or claim a score.
 */

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

export interface ShotInput {
  /** Striker position on the shooter's baseline (140..860). */
  x: number;
  /** Radians; 0 points right, PI/2 points down. */
  angle: number;
  /** 0..1 pull strength. */
  power: number;
}

export interface ShotOutcome {
  frames: number[][];
  pocketed: { id: string; color: StoneColor }[];
  foul: boolean;
  striker: { x: number; y: number };
}

interface Body {
  id: string;
  color: StoneColor | 'striker';
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  mass: number;
  alive: boolean;
}

const STEP = 1 / 60;
const FRICTION = 0.992;
const RESTITUTION = 0.92;
const WALL_BOUNCE = 0.82;

/** Fresh board: 9 white + 9 black stones in two rings, white to shoot. */
export function initialState(): MatchState {
  const stones: StoneState[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI * 2 * i) / 6;
    stones.push({
      id: `i${i}`,
      color: i % 2 === 0 ? 'white' : 'black',
      x: 500 + Math.cos(angle) * 74,
      y: 500 + Math.sin(angle) * 74,
    });
  }
  for (let i = 0; i < 12; i += 1) {
    const angle = (Math.PI * 2 * i) / 12 + Math.PI / 12;
    stones.push({
      id: `o${i}`,
      color: i % 2 === 0 ? 'black' : 'white',
      x: 500 + Math.cos(angle) * 156,
      y: 500 + Math.sin(angle) * 156,
    });
  }
  return {
    stones,
    striker: { x: 500, y: baselineFor('white') },
    turn: 'white',
    scores: { white: 0, black: 0 },
    shots: { white: 0, black: 0 },
    pocketed: { white: 0, black: 0 },
  };
}

export function baselineFor(color: StoneColor): number {
  return color === 'white' ? 900 : 100;
}

export function clampStrikerX(value: unknown): number {
  const x = Number(value);
  if (!Number.isFinite(x)) return 500;
  return Math.max(150, Math.min(850, Math.round(x)));
}

/** Simulates one shot and returns the animation frames plus what got pocketed. */
export function simulateShot(state: MatchState, shooter: StoneColor, input: ShotInput): ShotOutcome {
  const strikerX = clampStrikerX(input.x);
  const power = Math.max(0.08, Math.min(1, Number(input.power) || 0));
  const angle = Number.isFinite(Number(input.angle)) ? Number(input.angle) : Math.PI / 2;

  const bodies: Body[] = state.stones.map((stone) => ({
    id: stone.id,
    color: stone.color,
    x: stone.x,
    y: stone.y,
    vx: 0,
    vy: 0,
    r: STONE_RADIUS,
    mass: 1,
    alive: true,
  }));
  const striker: Body = {
    id: 'striker',
    color: 'striker',
    x: strikerX,
    y: baselineFor(shooter),
    vx: Math.cos(angle) * (600 + power * 2000),
    vy: Math.sin(angle) * (600 + power * 2000),
    r: STRIKER_RADIUS,
    mass: 1.5,
    alive: true,
  };
  const all = [striker, ...bodies];
  const pocketed: { id: string; color: StoneColor }[] = [];
  const frames: number[][] = [];
  let foul = false;

  const snapshot = () => {
    const row: number[] = [striker.alive ? round(striker.x) : -9999, striker.alive ? round(striker.y) : -9999];
    for (const body of bodies) row.push(body.alive ? round(body.x) : -9999, body.alive ? round(body.y) : -9999);
    frames.push(row);
  };

  snapshot();
  for (let step = 0; step < 900; step += 1) {
    let fastest = 0;
    for (const body of all) {
      if (!body.alive) continue;
      body.x += body.vx * STEP;
      body.y += body.vy * STEP;
      body.vx *= FRICTION;
      body.vy *= FRICTION;
      if (body.x < body.r) {
        body.x = body.r;
        body.vx = Math.abs(body.vx) * WALL_BOUNCE;
      } else if (body.x > BOARD_SIZE - body.r) {
        body.x = BOARD_SIZE - body.r;
        body.vx = -Math.abs(body.vx) * WALL_BOUNCE;
      }
      if (body.y < body.r) {
        body.y = body.r;
        body.vy = Math.abs(body.vy) * WALL_BOUNCE;
      } else if (body.y > BOARD_SIZE - body.r) {
        body.y = BOARD_SIZE - body.r;
        body.vy = -Math.abs(body.vy) * WALL_BOUNCE;
      }
      fastest = Math.max(fastest, Math.hypot(body.vx, body.vy));
    }

    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        if (all[i].alive && all[j].alive) collide(all[i], all[j]);
      }
    }

    for (const body of all) {
      if (!body.alive) continue;
      const pocket = POCKETS.find(
        (spot) => Math.hypot(spot.x - body.x, spot.y - body.y) < POCKET_RADIUS - body.r * 0.35
      );
      if (!pocket) continue;
      body.alive = false;
      body.vx = 0;
      body.vy = 0;
      if (body.color === 'striker') {
        foul = true;
      } else {
        pocketed.push({ id: body.id, color: body.color });
      }
    }

    if (step % 3 === 0) snapshot();
    if (foul || !bodies.some((body) => body.alive) || fastest < 10) break;
  }
  snapshot();

  return {
    frames,
    pocketed,
    foul,
    striker: {
      x: striker.alive ? round(striker.x) : strikerX,
      y: striker.alive ? round(striker.y) : baselineFor(shooter),
    },
  };
}

function collide(a: Body, b: Body): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  const min = a.r + b.r;
  if (distance === 0 || distance >= min) return;
  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = min - distance;
  const total = a.mass + b.mass;
  a.x -= nx * overlap * (b.mass / total);
  a.y -= ny * overlap * (b.mass / total);
  b.x += nx * overlap * (a.mass / total);
  b.y += ny * overlap * (a.mass / total);

  const along = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (along > 0) return;
  const impulse = (-(1 + RESTITUTION) * along) / (1 / a.mass + 1 / b.mass);
  a.vx -= (impulse * nx) / a.mass;
  a.vy -= (impulse * ny) / a.mass;
  b.vx += (impulse * nx) / b.mass;
  b.vy += (impulse * ny) / b.mass;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
