import { useEffect } from 'react';
import { assetUrl } from '../lib/api';
import { Icon } from '../lib/ui';

export interface LuxuryItem {
  key: string;
  kind: 'message' | 'system';
  title: string;
  body: string;
  avatarUrl?: string | null;
  route?: string;
}

/**
 * The in-app luxury card: gold-framed glass, app crest and the sender's avatar.
 * Friend messages wear a pink/neon accent; system notices wear royal gold.
 */
export function LuxuryNotification({
  item,
  onOpen,
  onClose,
}: {
  item: LuxuryItem;
  onOpen: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5600);
    return () => clearTimeout(timer);
  }, [onClose, item.key]);

  const avatar = assetUrl(item.avatarUrl ?? undefined);

  return (
    <button type="button" className={`lux-note ${item.kind}`} onClick={onOpen} aria-live="polite">
      <span className="lux-note-sheen" aria-hidden="true" />
      <span className="lux-note-head">
        <img className="lux-note-logo" src="/favicon.png" alt="" />
        <span className="lux-note-brand">يلا فون</span>
        <span className="lux-note-now">الآن</span>
        <span
          className="lux-note-close"
          role="button"
          aria-label="close"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          ×
        </span>
      </span>
      <span className="lux-note-body">
        {item.kind === 'message' && avatar ? (
          <img className="lux-note-avatar" src={avatar} alt="" />
        ) : (
          <span className="lux-note-seal">
            {item.kind === 'system' ? (
              <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3 8l4.2 3.2L12 5l4.8 6.2L21 8l-1.7 9.4a1.6 1.6 0 0 1-1.6 1.3H6.3a1.6 1.6 0 0 1-1.6-1.3z" />
              </svg>
            ) : (
              <Icon name="chat" size={20} />
            )}
          </span>
        )}
        <span className="lux-note-copy">
          <span className="lux-note-title">{item.title}</span>
          <span className="lux-note-text">{item.body}</span>
        </span>
      </span>
      <span className="lux-note-progress" aria-hidden="true" />
    </button>
  );
}
