/**
 * Store cosmetics other than avatar frames: the numeric-ID badge, the name card,
 * the chat bubble skin and the room entry animation. Each one is drawn from its
 * `design` key, which the store previews and the real UI both render.
 */
export interface CosmeticInfo {
  id: string;
  design: string | null;
  kind: string;
  imageUrl: string | null;
  rarity: string;
}

export type CosmeticCategory = 'frame' | 'id' | 'namecard' | 'bubble' | 'entry';

const suffix = (design: string | null | undefined) => (design ? `-${design}` : '');

/** Badge around the numeric account ID, worn on the profile. */
export function IdBadge({ cosmetic, value }: { cosmetic: CosmeticInfo; value: string }) {
  return (
    <span className={`idbadge idbadge${suffix(cosmetic.design)}`}>
      <span className="idbadge-hash">#</span>
      <span className="idbadge-value" dir="ltr">
        {value}
      </span>
    </span>
  );
}

/** Card behind the display name, worn on the profile. */
export function NameCard({ cosmetic, name }: { cosmetic: CosmeticInfo; name: string }) {
  return <div className={`namecard namecard${suffix(cosmetic.design)}`}>{name}</div>;
}

/** A chat bubble sample in the chosen skin (also applied to real messages). */
export function BubbleSample({ cosmetic, text }: { cosmetic: CosmeticInfo; text: string }) {
  return (
    <div className="msg msg-mine bubble-sample">
      <div className={`msg-bubble bubble${suffix(cosmetic.design)}`}>{text}</div>
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
}: {
  cosmetic: CosmeticInfo;
  category: CosmeticCategory;
  sampleName: string;
}) {
  if (category === 'id') return <IdBadge cosmetic={cosmetic} value="12345678" />;
  if (category === 'namecard') return <NameCard cosmetic={cosmetic} name={sampleName} />;
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
