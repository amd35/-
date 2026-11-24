import { assetUrl } from '../lib/api';
import type { AdItem } from '../lib/ads';

/** The ad's image or looping video, filling its container. */
export default function AdMedia({ ad }: { ad: AdItem }) {
  const src = assetUrl(ad.mediaUrl);
  if (ad.mediaType === 'video') {
    return <video src={src} autoPlay muted loop playsInline preload="metadata" />;
  }
  return <img src={src} alt="" loading="lazy" />;
}
