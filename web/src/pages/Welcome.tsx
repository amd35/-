import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/ui';
import { api } from '../lib/api';
import { Icon } from '../lib/ui';

interface Providers {
  google: boolean;
  apple: boolean;
}

function HeartPhoneMark() {
  return (
    <svg viewBox="0 0 64 64" className="heart-mark" aria-hidden="true">
      <defs>
        <linearGradient id="heart-mark-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff5fa2" />
          <stop offset="55%" stopColor="#b045ff" />
          <stop offset="100%" stopColor="#6d5cff" />
        </linearGradient>
      </defs>
      <path
        d="M32 57C14.5 44.2 5 33.4 5 22.8 5 14.2 11.7 7.5 20 7.5c5 0 9.4 2.6 12 6.6 2.6-4 7-6.6 12-6.6 8.3 0 15 6.7 15 15.3C59 33.4 49.5 44.2 32 57Z"
        fill="url(#heart-mark-fill)"
      />
      <path
        d="M27.2 22.6c1.5 3 4.1 5.6 7.1 7.1l2.4-2.4c.3-.3.8-.4 1.1-.2 1.2.4 2.5.7 3.8.7.6 0 1.1.5 1.1 1.1v3.7c0 .6-.5 1.1-1.1 1.1-9.9 0-17.9-8-17.9-17.9 0-.6.5-1.1 1.1-1.1h3.7c.6 0 1.1.5 1.1 1.1 0 1.3.2 2.6.7 3.8.1.4 0 .8-.2 1.1l-2.9 3Z"
        fill="#fff"
      />
    </svg>
  );
}

function CoupleArt() {
  return (
    <svg viewBox="0 0 240 150" className="couple-art" aria-hidden="true">
      <defs>
        <radialGradient id="couple-glow" cx="50%" cy="52%" r="52%">
          <stop offset="0%" stopColor="#ff5fa2" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#a855f7" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="couple-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5b3a80" />
          <stop offset="100%" stopColor="#1b1029" />
        </linearGradient>
        <linearGradient id="couple-heart" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff8ac2" />
          <stop offset="100%" stopColor="#ff2f7d" />
        </linearGradient>
      </defs>
      <circle cx="120" cy="80" r="72" fill="url(#couple-glow)" />
      <g fill="url(#couple-body)" stroke="rgba(180,140,255,0.22)" strokeWidth="1">
        <path d="M40 146c0-28 17-48 38-48s38 20 38 48Z" />
        <circle cx="78" cy="66" r="18" />
        <path d="M124 146c0-28 17-48 38-48s38 20 38 48Z" />
        <circle cx="162" cy="66" r="18" />
      </g>
      <path
        d="M120 100c-12-9-21-16-21-25.4a10.5 10.5 0 0 1 21-4.7 10.5 10.5 0 0 1 21 4.7C141 84 132 91 120 100Z"
        fill="url(#couple-heart)"
      />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9Z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.7l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
      <path d="M16.4 12.7c0-2.5 2-3.7 2.1-3.8-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.6.9-.7 0-1.9-.9-3.1-.9-1.6 0-3.1.9-3.9 2.4-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.5 3 2.4 1.2 0 1.6-.8 3.1-.8s1.9.8 3.1.8c1.3 0 2.1-1.2 2.9-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.6-1-2.6-3.5ZM14 5.4c.6-.8 1.1-1.9 1-3-1 0-2.2.7-2.9 1.5-.6.7-1.1 1.8-1 2.9 1.1.1 2.2-.6 2.9-1.4Z" />
    </svg>
  );
}

export default function Welcome() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { token, applyAuth } = useAuth();
  const toast = useToast();
  const [providers, setProviders] = useState<Providers>({ google: false, apple: false });

  useEffect(() => {
    if (token) navigate('/', { replace: true });
  }, [token, navigate]);

  useEffect(() => {
    api<Providers>('/auth/providers')
      .then(setProviders)
      .catch(() => undefined);
  }, []);

  const google = async () => {
    if (!providers.google) {
      toast.push(t('comingSoon'), 'info');
      return;
    }
    try {
      const response = await api<{ token: string }>('/auth/google', {
        method: 'POST',
        body: { idToken: '' },
      });
      if (response.token) applyAuth(response as never);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-art">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
      </div>

      <div className="welcome-content">
        <div className="welcome-brand">
          <HeartPhoneMark />
          <h1>
            Connect<span className="gradient-text">+</span>
          </h1>
          <p className="lead">{t('welcomeLead')}</p>
        </div>

        <CoupleArt />

        <div className="stack">
          <button className="btn btn-primary btn-block btn-lg" onClick={() => navigate('/register')}>
            {t('createAccount')}
          </button>
          <button className="btn btn-outline btn-block btn-lg" onClick={() => navigate('/login')}>
            {t('login')}
          </button>
        </div>

        <div className="social-block">
          <div className="social-label">{t('orContinueWith')}</div>
          <div className="social-row">
            <button className="social-btn" onClick={() => void google()}>
              <GoogleMark />
              <span>{t('google')}</span>
              {!providers.google ? <span className="social-soon">{t('comingSoon')}</span> : null}
            </button>
            <button className="social-btn" onClick={() => toast.push(t('comingSoon'), 'info')}>
              <AppleMark />
              <span>{t('apple')}</span>
              {!providers.apple ? <span className="social-soon">{t('comingSoon')}</span> : null}
            </button>
          </div>
        </div>

        <div className="welcome-features">
          <span className="pill">
            <Icon name="phone" size={13} /> {t('voiceCall')}
          </span>
          <span className="pill">
            <Icon name="video" size={13} /> {t('videoCall')}
          </span>
          <span className="pill pill-gold">
            <Icon name="coins" size={13} /> 100 {t('coins')} / {t('minutes')}
          </span>
          <span className="pill">
            <Icon name="shield" size={13} /> {t('security')}
          </span>
          <span className="pill">
            <Icon name="gift" size={13} /> 5 {t('freeAttempts')}
          </span>
        </div>

        <p className="tiny muted center">{t('tagline')}</p>
      </div>
    </div>
  );
}
