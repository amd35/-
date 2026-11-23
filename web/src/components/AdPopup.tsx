import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adPopupSeen, adText, markAdPopupSeen, trackAdClick, trackAdView, type AdItem } from '../lib/ads';
import { useI18n } from '../lib/i18n';
import { Icon, Sheet } from '../lib/ui';
import AdMedia from './AdMedia';

/**
 * The popup shown once per app session when a `showPopup` ad is live. Closing it
 * remembers the ad for the session, so navigating back home does not reopen it.
 */
export default function AdPopup({ ads }: { ads: AdItem[] }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const popup = useMemo(() => ads.find((ad) => ad.showPopup) ?? null, [ads]);
  const [open, setOpen] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current || !popup) return;
    checked.current = true;
    if (adPopupSeen(popup.id)) return;
    markAdPopupSeen(popup.id);
    trackAdView(popup.id);
    setOpen(true);
  }, [popup]);

  if (!popup) return null;

  const title = adText(lang, popup.titleAr, popup.titleEn);
  const body = adText(lang, popup.bodyAr, popup.bodyEn);

  return (
    <Sheet open={open} onClose={() => setOpen(false)} center>
      <div className="ad-popup">
        <button
          type="button"
          className="icon-btn plain ad-popup-close"
          onClick={() => setOpen(false)}
          aria-label={t('close')}
        >
          <Icon name="x" size={18} />
        </button>
        <div className="ad-media ad-popup-media">
          <AdMedia ad={popup} />
        </div>
        {title ? <h3 className="ad-popup-title">{title}</h3> : null}
        {body ? <p className="tiny muted">{body}</p> : null}
        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={() => {
            trackAdClick(popup.id);
            setOpen(false);
            navigate(`/ads/${popup.id}`);
          }}
        >
          <Icon name="arrowRight" size={16} /> {t('adsView')}
        </button>
      </div>
    </Sheet>
  );
}
