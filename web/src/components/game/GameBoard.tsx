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
}

interface Props {
  state: MatchState;
  myColor: StoneColor | null;
  disabled: boolean;
  animation: BoardAnimation | null;
  onAnimationEnd: () => void;
  onShoot: (shot: { x: number; angle: number; power: number }) => void;
}

/** Canvas board: real-time frames from the server, drag-to-shoot on the striker. */
export function GameBoard({ state, myColor, disabled, animation, onAnimationEnd, onShoot }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(340);
  const [frame, setFrame] = useState<number | null>(null);
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => {
      setSize(Math.max(240, Math.floor(wrap.clientWidth)));
    });
    observer.observe(wrap);
    setSize(Math.max(240, Math.floor(wrap.clientWidth)));
    return () => observer.disconnect();
  }, []);

  // Animate the server frames at their native pace (one frame per ~50 ms).
  useEffect(() => {
    if (!animation) {
      setFrame(null);
      return;
    }
    let index = 0;
    let last = performance.now();
    let raf = 0;
    setFrame(0);
    const tick = (now: number) => {
      if (now - last >= 50) {
        last = now;
        index += 1;
        if (index >= animation.frames.length) {
          setFrame(null);
          onAnimationEnd();
          return;
        }
        setFrame(index);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animation, onAnimationEnd]);

  const myTurn = Boolean(myColor) && state.turn === myColor && !disabled && !animation;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(size * dpr);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    const scale = px / BOARD_SIZE;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    drawTable(ctx);

    let striker = state.striker;
    let stones = state.stones;
    if (animation && frame !== null) {
      const row = animation.frames[Math.min(frame, animation.frames.length - 1)];
      striker = { x: row[0], y: row[1] };
      stones = animation.stones.map((stone, index) => ({
        ...stone,
        x: row[2 + index * 2],
        y: row[3 + index * 2],
      }));
    }

    for (const stone of stones) {
      if (stone.x < -100) continue;
      drawStone(ctx, stone.x, stone.y, stone.color);
    }

    if (striker.x > -100) {
      const mine = state.turn === myColor;
      ctx.save();
      if (mine) {
        ctx.shadowColor = 'rgba(255, 214, 90, 0.75)';
        ctx.shadowBlur = 26;
      }
      drawStriker(ctx, striker.x, striker.y);
      ctx.restore();
    }

    // Aim line while dragging.
    if (aim && myTurn) {
      const strikerPoint = state.striker;
      const dx = aim.x - strikerPoint.x;
      const dy = aim.y - strikerPoint.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 18) {
        const angle = Math.atan2(dy, dx);
        const power = Math.max(0.12, Math.min(1, distance / 360));
        const length = Math.min(distance, 360) + power * 120;
        ctx.save();
        ctx.setLineDash([16, 14]);
        ctx.lineWidth = 7;
        ctx.strokeStyle = `rgba(255, 214, 90, ${0.35 + power * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(strikerPoint.x, strikerPoint.y);
        ctx.lineTo(strikerPoint.x + Math.cos(angle) * length, strikerPoint.y + Math.sin(angle) * length);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255, 214, 90, 0.9)';
        ctx.beginPath();
        ctx.arc(
          strikerPoint.x + Math.cos(angle) * length,
          strikerPoint.y + Math.sin(angle) * length,
          12,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.restore();
      }
    }

    // Own baseline marker.
    if (myColor) {
      ctx.fillStyle = 'rgba(255, 199, 92, 0.16)';
      roundRect(ctx, 130, baselineFor(myColor) - 34, 740, 68, 34);
      ctx.fill();
    }
  }, [state, animation, frame, aim, myTurn, myColor, size]);

  const toBoard = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * BOARD_SIZE,
        y: ((clientY - rect.top) / rect.height) * BOARD_SIZE,
      };
    },
    []
  );

  const release = () => {
    if (!aim || !myTurn) {
      setAim(null);
      return;
    }
    const striker = state.striker;
    const dx = aim.x - striker.x;
    const dy = aim.y - striker.y;
    const distance = Math.hypot(dx, dy);
    setAim(null);
    if (distance < 18) return;
    onShoot({
      x: striker.x,
      angle: Math.atan2(dy, dx),
      power: Math.max(0.12, Math.min(1, distance / 360)),
    });
  };

  return (
    <div className="game-board-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={`game-board ${myTurn ? 'is-live' : ''}`}
        style={{ width: size, height: size }}
        onPointerDown={(event) => {
          if (!myTurn) return;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Older engines reject capture for a synthetic pointer; aiming still works.
          }
          setAim(toBoard(event.clientX, event.clientY));
        }}
        onPointerMove={(event) => {
          if (!aim || !myTurn) return;
          setAim(toBoard(event.clientX, event.clientY));
        }}
        onPointerUp={release}
        onPointerCancel={() => setAim(null)}
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
    for (let i = 0; i < 1400; i += 1) {
      const light = Math.random() > 0.45;
      c.fillStyle = light
        ? `rgba(190, 205, 230, ${Math.random() * 0.05})`
        : `rgba(0, 0, 0, ${Math.random() * 0.09})`;
      c.fillRect(Math.random() * 96, Math.random() * 96, 1, 1);
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

/** Gold-framed walnut table with a velvet playfield and brass pockets. */
function drawTable(ctx: CanvasRenderingContext2D) {
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

  roundRect(ctx, 26, 26, BOARD_SIZE - 52, BOARD_SIZE - 52, 66);
  ctx.fillStyle = ctx.createPattern(woodTexture(), 'repeat') ?? '#1d0f06';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.stroke();

  ctx.save();
  roundRect(ctx, 54, 54, BOARD_SIZE - 108, BOARD_SIZE - 108, 52);
  ctx.fillStyle = ctx.createPattern(feltTexture(), 'repeat') ?? '#0a0d12';
  ctx.fill();
  ctx.clip();

  const light = ctx.createRadialGradient(500, 460, 60, 500, 500, 520);
  light.addColorStop(0, 'rgba(125, 155, 205, 0.1)');
  light.addColorStop(0.62, 'rgba(0, 0, 0, 0.14)');
  light.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 214, 90, 0.32)';
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

    ctx.beginPath();
    ctx.arc(pocket.x, pocket.y, POCKET_RADIUS - 1.5, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 231, 179, 0.18)';
    ctx.stroke();
  }
}

function softShadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const gradient = ctx.createRadialGradient(
    x + radius * 0.1,
    y + radius * 0.4,
    radius * 0.1,
    x + radius * 0.1,
    y + radius * 0.4,
    radius * 1.15
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  gradient.addColorStop(0.55, 'rgba(0, 0, 0, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.beginPath();
  ctx.ellipse(x + radius * 0.1, y + radius * 0.45, radius * 1.02, radius * 0.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
}

function drawStone(ctx: CanvasRenderingContext2D, x: number, y: number, color: StoneColor) {
  const r = STONE_RADIUS;
  softShadow(ctx, x, y, r);

  const body = ctx.createRadialGradient(
    x - r * 0.36,
    y - r * 0.4,
    r * 0.08,
    x + r * 0.08,
    y + r * 0.18,
    r * 1.08
  );
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
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();

  // Reflected rim light on the lower edge, shaded edge on the upper one.
  ctx.beginPath();
  ctx.arc(x, y, r - 1.2, Math.PI * 0.12, Math.PI * 0.82);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = color === 'white' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(196, 198, 225, 0.45)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r - 1.2, Math.PI * 1.08, Math.PI * 1.8);
  ctx.lineWidth = 2;
  ctx.strokeStyle = color === 'white' ? 'rgba(90, 90, 120, 0.4)' : 'rgba(0, 0, 0, 0.6)';
  ctx.stroke();

  // Gloss, plus the warm bounce light real polished stones pick up from the felt.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r - 1, 0, Math.PI * 2);
  ctx.clip();
  const gloss = ctx.createRadialGradient(x - r * 0.34, y - r * 0.4, 0, x - r * 0.34, y - r * 0.4, r * 0.68);
  gloss.addColorStop(0, color === 'white' ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.55)');
  gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.36, r * 0.55, r * 0.38, -0.55, 0, Math.PI * 2);
  ctx.fillStyle = gloss;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.42, y - r * 0.48, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = color === 'white' ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.55)';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + r * 0.15, y + r * 0.55, r * 0.45, r * 0.22, 0.2, 0, Math.PI * 2);
  ctx.fillStyle = color === 'white' ? 'rgba(255, 226, 170, 0.22)' : 'rgba(120, 145, 200, 0.18)';
  ctx.fill();
  ctx.restore();

  // Beveled edge: lit from the top-left, dark at the bottom-right.
  const bevel = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  bevel.addColorStop(0, color === 'white' ? 'rgba(255, 255, 255, 0.9)' : 'rgba(200, 200, 225, 0.45)');
  bevel.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  bevel.addColorStop(1, color === 'white' ? 'rgba(70, 70, 100, 0.5)' : 'rgba(0, 0, 0, 0.8)');
  ctx.beginPath();
  ctx.arc(x, y, r - 1.5, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = bevel;
  ctx.stroke();
}

function drawStriker(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const r = STRIKER_RADIUS;
  softShadow(ctx, x, y, r);

  const body = ctx.createRadialGradient(
    x - r * 0.4,
    y - r * 0.45,
    r * 0.05,
    x + r * 0.1,
    y + r * 0.2,
    r * 1.1
  );
  body.addColorStop(0, '#fffdf2');
  body.addColorStop(0.28, '#ffe9a8');
  body.addColorStop(0.55, '#f2bb3c');
  body.addColorStop(0.8, '#b27c18');
  body.addColorStop(1, '#6b4708');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255, 246, 207, 0.85)';
  ctx.stroke();

  // Engraved rings.
  ctx.beginPath();
  ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(105, 63, 6, 0.6)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 246, 207, 0.35)';
  ctx.stroke();

  // Polished inlay.
  const inlay = ctx.createRadialGradient(x - r * 0.15, y - r * 0.2, r * 0.04, x, y, r * 0.42);
  inlay.addColorStop(0, '#a3263a');
  inlay.addColorStop(0.7, '#5c0d1c');
  inlay.addColorStop(1, '#2c040b');
  ctx.beginPath();
  ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = inlay;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r - 1, 0, Math.PI * 2);
  ctx.clip();
  const gloss = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, 0, x - r * 0.38, y - r * 0.42, r * 0.7);
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
  gloss.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.34, r * 0.56, r * 0.34, -0.55, 0, Math.PI * 2);
  ctx.fillStyle = gloss;
  ctx.fill();
  ctx.restore();
}
