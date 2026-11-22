import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { assetUrl } from './api';
import { AvatarFrame, type FrameInfo } from '../components/AvatarFrame';

/* ------------------------------------------------------------------ icons */
/** Gift artwork used wherever the gift icon appears (shop, composer, room, pills). */
const GIFT_ICON_URL =
  'https://media.base44.com/images/public/6addb0a6b0689d303ed3a495/ba4c71cec_file_000000007c54821081a33f6e0657af7c.png';
/** Royal gold coin artwork used wherever coins / the balance icon appears. */
const COIN_ICON_URL = '/coin-gold.png';
/** Icons rendered from artwork instead of a stroke path. */
const IMAGE_ICONS: Record<string, string> = { gift: GIFT_ICON_URL, coins: COIN_ICON_URL };
const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 10.7 12 3.5l9 7.2V20a1 1 0 0 1-1 1h-5.2v-6.4H9.2V21H4a1 1 0 0 1-1-1z" />,
  chat: (
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4-.8L3 21l1.9-4.9A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
  ),
  phone: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  ),
  phoneOff: (
    <>
      <path d="M10.7 13.3a16 16 0 0 0 4.6 3l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-3.2-2.6" />
      <path d="M5.2 10.5A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9" />
      <path d="M2 2l20 20" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="6" width="13" height="12" rx="2.5" />
      <path d="M15 10.5 21.5 7v10L15 13.5z" />
    </>
  ),
  wallet: (
    <>
      <rect x="2.5" y="6" width="19" height="13" rx="3" />
      <path d="M2.5 10h19" />
      <circle cx="17" cy="14.5" r="1.4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.6" />
      <path d="M2.6 20.5a6.4 6.4 0 0 1 12.8 0" />
      <path d="M16 5.2a3.6 3.6 0 0 1 0 6.9M17.4 20.5a6.6 6.6 0 0 0-1.6-4.3" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5z" />
      <path d="M13.7 20.6a2 2 0 0 1-3.4 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20.5 20.5 16 16" />
    </>
  ),
  star: (
    <path d="m12 3.5 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1-5.4-3-5.4 3 1.1-6.1L3.2 9.9l6.1-.8z" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  mic: (
    <>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" />
    </>
  ),
  micOff: (
    <>
      <path d="M15 9.5V5.5a3 3 0 0 0-5.6-1.5" />
      <path d="M9 8.5v4a3 3 0 0 0 4.6 2.5" />
      <path d="M5.5 11a6.5 6.5 0 0 0 10 5.5M18.5 11v1.2M12 17.5V21M9 21h6" />
      <path d="M3 3l18 18" />
    </>
  ),
  volume: (
    <>
      <path d="M11 5 6.5 8.8H3v6.4h3.5L11 19z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M11 5 6.5 8.8H3v6.4h3.5L11 19z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  camera: (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="M15.5 10.5 21.5 7v10l-6-3.5z" />
    </>
  ),
  cameraOff: (
    <>
      <path d="M15.5 9.4V8.5A2.5 2.5 0 0 0 13 6H6.8" />
      <path d="M2.5 8.5v7A2.5 2.5 0 0 0 5 18h8a2.5 2.5 0 0 0 2.2-1.3" />
      <path d="M15.5 10.5 21.5 7v10l-4-2.3" />
      <path d="M3 3l18 18" />
    </>
  ),
  switchCam: (
    <>
      <path d="M20 11a8 8 0 0 0-13.7-5.6L3 8" />
      <path d="M4 13a8 8 0 0 0 13.7 5.6L21 16" />
      <path d="M3 3v5h5M21 21v-5h-5" />
    </>
  ),
  arrowLeft: <path d="M19 12H5M11 18l-6-6 6-6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  shield: <path d="M12 21.5s8-3.7 8-9.7V5.4L12 2.5 4 5.4v6.4c0 6 8 9.7 8 9.7z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5.5A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3H9" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  trash: (
    <>
      <path d="M3.5 6.5h17M9 6.5V4h6v2.5M6 6.5 7 20a1.5 1.5 0 0 0 1.5 1.4h7A1.5 1.5 0 0 0 17 20l1-13.5" />
    </>
  ),
  check: <path d="M20 6.5 9.5 17 4 11.5" />,
  checkCheck: (
    <>
      <path d="M1.5 12.5 6 17l9.5-9.5" />
      <path d="M11 16.5 12.5 18 22 8.5" />
    </>
  ),
  x: <path d="M18 6 6 18M6 6l12 12" />,
  send: (
    <>
      <path d="M21.5 2.5 10.8 13.2" />
      <path d="M21.5 2.5 14.8 21.5l-4-8.3-8.3-4z" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m4 17 5-5 4 4 3-2.5 4 3.5" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="8.5" width="18" height="12.5" rx="2" />
      <path d="M3 12.5h18M12 8.5V21" />
      <path d="M8.5 8.5a2.5 2.5 0 1 1 3.5-3.5A2.5 2.5 0 1 1 15.5 8.5" />
    </>
  ),
  chart: (
    <>
      <path d="M3.5 3.5v17h17" />
      <path d="M7.5 16.5v-4M12 16.5V8M16.5 16.5v-6.5" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.5 4.5v6h-6" />
      <path d="M3.5 19.5v-6h6" />
      <path d="M19.4 14a7.5 7.5 0 0 1-12.7 3.4L3.5 14M4.6 10a7.5 7.5 0 0 1 12.7-3.4L20.5 10" />
    </>
  ),
  heart: (
    <path d="M12 20.5s-8-4.7-8-10.2A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8 3.3c0 5.5-8 10.2-8 10.2z" />
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  phoneIn: (
    <>
      <path d="M15 3h6v6M21 3l-7 7" />
      <path d="M21 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
    </>
  ),
  phoneOut: (
    <>
      <path d="M21 3h-6v6M15 3l7 7" />
      <path d="M21 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
      <path d="M15.5 5.5v-1a2 2 0 0 0-2-2h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h1" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2.5 20h19z" />
      <path d="M12 9v5M12 17.2v.3" />
    </>
  ),
  percent: (
    <>
      <path d="M19 5 5 19" />
      <circle cx="7.5" cy="7.5" r="2.5" />
      <circle cx="16.5" cy="16.5" r="2.5" />
    </>
  ),
  package: (
    <>
      <path d="M21 8.5v7L12 21l-9-5.5v-7L12 3z" />
      <path d="M3 8.5 12 14l9-5.5M12 14v7" />
    </>
  ),
  card: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M2.5 9.5h19" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  sparkle: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />,
  play: <path d="M8 5.5v13l11-6.5z" />,
};

export function Icon({
  name,
  size = 22,
  className,
  style,
  fill = 'none',
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  fill?: string;
}) {
  const artwork = IMAGE_ICONS[name];
  if (artwork) {
    return (
      <img
        src={artwork}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        className={className}
        style={{ objectFit: 'contain', flex: '0 0 auto', ...style }}
      />
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {ICONS[name] ?? ICONS.sparkle}
    </svg>
  );
}

/* ------------------------------------------------------------------ toasts */
type ToastKind = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastContext = createContext<{ push: (message: string, kind?: ToastKind) => void } | null>(
  null
);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    counter.current += 1;
    const id = counter.current;
    setItems((current) => [...current.slice(-2), { id, message, kind }]);
    setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  // Stable identity: consumers (the realtime socket) must not reconnect on every toast.
  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-wrap">
        {items.map((item) => (
          <div key={item.id} className={`toast ${item.kind}`}>
            <Icon
              name={item.kind === 'error' ? 'alert' : item.kind === 'success' ? 'check' : 'bell'}
              size={17}
            />
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

/* ------------------------------------------------------------------ avatar */
const GRADIENTS = [
  'linear-gradient(135deg,#d63384,#7c3aed)',
  'linear-gradient(135deg,#8b5cf6,#4f46e5)',
  'linear-gradient(135deg,#e0399a,#f59e0b)',
  'linear-gradient(135deg,#4f46e5,#06b6d4)',
  'linear-gradient(135deg,#f43f5e,#8b5cf6)',
  'linear-gradient(135deg,#10b981,#4f46e5)',
];

export function Avatar({
  user,
  size = 46,
  className = '',
}: {
  user: {
    displayName?: string | null;
    avatarUrl?: string | null;
    online?: boolean;
    frame?: FrameInfo | null;
  } | null;
  size?: number;
  className?: string;
}) {
  const name = user?.displayName || '?';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const hash = [...name].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const gradient = GRADIENTS[hash % GRADIENTS.length];
  const avatar = (
    <div
      className={`avatar ${className}`}
      style={{ width: size, height: size, background: user?.avatarUrl ? undefined : gradient, fontSize: size * 0.38 }}
    >
      {user?.avatarUrl ? <img src={assetUrl(user.avatarUrl)} alt={name} /> : initial}
      {user?.online ? <span className="online-dot" /> : null}
    </div>
  );
  if (!user?.frame) return avatar;
  return (
    <div className="avatar-wrap" style={{ width: size, height: size }}>
      {avatar}
      <AvatarFrame frame={user.frame} />
    </div>
  );
}

/* ------------------------------------------------------------------ sheet */
export function Sheet({
  open,
  onClose,
  title,
  children,
  center = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  center?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  // Rendered at the document root: `.app-shell` has a backdrop-filter/transform, which
  // would otherwise anchor this fixed overlay to the whole (possibly very tall) page
  // instead of the viewport, pushing the sheet off-screen on long pages.
  return createPortal(
    <div className={`overlay ${center ? 'center' : ''}`} onClick={onClose}>
      <div className={center ? 'dialog' : 'sheet'} onClick={(event) => event.stopPropagation()}>
        {title ? (
          <div className="sheet-head">
            <h3>{title}</h3>
            <button className="icon-btn plain" onClick={onClose} aria-label="close">
              <Icon name="x" size={19} />
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ misc */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="center-col">
      <div className="spinner" />
      {label ? <span className="tiny muted">{label}</span> : null}
    </div>
  );
}

export function EmptyState({
  icon = 'sparkle',
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="icon-wrap">
        <Icon name={icon} size={26} />
      </div>
      <strong style={{ color: 'var(--text)' }}>{title}</strong>
      {hint ? <span className="tiny">{hint}</span> : null}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ format */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function formatCoins(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value || 0));
}

export function formatTimeAgo(value: string | Date | null | undefined, lang: 'ar' | 'en'): string {
  if (!value) return '';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  if (minutes < 1) return lang === 'ar' ? 'الآن' : 'now';
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 7) return rtf.format(-days, 'day');
  return date.toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-GB', {
    day: '2-digit',
    month: 'short',
  });
}

export function formatClock(value: string | Date | null | undefined): string {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function formatCountdown(ms: number, lang: 'ar' | 'en'): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (lang === 'ar') {
    if (hours > 0) return `${hours} س ${minutes} د`;
    if (minutes > 0) return `${minutes} د ${seconds} ث`;
    return `${seconds} ث`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function useCountdown(target: string | null | undefined): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!target) return 0;
  return Math.max(0, new Date(target).getTime() - now);
}

export function useDebounced<T>(value: T, delay = 320): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: unknown[]
): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loader()
      .then((result) => {
        if (alive) {
          setData(result);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return useMemo(
    () => ({ data, loading, error, reload: () => setNonce((value) => value + 1) }),
    [data, loading, error]
  );
}
