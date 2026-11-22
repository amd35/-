import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useToast } from '../lib/ui';
import { api } from '../lib/api';
import { Icon } from '../lib/ui';

export default function Welcome() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { token, applyAuth } = useAuth();
  const toast = useToast();

  useEffect(() => {
    if (token) navigate('/', { replace: true });
  }, [token, navigate]);

  const google = async () => {
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
        <div className="logo-badge">
          <Icon name="heart" size={34} fill="currentColor" />
        </div>
        <div>
          <h1>
            Connect<span className="gradient-text">+</span>
          </h1>
          <p className="lead">{t('welcomeLead')}</p>
        </div>

        <div className="feature-chips">
          <span className="pill">
            <Icon name="phone" size={14} /> {t('voiceCall')}
          </span>
          <span className="pill">
            <Icon name="video" size={14} /> {t('videoCall')}
          </span>
          <span className="pill">
            <Icon name="coins" size={14} /> {t('coins')}
          </span>
          <span className="pill">
            <Icon name="shield" size={14} /> {t('security')}
          </span>
          <span className="pill">
            <Icon name="gift" size={14} /> 5 {t('freeAttempts')}
          </span>
        </div>

        <div className="stack">
          <button className="btn btn-primary btn-block" onClick={() => navigate('/register')}>
            {t('createAccount')}
          </button>
          <button className="btn btn-outline btn-block" onClick={() => navigate('/login')}>
            {t('login')}
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => void google()}>
            <Icon name="globe" size={17} /> {t('continueWithGoogle')}
          </button>
        </div>

        <p className="tiny muted center">{t('freeCallsInfo')}</p>
      </div>
    </div>
  );
}
