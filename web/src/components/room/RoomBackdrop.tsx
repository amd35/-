import { useId } from 'react';

/**
 * Animated stage behind a voice room. Pure CSS/SVG so it costs no image or
 * video download unless the room owner picked an uploaded background; the
 * `design` value is the room's `background` setting.
 */
export const ROOM_BACKGROUNDS = [
  { id: 'fire', label: 'نيران حمراء' },
  { id: 'eagle', label: 'النسر الأسود والأحمر' },
  { id: 'royal', label: 'ملكية ذهبية' },
  { id: 'seasonal', label: 'موسمية' },
] as const;

export function isRoomDesign(value: string): boolean {
  return ROOM_BACKGROUNDS.some((item) => item.id === value);
}

function mediaKind(url: string): 'video' | 'image' | null {
  if (!/^(https?:\/\/|\/uploads\/)/i.test(url)) return null;
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) return 'video';
  return 'image';
}

/** Fiery eagle wings used behind the stage and flanking the room wordmark. */
export function RoomWings({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg className={className} viewBox="0 0 400 150" preserveAspectRatio="xMidYMin meet" aria-hidden="true">

        <defs>
          <linearGradient id={`rb-wing-${uid}`} x1="0" y1="1" x2="0.5" y2="0">
            <stop offset="0%" stopColor="#1a0508" />
            <stop offset="45%" stopColor="#8c0f1f" />
            <stop offset="100%" stopColor="#ff6a1f" />
          </linearGradient>
          <linearGradient id={`rb-gold-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff4c2" />
            <stop offset="50%" stopColor="#ffcf40" />
            <stop offset="100%" stopColor="#8a5206" />
          </linearGradient>
        </defs>
        {[0, 1].map((side) => (
          <g key={side} transform={side ? 'translate(400 0) scale(-1 1)' : undefined} className="room-bg-wing">
            {[
              { x: 196, y: 120, rot: 208, len: 74, w: 13 },
              { x: 180, y: 128, rot: 224, len: 96, w: 15 },
              { x: 162, y: 134, rot: 240, len: 112, w: 16 },
              { x: 144, y: 138, rot: 256, len: 100, w: 14 },
              { x: 128, y: 142, rot: 272, len: 82, w: 12 },
            ].map((feather) => (
              <g key={feather.rot} transform={`translate(${feather.x} ${feather.y}) rotate(${feather.rot})`}>
                <path
                  d={`M0 0 C ${feather.w} ${-feather.len * 0.3} ${feather.w * 0.8} ${-feather.len * 0.72} ${feather.w * 0.1} ${-feather.len} C ${-feather.w * 0.5} ${-feather.len * 0.64} ${-feather.w * 0.6} ${-feather.len * 0.26} 0 0 Z`}
                  fill={`url(#rb-wing-${uid})`}
                  stroke="#ffcf40"
                  strokeWidth="0.9"
                  strokeOpacity="0.55"
                />
              </g>
            ))}
            <path
              d="M214 122 C 206 100 210 82 224 70 L232 92 C 222 100 218 110 220 124 Z"
              fill={`url(#rb-gold-${uid})`}
              stroke="rgba(0,0,0,0.5)"
              strokeWidth="0.8"
            />
          </g>
        ))}
        <path d="M198 18 L202 6 L206 18 L218 14 L210 24 L200 24 L190 24 L182 14 Z" fill={`url(#rb-gold-${uid})`} />
          </svg>
  );
}

export function RoomBackdrop({ background, effects = true }: { background: string; effects?: boolean }) {
  const media = mediaKind(background);
  const design = media ? 'fire' : isRoomDesign(background) ? background : 'fire';

  return (
    <div className={`room-bg room-bg-${design}${effects ? ' fx' : ''}`} aria-hidden="true">
      {media === 'video' ? (
        <video className="room-bg-media" src={background} autoPlay muted loop playsInline />
      ) : media === 'image' ? (
        <img className="room-bg-media" src={background} alt="" />
      ) : null}

      <span className="room-bg-fire" />
      <span className="room-bg-smoke" />

      <RoomWings className="room-bg-wings" />

      {effects ? (
        <span className="room-bg-embers">
          {Array.from({ length: 16 }).map((_, index) => (
            <i
              key={index}
              style={{
                left: `${4 + ((index * 37) % 92)}%`,
                animationDelay: `${(index % 8) * 0.55}s`,
                animationDuration: `${4.5 + (index % 5) * 0.7}s`,
              }}
            />
          ))}
        </span>
      ) : null}
      <span className="room-bg-vignette" />
    </div>
  );
}
