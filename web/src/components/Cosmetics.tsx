/**
 * Store cosmetics other than avatar frames: the numeric-ID badge, the name card,
 * the chat bubble skin and the room entry animation. Each one is drawn from its
 * `design` key, which the store previews and the real UI both render; an uploaded
 * PNG/GIF (`kind = 'image'`) is drawn from `imageUrl` instead.
 */
import type { CSSProperties } from 'react';
import { assetUrl } from '../lib/api';

export interface CosmeticInfo {
  id: string;
  design: string | null;
  kind: string;
  imageUrl: string | null;
  rarity: string;
}

export type CosmeticCategory = 'frame' | 'id' | 'namecard' | 'bubble' | 'entry';

const suffix = (design: string | null | undefined) => (design ? `-${design}` : '');

const isImage = (cosmetic: CosmeticInfo) => cosmetic.kind === 'image' && Boolean(cosmetic.imageUrl);

const imageStyle = (cosmetic: CosmeticInfo): CSSProperties | undefined => {
  const url = isImage(cosmetic) ? assetUrl(cosmetic.imageUrl) : undefined;
  return url ? { backgroundImage: `url(${url})` } : undefined;
};

/** Badge around the numeric account ID, worn on the profile. */
export function IdBadge({ cosmetic, value }: { cosmetic: CosmeticInfo; value: string }) {
  return (
    <span
      className={`idbadge idbadge${suffix(cosmetic.design)}${isImage(cosmetic) ? ' idbadge-image' : ''}`}
      style={imageStyle(cosmetic)}
    >
      <span className="idbadge-hash">#</span>
      <span className="idbadge-value" dir="ltr">
        {value}
      </span>
    </span>
  );
}

/** Card behind the display name with the user's avatar, worn on the profile. */
export function NameCard({
  cosmetic,
  name,
  avatarUrl,
}: {
  cosmetic: CosmeticInfo;
  name: string;
  avatarUrl?: string | null;
}) {
  return (
    <div
      className={`namecard namecard${suffix(cosmetic.design)}${isImage(cosmetic) ? ' namecard-image' : ''}`}
      style={imageStyle(cosmetic)}
    >
      {avatarUrl ? <img className="namecard-avatar" src={assetUrl(avatarUrl)} alt="" /> : null}
      <span className="namecard-name">{name}</span>
    </div>
  );
}

/** A chat bubble sample in the chosen skin (also applied to real messages). */
export function BubbleSample({ cosmetic, text }: { cosmetic: CosmeticInfo; text: string }) {
  return (
    <div className="msg msg-mine bubble-sample">
      <div
        className={`msg-bubble bubble${suffix(cosmetic.design)}${isImage(cosmetic) ? ' bubble-image' : ''}`}
        style={imageStyle(cosmetic)}
      >
        {text}
      </div>
    </div>
  );
}

/** Animated banner shown when the user enters a voice room. */
export function EntryBanner({ cosmetic, name }: { cosmetic: CosmeticInfo; name: string }) {
  return (
    <div className={`entry-banner entry-banner${suffix(cosmetic.design)}`}>
      <span className="entry-banner-glow" />
      <span className="entry-banner-text">{name}</span>
      <span className="entry-banner-spark">✦</span>
    </div>
  );
}

/** Store preview for a non-frame cosmetic. */
export function CosmeticPreview({
  cosmetic,
  category,
  sampleName,
  avatarUrl,
}: {
  cosmetic: CosmeticInfo;
  category: CosmeticCategory;
  sampleName: string;
  avatarUrl?: string | null;
}) {
  if (category === 'id') return <IdBadge cosmetic={cosmetic} value="12345678" />;
  if (category === 'namecard') return <NameCard cosmetic={cosmetic} name={sampleName} avatarUrl={avatarUrl} />;
  if (category === 'bubble') return <BubbleSample cosmetic={cosmetic} text="مرحباً 👋" />;
  if (category === 'entry') {
    return (
      <div className="entry-preview">
        <EntryBanner cosmetic={cosmetic} name={sampleName} />
      </div>
    );
  }
  return null;
}
