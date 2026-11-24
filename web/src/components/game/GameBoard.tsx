import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BOARD_SIZE,
  POCKETS,
  POCKET_RADIUS,
  STONE_RADIUS,
  STRIKER_RADIUS,
  baselineFor,
  type MatchState,
  type StoneColor,
  type StoneState,
} from '../../lib/gameTypes';

export interface BoardAnimation {
  frames: number[][];
  stones: StoneState[];
  striker: { x: number; y: number };
  /** Duration of one server frame in ms (50 ms when the server omits it). */
  frameMs?: number;
}

interface Props {
  state: MatchState;
  myColor: StoneColor | null;
  disabled: boolean;
  animation: BoardAnimation | null;
  onAnimationEnd: () => void;
  onShoot: (shot: { x: number; angle: number; power: number }) => void;
}

type Playback = {
  frames: number[][];
  stones: StoneState[];
  frameMs: number;
  startedAt: number;
  dropped: Set<number>;
  finished: boolean;
};

type Sprite = {
  color?: StoneColor;
  x: number;
  y: number;
  scale: number;
  alpha: number;
  speed: number;
};

type DropFx = { x: number; y: number; at: number };
type Glide = { tx: number; ty: number; fromX: number; fromY: number; at: number };

const GLIDE_MS = 320;
const DROP_FX_MS = 620;
const AIM_MAX_DISTANCE = 360;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInQuad = (t: number) => t * t;

function nearestPocket(x: number, y: number) {
  let best = POCKETS[0];
  let bestDistance = Infinity;
  for (const pocket of POCKETS) {
    const distance = Math.hypot(pocket.x - x, pocket.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = pocket;
    }
  }
  return best;
}

function buzz(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
}

/**
 * Canvas board. Server frames arrive at ~30 fps; the renderer interpolates them
 * on every display frame, so stones glide instead of stepping, and the static
 * table is pre-rendered once per size so each frame only paints the pieces.
 */
export function GameBoard({ state, myColor, disabled, animation, onAnimationEnd, onShoot }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(340);
  const sizeRef = useRef(340);

  const propsRef = useRef({ state, myColor, disabled });
  propsRef.current = { state, myColor, disabled };
  const endRef = useRef(onAnimationEnd);
  endRef.current = onAnimationEnd;
  const shootRef = useRef(onShoot);
  shootRef.current = onShoot;

  const playRef = useRef<Playback | null>(null);
  const aimRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef(0);
  const glideRef = useRef<Glide | null>(null);
  const strikerDrawnRef = useRef<{ x: number; y: number } | null>(null);
  const fxRef = useRef<DropFx[]>([]);

  const drawScene = useCallback((now: number): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const { state: current, myColor: color, disabled: locked } = propsRef.current;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.max(1, Math.round(sizeRef.current * dpr));
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    const scale = px / BOARD_SIZE;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.drawImage(tableSurface(px), 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    let busy = false;
    const play = playRef.current;

    if (color) drawBaseline(ctx, color);

    const sprites: Sprite[] = [];
    let striker: Sprite | null = null;

    if (play) {
      const span = play.frames.length - 1;
      const raw = (now - play.startedAt) / play.frameMs;
      const index = Math.min(span, Math.max(0, Math.floor(raw)));
      const frac = index >= span ? 0 : clamp01(raw - index);
      const a = play.frames[index];
      const b = play.frames[Math.min(span, index + 1)];
      busy = index < span;

      for (let i = 0; i < play.stones.length; i += 1) {
        const stone = play.stones[i];
        const ax = a[2 + i * 2];
        const ay = a[3 + i * 2];
        const bx = b[2 + i * 2];
        const by = b[3 + i * 2];
        if (ax < -100) continue;
        if (bx < -100) {
          // Pocketed between these frames: drop it into the nearest hole.
          const pocket = nearestPocket(ax, ay);
          const drop = easeInQuad(frac);
          if (!play.dropped.has(i)) {
            play.dropped.add(i);
            fxRef.current.push({ x: pocket.x, y: pocket.y, at: now });
            buzz(18);
          }
          sprites.push({
            color: stone.color,
            x: lerp(ax, pocket.x, drop),
            y: lerp(ay, pocket.y, drop),
            scale: 1 - 0.72 * drop,
            alpha: 1 - drop,
            speed: 0,
          });
          continue;
        }
        sprites.push({
          color: stone.color,
          x: lerp(ax, bx, frac),
          y: lerp(ay, by, frac),
          scale: 1,
          alpha: 1,
          speed: (Math.hypot(bx - ax, by - ay) / play.frameMs) * 1000,
        });
      }

      if (a[0] > -100) {
        if (b[0] < -100) {
          const pocket = nearestPocket(a[0], a[1]);
          const drop = easeInQuad(frac);
          striker = {
            x: lerp(a[0], pocket.x, drop),
            y: lerp(a[1], pocket.y, drop),
            scale: 1 - 0.7 * drop,
            alpha: 1 - drop,
            speed: 0,
          };
        } else {
          striker = {
            x: lerp(a[0], b[0], frac),
            y: lerp(a[1], b[1], frac),
            scale: 1,
            alpha: 1,
            speed: (Math.hypot(b[0] - a[0], b[1] - a[1]) / play.frameMs) * 1000,
          };
        }
      }

      if (index >= span) play.finished = true;
    } else {
      for (const stone of current.stones) {
        if (stone.x < -100) continue;
        sprites.push({ color: stone.color, x: stone.x, y: stone.y, scale: 1, alpha: 1, speed: 0 });
      }

      // Glide the striker to its new resting spot instead of teleporting it.
      const target = current.striker;
      const glide = glideRef.current;
      if (!glide || glide.tx !== target.x || glide.ty !== target.y) {
        const from = strikerDrawnRef.current ?? target;
        glideRef.current = { tx: target.x, ty: target.y, fromX: from.x, fromY: from.y, at: now };
      }
      const active = glideRef.current;
      const k = active ? clamp01((now - active.at) / GLIDE_MS) : 1;
      const eased = easeOutCubic(k);
      striker = active
        ? {
            x: lerp(active.fromX, active.tx, eased),
            y: lerp(active.fromY, active.ty, eased),
            scale: 1,
            alpha: 1,
            speed: 0,
          }
        : { x: target.x, y: target.y, scale: 1, alpha: 1, speed: 0 };
      if (k < 1) busy = true;
    }

    for (const sprite of sprites) drawStone(ctx, sprite, dpr);
    if (striker && striker.alpha > 0.02) {
      const live = Boolean(color) && current.turn === color && !locked && !play;
      drawStriker(ctx, striker, live, dpr);
    }
    // A pocketed striker reappears on the baseline instead of sliding out of the hole.
    strikerDrawnRef.current = striker && striker.alpha > 0.02 ? { x: striker.x, y: striker.y } : null;

    if (fxRef.current.length) {
      fxRef.current = fxRef.current.filter((fx) => now - fx.at < DROP_FX_MS);
      for (const fx of fxRef.current) drawPocketFx(ctx, fx, now);
      if (fxRef.current.length) busy = true;
    }

    const myTurn = Boolean(color) && current.turn === color && !locked && !play;
    const aim = aimRef.current;
    if (aim && myTurn && striker) {
      drawAim(ctx, striker, aim, now);
      busy = true;
    }

    if (play && play.finished) {
      playRef.current = null;
      endRef.current();
    }
    return busy;
  }, []);

  const ensureLoop = useCallback(() => {
    if (rafRef.current) return;
    const loop = (now: number) => {
      rafRef.current = 0;
      const busy = drawScene(now);
      if (busy || aimRef.current || playRef.current) rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [drawScene]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const next = Math.max(240, Math.floor(wrap.clientWidth));
      setSize((prev) => (prev === next ? prev : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    sizeRef.current = size;
    ensureLoop();
  }, [size, state, myColor, disabled, ensureLoop]);

  useEffect(() => {
    if (!animation) {
      playRef.current = null;
      ensureLoop();
      return;
    }
    playRef.current = {
      frames: animation.frames,
      stones: animation.stones,
      frameMs: Math.max(16, animation.frameMs ?? 50),
      startedAt: performance.now(),
      dropped: new Set(),
      finished: false,
    };
    fxRef.current = [];
    ensureLoop();
  }, [animation, ensureLoop]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const toBoard = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * BOARD_SIZE,
      y: ((clientY - rect.top) / rect.height) * BOARD_SIZE,
    };
  }, []);

  const isMyTurn = () => {
    const { state: current, myColor: color, disabled: locked } = propsRef.current;
    return Boolean(color) && current.turn === color && !locked && !playRef.current;
  };

  const release = () => {
    const aim = aimRef.current;
    aimRef.current = null;
    if (!aim || !isMyTurn()) {
      ensureLoop();
      return;
    }
    const striker = propsRef.current.state.striker;
    const dx = aim.x - striker.x;
    const dy = aim.y - striker.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 18) {
      ensureLoop();
      return;
    }
    buzz(12);
    shootRef.current({
      x: striker.x,
      angle: Math.atan2(dy, dx),
      power: Math.max(0.12, Math.min(1, distance / AIM_MAX_DISTANCE)),
    });
    ensureLoop();
  };

  return (
    <div className="game-board-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={`game-board ${myColor && state.turn === myColor && !disabled && !animation ? 'is-live' : ''}`}
        style={{ width: size, height: size }}
        onPointerDown={(event) => {
          if (!isMyTurn()) return;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Older engines reject capture for a synthetic pointer; aiming still works.
          }
          aimRef.current = toBoard(event.clientX, event.clientY);
          ensureLoop();
        }}
        onPointerMove={(event) => {
          if (!aimRef.current || !isMyTurn()) return;
          aimRef.current = toBoard(event.clientX, event.clientY);
          ensureLoop();
        }}
        onPointerUp={release}
        onPointerCancel={() => {
          aimRef.current = null;
          ensureLoop();
        }}
      />
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let feltTile: HTMLCanvasElement | null = null;
let woodTile: HTMLCanvasElement | null = null;

/** Velvet grain, built once and reused for every frame. */
function feltTexture(): HTMLCanvasElement {
  if (feltTile) return feltTile;
  const tile = document.createElement('canvas');
  tile.width = 96;
  tile.height = 96;
  const c = tile.getContext('2d');
  if (c) {
    c.fillStyle = '#0a0d12';
    c.fillRect(0, 0, 96, 96);
    for (let i = 0; i < 1600; i += 1) {
      const light = Math.random() > 0.45;
      c.fillStyle = light
        ? `rgba(190, 205, 230, ${Math.random() * 0.055})`
        : `rgba(0, 0, 0, ${Math.random() * 0.1})`;
      c.fillRect(Math.random() * 96, Math.random() * 96, 1, 1);
    }
    // Woven cross-hatch so the cloth reads as fabric, not noise.
    c.lineWidth = 0.5;
    for (let i = 0; i < 96; i += 3) {
      c.strokeStyle = 'rgba(160, 180, 215, 0.03)';
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, 96);
      c.stroke();
      c.strokeStyle = 'rgba(0, 0, 0, 0.05)';
      c.beginPath();
      c.moveTo(0, i);
      c.lineTo(96, i);
      c.stroke();
    }
  }
  feltTile = tile;
  return tile;
}

/** Walnut grain, built once and reused for every frame. */
function woodTexture(): HTMLCanvasElement {
  if (woodTile) return woodTile;
  const tile = document.createElement('canvas');
  tile.width = 96;
  tile.height = 96;
  const c = tile.getContext('2d');
  if (c) {
    c.fillStyle = '#1d0f06';
    c.fillRect(0, 0, 96, 96);
    for (let i = 0; i < 46; i += 1) {
      const y = Math.random() * 96;
      const tint = Math.random() > 0.5 ? '255, 210, 150' : '0, 0, 0';
      c.strokeStyle = `rgba(${tint}, ${Math.random() * 0.09})`;
      c.lineWidth = 0.6 + Math.random() * 1.4;
      c.beginPath();
      c.moveTo(0, y);
      c.bezierCurveTo(32, y + (Math.random() - 0.5) * 6, 64, y + (Math.random() - 0.5) * 6, 96, y);
      c.stroke();
    }
  }
  woodTile = tile;
  return tile;
}

/** The static table, pre-rendered once per pixel size. */
let tableCache: { px: number; canvas: HTMLCanvasElement } | null = null;

function tableSurface(px: number): HTMLCanvasElement {
  if (tableCache && tableCache.px === px) return tableCache.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const scale = px / BOARD_SIZE;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawTable(ctx);
  }
  tableCache = { px, canvas };
  return canvas;
}

/** Gold-framed walnut table, velvet playfield and recessed brass pockets. */
function drawTable(ctx: CanvasRenderingContext2D) {
  // Outer gold band with a bevel that catches the light from the top-left.
  const gold = ctx.createLinearGradient(0, 0, BOARD_SIZE, BOARD_SIZE);
  gold.addColorStop(0, '#6f4c12');
  gold.addColorStop(0.18, '#ffe9ae');
  gold.addColorStop(0.36, '#b07d20');
  gold.addColorStop(0.52, '#fff2c6');
  gold.addColorStop(0.7, '#9a6a14');
  gold.addColorStop(0.88, '#e9c46a');
  gold.addColorStop(1, '#5d3d0c');
  roundRect(ctx, 6, 6, BOARD_SIZE - 12, BOARD_SIZE - 12, 82);
  ctx.fillStyle = gold;
  ctx.fill();

  // Walnut inlay.
  roundRect(ctx, 26, 26, BOARD_SIZE - 52, BOARD_SIZE - 52, 66);
  ctx.fillStyle = ctx.createPattern(woodTexture(), 'repeat') ?? '#1d0f06';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.stroke();

  // Brass corner screws on the wooden band.
  for (const corner of [
    { x: 74, y: 74 },
    { x: BOARD_SIZE - 74, y: 74 },
    { x: 74, y: BOARD_SIZE - 74 },
    { x: BOARD_SIZE - 74, y: BOARD_SIZE - 74 },
  ]) {
    const screw = ctx.createRadialGradient(corner.x - 3, corner.y - 3, 1, corner.x, corner.y, 9);
    screw.addColorStop(0, '#fff4cc');
    screw.addColorStop(0.55, '#c8952c');
    screw.addColorStop(1, '#5c3c08');
    ctx.beginPath();
    ctx.arc(corner.x, corner.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = screw;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(corner.x - 4, corner.y);
    ctx.lineTo(corner.x + 4, corner.y);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(60, 38, 4, 0.7)';
    ctx.stroke();
  }

  // Dark cushion rail between wood and cloth.
  roundRect(ctx, 46, 46, BOARD_SIZE - 92, BOARD_SIZE - 92, 58);
  const cushion = ctx.createLinearGradient(0, 46, 0, BOARD_SIZE - 46);
  cushion.addColorStop(0, '#1b1d26');
  cushion.addColorStop(0.5, '#0c0d13');
  cushion.addColorStop(1, '#191b24');
  ctx.fillStyle = cushion;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 231, 179, 0.16)';
  ctx.stroke();

  ctx.save();
  roundRect(ctx, 54, 54, BOARD_SIZE - 108, BOARD_SIZE - 108, 52);
  ctx.fillStyle = ctx.createPattern(feltTexture(), 'repeat') ?? '#0a0d12';
  ctx.fill();
  ctx.clip();

  // Soft overhead light falling on the centre of the cloth.
  const light = ctx.createRadialGradient(470, 430, 40, 500, 500, 540);
  light.addColorStop(0, 'rgba(125, 155, 205, 0.12)');
  light.addColorStop(0.58, 'rgba(0, 0, 0, 0.12)');
  light.addColorStop(1, 'rgba(0, 0, 0, 0.62)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

  // Inner rim shadow so the cloth sits below the rail.
  const rim = ctx.createLinearGradient(0, 54, 0, 130);
  rim.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
  rim.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rim;
  ctx.fillRect(54, 54, BOARD_SIZE - 108, 76);

  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 214, 90, 0.3)';
  roundRect(ctx, 64, 64, BOARD_SIZE - 128, BOARD_SIZE - 128, 44);
  ctx.stroke();

  // Engraved gold crest in the middle of the felt.
  ctx.save();
  ctx.translate(500, 500);
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = '#ffd24a';
  ctx.beginPath();
  ctx.moveTo(-72, 42);
  ctx.lineTo(-58, -30);
  ctx.lineTo(-22, 6);
  ctx.lineTo(0, -48);
  ctx.lineTo(22, 6);
  ctx.lineTo(58, -30);
  ctx.lineTo(72, 42);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 62, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();

  for (const pocket of POCKETS) {
    // Recessed rim around the hole.
    const recess = ctx.createRadialGradient(
      pocket.x,
      pocket.y,
      POCKET_RADIUS,
      pocket.x,
      pocket.y,
      POCKET_RADIUS + 16
    );
    recess.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    recess.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.beginPath();
    ctx.arc(pocket.x, pocket.y, POCKET_RADIUS + 16, 0, Math.PI * 2);
    ctx.fillStyle = recess;
    ctx.fill();

    const bezel = ctx.createLinearGradient(
      pocket.x - POCKET_RADIUS,
      pocket.y - POCKET_RADIUS,
      pocket.x + POCKET_RADIUS,
      pocket.y + POCKET_RADIUS
    );
    bezel.addColorStop(0, '#fff2c6');
    bezel.addColorStop(0.35, '#c8952c');
    bezel.addColorStop(0.65, '#8a5c12');
    bezel.addColorStop(1, '#ffe9ae');
    ctx.beginPath();
    ctx.arc(pocket.x, pocket.y, POCKET_RADIUS + 9, 0, Math.PI * 2);
    ctx.fillStyle = bezel;
    ctx.fill();

    const hole = ctx.createRadialGradient(
      pocket.x,
      pocket.y - POCKET_RADIUS * 0.2,
      POCKET_RADIUS * 0.1,
      pocket.x,
      pocket.y,
      POCKET_RADIUS
    );
    hole.addColorStop(0, '#000000');
    hole.addColorStop(0.7, '#050508');
    hole.addColorStop(1, '#141019');
    ctx.beginPath();
    ctx.arc(pocket.x, pocket.y, POCKET_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = hole;
    ctx.fill();

    // Lit lip at the bottom of the hole, as if the table edge reflects light.
    ctx.beginPath();
    ctx.arc(pocket.x, pocket.y, POCKET_RADIUS - 1.5, Math.PI * 0.15, Math.PI * 0.85);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 231, 179, 0.22)';
    ctx.stroke();
  }
}

/** Faint sheen marking the shooter's baseline. */
function drawBaseline(ctx: CanvasRenderingContext2D, color: StoneColor) {
  const y = baselineFor(color);
  const band = ctx.createLinearGradient(0, y - 34, 0, y + 34);
  band.addColorStop(0, 'rgba(255, 199, 92, 0)');
  band.addColorStop(0.5, 'rgba(255, 199, 92, 0.15)');
  band.addColorStop(1, 'rgba(255, 199, 92, 0)');
  roundRect(ctx, 130, y - 34, 740, 68, 34);
  ctx.fillStyle = band;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 214, 90, 0.14)';
  ctx.stroke();
}

/* ---------- pre-rendered piece sprites ----------
 * Stones, striker, shadow and glow are painted once per pixel density and then
 * blitted with drawImage, so a moving shot costs a handful of image draws per
 * frame instead of dozens of gradients. That is what keeps 60 fps on phones.
 */

type CachedSprite = { canvas: HTMLCanvasElement; size: number };

type SpriteSet = {
  dpr: number;
  white: CachedSprite;
  black: CachedSprite;
  striker: CachedSprite;
  shadow: CachedSprite;
  glow: CachedSprite;
};

let spriteCache: SpriteSet | null = null;

function makeSprite(size: number, dpr: number, paint: (ctx: CanvasRenderingContext2D, r: number) => void): CachedSprite {
  const px = Math.max(1, Math.ceil(size * dpr));
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
    ctx.translate(size / 2, size / 2);
    paint(ctx, size / 2);
  }
  return { canvas, size };
}

function sprites(dpr: number): SpriteSet {
  if (spriteCache && spriteCache.dpr === dpr) return spriteCache;
  spriteCache = {
    dpr,
    white: makeSprite((STONE_RADIUS + 3) * 2, dpr, (ctx, r) => paintStone(ctx, r, 'white')),
    black: makeSprite((STONE_RADIUS + 3) * 2, dpr, (ctx, r) => paintStone(ctx, r, 'black')),
    striker: makeSprite((STRIKER_RADIUS + 3) * 2, dpr, (ctx, r) => paintStriker(ctx, r)),
    shadow: makeSprite(STONE_RADIUS * 3.4, dpr, (ctx, r) => paintShadow(ctx, r)),
    glow: makeSprite(STRIKER_RADIUS * 4, dpr, (ctx, r) => paintGlow(ctx, r)),
  };
  return spriteCache;
}

function paintShadow(ctx: CanvasRenderingContext2D, r: number) {
  const gradient = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
  gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0.34)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.95, r * 0.56, 0, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
}

function paintGlow(ctx: CanvasRenderingContext2D, r: number) {
  const gradient = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
  gradient.addColorStop(0, 'rgba(255, 214, 90, 0.55)');
  gradient.addColorStop(0.6, 'rgba(255, 199, 92, 0.16)');
  gradient.addColorStop(1, 'rgba(255, 199, 92, 0)');
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
}

function paintStone(ctx: CanvasRenderingContext2D, r: number, color: StoneColor) {
  const body = ctx.createRadialGradient(-r * 0.36, -r * 0.4, r * 0.08, r * 0.08, r * 0.18, r * 1.08);
  if (color === 'white') {
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.32, '#fbfaff');
    body.addColorStop(0.66, '#e6e5f0');
    body.addColorStop(0.88, '#c3c2d4');
    body.addColorStop(1, '#9a9aad');
  } else {
    body.addColorStop(0, '#5c5c6c');
    body.addColorStop(0.34, '#3a3a46');
    body.addColorStop(0.66, '#1d1d26');
    body.addColorStop(0.88, '#0c0c12');
    body.addColorStop(1, '#030305');
  }
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();

  // Reflected rim light on the lower edge, shaded edge on the upper one.
  ctx.beginPath();
  ctx.arc(0, 0, r - 1.2, Math.PI * 0.12, Math.PI * 0.82);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = color === 'white' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(196, 198, 225, 0.45)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r - 1.2, Math.PI * 1.08, Math.PI * 1.8);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color === 'white' ? 'rgba(90, 90, 120, 0.4)' : 'rgba(0, 0, 0, 0.6)';
  ctx.stroke();

  // Gloss, plus the warm bounce light real polished stones pick up from the felt.
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
  ctx.clip();
  const gloss = ctx.createRadialGradient(-r * 0.34, -r * 0.4, 0, -r * 0.34, -r * 0.4, r * 0.68);
  gloss.addColorStop(0, color === 'white' ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.55)');
  gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.36, r * 0.55, r * 0.38, -0.55, 0, Math.PI * 2);
  ctx.fillStyle = gloss;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-r * 0.42, -r * 0.48, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = color === 'white' ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.55)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(r * 0.15, r * 0.55, r * 0.45, r * 0.22, 0.2, 0, Math.PI * 2);
  ctx.fillStyle = color === 'white' ? 'rgba(255, 226, 170, 0.22)' : 'rgba(120, 145, 200, 0.18)';
  ctx.fill();
  ctx.restore();

  // Beveled edge: lit from the top-left, dark at the bottom-right.
  const bevel = ctx.createLinearGradient(-r, -r, r, r);
  bevel.addColorStop(0, color === 'white' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(200, 200, 225, 0.45)');
  bevel.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  bevel.addColorStop(1, color === 'white' ? 'rgba(70, 70, 100, 0.5)' : 'rgba(0, 0, 0, 0.8)');
  ctx.beginPath();
  ctx.arc(0, 0, r - 1.5, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = bevel;
  ctx.stroke();
}

function paintStriker(ctx: CanvasRenderingContext2D, r: number) {
  const body = ctx.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.05, r * 0.1, r * 0.2, r * 1.1);
  body.addColorStop(0, '#fffdf2');
  body.addColorStop(0.28, '#ffe9a8');
  body.addColorStop(0.55, '#f2bb3c');
  body.addColorStop(0.8, '#b27c18');
  body.addColorStop(1, '#6b4708');
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255, 246, 207, 0.85)';
  ctx.stroke();

  // Engraved rings.
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.68, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(105, 63, 6, 0.6)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 246, 207, 0.35)';
  ctx.stroke();

  // Polished inlay.
  const inlay = ctx.createRadialGradient(-r * 0.15, -r * 0.2, r * 0.04, 0, 0, r * 0.42);
  inlay.addColorStop(0, '#a3263a');
  inlay.addColorStop(0.7, '#5c0d1c');
  inlay.addColorStop(1, '#2c040b');
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = inlay;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
  ctx.clip();
  const gloss = ctx.createRadialGradient(-r * 0.38, -r * 0.42, 0, -r * 0.38, -r * 0.42, r * 0.7);
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.34, r * 0.56, r * 0.34, -0.55, 0, Math.PI * 2);
  ctx.fillStyle = gloss;
  ctx.fill();
  ctx.restore();
}

/** Blit a pre-rendered piece with a soft shadow that drifts as it speeds up. */
function drawPiece(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  cache: SpriteSet,
  piece: CachedSprite,
  radius: number
) {
  const lift = Math.min(1, sprite.speed / 2200);
  const shadowWidth = radius * 3.4 * (1 + lift * 0.18);
  const shadowHeight = shadowWidth * 0.62;
  ctx.save();
  ctx.globalAlpha = sprite.alpha * (0.92 - lift * 0.32);
  ctx.drawImage(
    cache.shadow.canvas,
    sprite.x - shadowWidth / 2 + 2 + lift * 7,
    sprite.y - shadowHeight / 2 + 4 + lift * 9,
    shadowWidth,
    shadowHeight
  );
  ctx.globalAlpha = sprite.alpha;
  const size = piece.size * sprite.scale;
  ctx.drawImage(piece.canvas, sprite.x - size / 2, sprite.y - size / 2, size, size);
  ctx.restore();
}

function drawStone(ctx: CanvasRenderingContext2D, sprite: Sprite, dpr: number) {
  const r = STONE_RADIUS * sprite.scale;
  if (sprite.alpha <= 0.02 || r < 1) return;
  const cache = sprites(dpr);
  drawPiece(ctx, sprite, cache, sprite.color === 'black' ? cache.black : cache.white, STONE_RADIUS);
}

function drawStriker(ctx: CanvasRenderingContext2D, sprite: Sprite, live: boolean, dpr: number) {
  const r = STRIKER_RADIUS * sprite.scale;
  if (sprite.alpha <= 0.02 || r < 1) return;
  const cache = sprites(dpr);
  if (live) {
    const glowSize = STRIKER_RADIUS * 4 * sprite.scale;
    ctx.save();
    ctx.globalAlpha = 0.75 + Math.sin(performance.now() / 420) * 0.15;
    ctx.drawImage(cache.glow.canvas, sprite.x - glowSize / 2, sprite.y - glowSize / 2, glowSize, glowSize);
    ctx.restore();
  }
  drawPiece(ctx, sprite, cache, cache.striker, STRIKER_RADIUS);
}

/** Expanding ring left behind when a stone drops into a pocket. */
function drawPocketFx(ctx: CanvasRenderingContext2D, fx: DropFx, now: number) {
  const k = clamp01((now - fx.at) / DROP_FX_MS);
  const radius = POCKET_RADIUS * (0.5 + k * 1.15);
  ctx.save();
  ctx.globalAlpha = 1 - k;
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2);
  ctx.lineWidth = 3 + 4 * (1 - k);
  ctx.strokeStyle = 'rgba(255, 214, 90, 0.85)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(fx.x, fx.y, radius * 0.7, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 246, 207, 0.5)';
  ctx.stroke();
  ctx.restore();
}

function drawAim(
  ctx: CanvasRenderingContext2D,
  striker: Sprite,
  aim: { x: number; y: number },
  now: number
) {
  const dx = aim.x - striker.x;
  const dy = aim.y - striker.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 18) return;
  const angle = Math.atan2(dy, dx);
  const power = Math.max(0.12, Math.min(1, distance / AIM_MAX_DISTANCE));
  const length = Math.min(distance, AIM_MAX_DISTANCE) + power * 140;
  const tipX = striker.x + Math.cos(angle) * length;
  const tipY = striker.y + Math.sin(angle) * length;

  ctx.save();
  // Soft guide beam.
  const beam = ctx.createLinearGradient(striker.x, striker.y, tipX, tipY);
  beam.addColorStop(0, `rgba(255, 214, 90, ${0.14 + power * 0.3})`);
  beam.addColorStop(1, `rgba(255, 236, 170, ${0.04 + power * 0.32})`);
  ctx.lineCap = 'round';
  ctx.lineWidth = 16;
  ctx.strokeStyle = beam;
  ctx.beginPath();
  ctx.moveTo(striker.x, striker.y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // Marching dashed centre line.
  ctx.setLineDash([18, 14]);
  ctx.lineDashOffset = -(now / 26) % 32;
  ctx.lineWidth = 5;
  ctx.strokeStyle = `rgba(255, 226, 150, ${0.5 + power * 0.45})`;
  ctx.beginPath();
  ctx.moveTo(striker.x, striker.y);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrow head.
  ctx.translate(tipX, tipY);
  ctx.rotate(angle);
  ctx.fillStyle = `rgba(255, 236, 176, ${0.65 + power * 0.35})`;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(-10, 13);
  ctx.lineTo(-10, -13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Power ring around the striker.
  ctx.save();
  ctx.translate(striker.x, striker.y);
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.arc(0, 0, STRIKER_RADIUS + 9, 0, Math.PI * 2);
  ctx.stroke();
  const ring = ctx.createLinearGradient(-STRIKER_RADIUS, 0, STRIKER_RADIUS, 0);
  ring.addColorStop(0, '#ffe9a8');
  ring.addColorStop(0.6, '#ffc75c');
  ring.addColorStop(1, '#ff5f5f');
  ctx.strokeStyle = ring;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, STRIKER_RADIUS + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * power);
  ctx.stroke();
  ctx.restore();
}
