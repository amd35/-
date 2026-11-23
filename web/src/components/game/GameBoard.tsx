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

    // Wooden board with a gold frame and a soft centre light.
    const wood = ctx.createLinearGradient(0, 0, BOARD_SIZE, BOARD_SIZE);
    wood.addColorStop(0, '#2a1608');
    wood.addColorStop(0.5, '#140a04');
    wood.addColorStop(1, '#26120a');
    roundRect(ctx, 14, 14, BOARD_SIZE - 28, BOARD_SIZE - 28, 64);
    ctx.fillStyle = wood;
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(255, 199, 92, 0.55)';
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 231, 179, 0.22)';
    roundRect(ctx, 34, 34, BOARD_SIZE - 68, BOARD_SIZE - 68, 50);
    ctx.stroke();
    const glow = ctx.createRadialGradient(500, 500, 40, 500, 500, 430);
    glow.addColorStop(0, 'rgba(255, 199, 92, 0.12)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
    ctx.strokeStyle = 'rgba(255, 199, 92, 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(500, 500, 210, 0, Math.PI * 2);
    ctx.stroke();

    for (const pocket of POCKETS) {
      const shade = ctx.createRadialGradient(pocket.x, pocket.y, 4, pocket.x, pocket.y, POCKET_RADIUS);
      shade.addColorStop(0, '#000000');
      shade.addColorStop(0.75, '#0a0503');
      shade.addColorStop(1, 'rgba(255, 199, 92, 0.25)');
      ctx.beginPath();
      ctx.arc(pocket.x, pocket.y, POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = shade;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 199, 92, 0.45)';
      ctx.stroke();
    }

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

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  ctx.ellipse(x + 3, y + radius * 0.55, radius * 0.95, radius * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fill();
}

function drawStone(ctx: CanvasRenderingContext2D, x: number, y: number, color: StoneColor) {
  shadow(ctx, x, y, STONE_RADIUS);
  const gradient = ctx.createRadialGradient(
    x - STONE_RADIUS * 0.35,
    y - STONE_RADIUS * 0.4,
    STONE_RADIUS * 0.2,
    x,
    y,
    STONE_RADIUS
  );
  if (color === 'white') {
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.55, '#efeef6');
    gradient.addColorStop(1, '#b9b9c8');
  } else {
    gradient.addColorStop(0, '#6a6a78');
    gradient.addColorStop(0.55, '#2a2a34');
    gradient.addColorStop(1, '#050508');
  }
  ctx.beginPath();
  ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color === 'white' ? 'rgba(80, 80, 100, 0.35)' : 'rgba(255, 255, 255, 0.12)';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x - STONE_RADIUS * 0.3, y - STONE_RADIUS * 0.38, STONE_RADIUS * 0.34, STONE_RADIUS * 0.22, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = color === 'white' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.28)';
  ctx.fill();
}

function drawStriker(ctx: CanvasRenderingContext2D, x: number, y: number) {
  shadow(ctx, x, y, STRIKER_RADIUS);
  const gradient = ctx.createRadialGradient(
    x - STRIKER_RADIUS * 0.35,
    y - STRIKER_RADIUS * 0.4,
    STRIKER_RADIUS * 0.2,
    x,
    y,
    STRIKER_RADIUS
  );
  gradient.addColorStop(0, '#fff6cf');
  gradient.addColorStop(0.55, '#ffd24a');
  gradient.addColorStop(1, '#a86a12');
  ctx.beginPath();
  ctx.arc(x, y, STRIKER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 246, 207, 0.7)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, STRIKER_RADIUS * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(70, 34, 2, 0.55)';
  ctx.fill();
}
