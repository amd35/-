import { Link, useNavigate, useParams } from 'react-router-dom';
import { adText, trackAdClick, useAds } from '../lib/ads';
import { useI18n } from '../lib/i18n';
import { EmptyState, Icon, Spinner } from '../lib/ui';
import { AppShell } from '../components/AppShell';
import AdMedia from '../components/AdMedia';

/**
 * One ad or event in full: the animated image (or video), the copy the admin
 * wrote and, when the admin set a link, the button that opens it.
 */
export default function AdDetails() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { ads, loading } = useAds();
  const ad = ads.find((item) => item.id === id) ?? null;

  const title = ad ? adText(lang, ad.titleAr, ad.titleEn) : '';
  const body = ad ? adText(lang, ad.bodyAr, ad.bodyEn) : '';

  const openLink = () => {
    if (!ad?.linkUrl) return;
    trackAdClick(ad.id);
    if (ad.linkUrl.startsWith('/')) navigate(ad.linkUrl);
    else window.open(ad.linkUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <AppShell title={t('adsTitle')} subtitle={t('adsSubtitle')} active="home">
      <div className="page ad-detail">
        <Link className="btn btn-ghost btn-sm ad-detail-back" to="/ads">
          <Icon name="arrowLeft" size={15} /> {t('adsBack')}
        </Link>
        {loading ? (
          <Spinner label={t('loading')} />
        ) : !ad ? (
          <EmptyState icon="play" title={t('adsEmpty')} hint={t('adsEmptyHint')} />
        ) : (
          <article className="ad-detail-card">
            <div className="ad-detail-media">
              <AdMedia ad={ad} />
            </div>
            <div className="ad-detail-wrap">
              {title ? <h1 className="ad-detail-title">{title}</h1> : null}
              {body ? <p className="ad-detail-text">{body}</p> : null}
              {ad.linkUrl ? (
                <button type="button" className="btn btn-primary btn-block" onClick={openLink}>
                  <Icon name="arrowRight" size={16} /> {t('adsOpen')}
                </button>
              ) : null}
            </div>
          </article>
        )}
      </div>
    </AppShell>
  );
}
