import { useEffect } from 'react';
import { adText, trackAdClick, trackAdView, useAds, type AdItem } from '../lib/ads';
import { useI18n } from '../lib/i18n';
import { EmptyState, Icon, Spinner } from '../lib/ui';
import { AppShell } from '../components/AppShell';
import AdMedia from '../components/AdMedia';

function formatDate(value: string | null, lang: 'ar' | 'en'): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString(lang === 'ar' ? 'ar-IQ' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function AdCard({ ad }: { ad: AdItem }) {
  const { t, lang } = useI18n();
  const title = adText(lang, ad.titleAr, ad.titleEn);
  const body = adText(lang, ad.bodyAr, ad.bodyEn);
  const start = formatDate(ad.startsAt, lang);
  const end = formatDate(ad.endsAt, lang);
  const upcoming = ad.startsAt ? new Date(ad.startsAt).getTime() > Date.now() : false;

  return (
    <article className="ad-card">
      <div className="ad-media">
        <AdMedia ad={ad} />
      </div>
      <div className="ad-card-body">
        {title ? <strong>{title}</strong> : null}
        {body ? <span className="tiny muted">{body}</span> : null}
        <div className="ad-card-meta">
          {upcoming && start ? (
            <span className="pill pill-blue tiny">{t('adsStarts', { date: start })}</span>
          ) : (
            <span className="pill pill-green tiny">{t('adsLive')}</span>
          )}
          {end ? <span className="tiny muted">{t('adsEnds', { date: end })}</span> : null}
        </div>
        {ad.linkUrl ? (
          <a
            className="btn btn-outline btn-sm"
            href={ad.linkUrl}
            target={ad.linkUrl.startsWith('/') ? undefined : '_blank'}
            rel="noreferrer"
            onClick={() => trackAdClick(ad.id)}
          >
            <Icon name="arrowRight" size={14} /> {t('adsOpen')}
          </a>
        ) : null}
      </div>
    </article>
  );
}

/** Every live ad and event, in the order the admin arranged them. */
export default function Ads() {
  const { t } = useI18n();
  const { ads, loading } = useAds();

  useEffect(() => {
    for (const ad of ads) trackAdView(ad.id);
  }, [ads]);

  return (
    <AppShell title={t('adsTitle')} subtitle={t('adsSubtitle')} active="home">
      <div className="page">
        {loading ? (
          <Spinner label={t('loading')} />
        ) : ads.length === 0 ? (
          <EmptyState icon="play" title={t('adsEmpty')} hint={t('adsEmptyHint')} />
        ) : (
          <div className="ads-list">
            {ads.map((ad) => (
              <AdCard key={ad.id} ad={ad} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
