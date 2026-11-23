import { useEffect, useMemo, useState } from 'react';
import { adText, trackAdClick, trackAdView, type AdItem } from '../lib/ads';
import { useI18n } from '../lib/i18n';
import { Icon } from '../lib/ui';
import AdMedia from './AdMedia';

const AUTOPLAY_MS = 6000;

/**
 * The home banner: every ad with `showBanner` in one auto-advancing slide with
 * navigation dots. A slide with a link records a click; each slide records a view.
 */
export default function AdsCarousel({ ads }: { ads: AdItem[] }) {
  const { t, lang } = useI18n();
  const bannerAds = useMemo(() => ads.filter((ad) => ad.showBanner), [ads]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex((current) => (current >= bannerAds.length ? 0 : current));
  }, [bannerAds.length]);

  useEffect(() => {
    if (bannerAds.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % bannerAds.length);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [bannerAds.length, index]);

  const current = bannerAds[Math.min(index, bannerAds.length - 1)];

  useEffect(() => {
    if (current) trackAdView(current.id);
  }, [current]);

  if (!bannerAds.length || !current) return null;

  const title = adText(lang, current.titleAr, current.titleEn);
  const body = adText(lang, current.bodyAr, current.bodyEn);
  const go = (step: number) =>
    setIndex((value) => (value + step + bannerAds.length) % bannerAds.length);

  return (
    <section className="ad-carousel" aria-label={t('adsTitle')}>
      <div className="ad-slide">
        <div className="ad-media">
          <AdMedia ad={current} />
          {bannerAds.length > 1 ? (
            <>
              <button
                type="button"
                className="ad-nav ad-nav-prev"
                onClick={() => go(-1)}
                aria-label={t('adsPrev')}
              >
                <Icon name="arrowLeft" size={16} />
              </button>
              <button
                type="button"
                className="ad-nav ad-nav-next"
                onClick={() => go(1)}
                aria-label={t('adsNext')}
              >
                <Icon name="arrowRight" size={16} />
              </button>
            </>
          ) : null}
        </div>
        {title || body ? (
          <div className="ad-slide-body">
            {title ? <strong>{title}</strong> : null}
            {body ? <span className="tiny muted">{body}</span> : null}
          </div>
        ) : null}
        {current.linkUrl ? (
          <a
            className="ad-hit"
            href={current.linkUrl}
            target={current.linkUrl.startsWith('/') ? undefined : '_blank'}
            rel="noreferrer"
            aria-label={title || t('adsOpen')}
            onClick={() => trackAdClick(current.id)}
          />
        ) : null}
      </div>
      {bannerAds.length > 1 ? (
        <div className="ad-dots">
          {bannerAds.map((ad, dot) => (
            <button
              key={ad.id}
              type="button"
              className={`ad-dot ${dot === index ? 'active' : ''}`}
              onClick={() => setIndex(dot)}
              aria-label={`${dot + 1}`}
              aria-current={dot === index}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
