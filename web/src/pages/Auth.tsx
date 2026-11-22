import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Icon, useToast } from '../lib/ui';

function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const navigate = useNavigate();
  return (
    <div className="stack">
      <button
        className="icon-btn"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => navigate('/welcome')}
        aria-label="back"
      >
        <Icon name="arrowRight" size={19} />
      </button>
      <div className="logo-badge" style={{ width: 60, height: 60, borderRadius: 19 }}>
        <Icon name="heart" size={26} fill="currentColor" />
      </div>
      <div>
        <h2 style={{ fontSize: 26, fontWeight: 800 }}>{title}</h2>
        <p className="muted tiny">{subtitle}</p>
      </div>
    </div>
  );
}

export function Login() {
  const { t } = useI18n();
  const { login, token } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token) navigate('/', { replace: true });
  }, [token, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <AuthHeader title={t('welcomeBack')} subtitle={t('signInSub')} />
      <form className="auth-card" onSubmit={submit}>
        <div className="field">
          <label>{t('email')} / {t('username')} / {t('phone')}</label>
          <input
            className="input"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="you@example.com"
            autoComplete="username"
            dir="ltr"
          />
        </div>
        <div className="field">
          <label>{t('password')}</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            dir="ltr"
          />
        </div>
        {error ? <div className="error-text">{error}</div> : null}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <span className="spinner" /> : t('login')}
        </button>
        <div className="inline" style={{ justifyContent: 'space-between' }}>
          <Link className="tiny muted" to="/forgot">
            {t('forgotPassword')}
          </Link>
          <Link className="tiny muted" to="/register">
            {t('createAccount')}
          </Link>
        </div>
      </form>
    </div>
  );
}

export function Register() {
  const { t } = useI18n();
  const { register, token } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState('');
  const [phoneToken, setPhoneToken] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token) navigate('/', { replace: true });
  }, [token, navigate]);

  const requestCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const response = await api<{ devCode?: string; delivery: string }>('/auth/otp/request', {
        method: 'POST',
        body: { phone },
      });
      setOtpSent(true);
      setDevCode(response.devCode ?? null);
      if (response.devCode) toast.push(`Demo code: ${response.devCode}`, 'info');
      else if (response.delivery === 'unconfigured') {
        toast.push('SMS gateway is not configured yet', 'error');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const response = await api<{ phoneToken: string }>('/auth/otp/verify', {
        method: 'POST',
        body: { phone, code },
      });
      setPhoneToken(response.phoneToken);
      toast.push(t('verify'), 'success');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (mode === 'phone' && !phoneToken) {
      setError('Verify your phone number first');
      return;
    }
    setBusy(true);
    try {
      await register({
        displayName: name,
        password,
        email: mode === 'email' ? email : undefined,
        phone: mode === 'phone' ? phone : undefined,
        phoneToken: mode === 'phone' ? phoneToken : undefined,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <AuthHeader title={t('createAccount')} subtitle={t('createSub')} />
      <form className="auth-card" onSubmit={submit}>
        <div className="seg">
          <button type="button" className={mode === 'email' ? 'active' : ''} onClick={() => setMode('email')}>
            {t('email')}
          </button>
          <button type="button" className={mode === 'phone' ? 'active' : ''} onClick={() => setMode('phone')}>
            {t('phone')}
          </button>
        </div>

        <div className="field">
          <label>{t('name')}</label>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ali" />
        </div>

        {mode === 'email' ? (
          <div className="field">
            <label>{t('email')}</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              dir="ltr"
            />
          </div>
        ) : (
          <div className="stack">
            <div className="field">
              <label>{t('phone')}</label>
              <div className="inline">
                <input
                  className="input"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+964 770 000 0000"
                  dir="ltr"
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void requestCode()} disabled={busy}>
                  {t('sendCode')}
                </button>
              </div>
            </div>
            {otpSent ? (
              <div className="field">
                <label>{t('otpCode')}</label>
                <div className="inline">
                  <input
                    className="input"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="123456"
                    dir="ltr"
                    inputMode="numeric"
                  />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void verifyCode()} disabled={busy}>
                    {t('verify')}
                  </button>
                </div>
                {devCode ? <span className="hint">Demo code: {devCode}</span> : null}
                {phoneToken ? <span className="hint" style={{ color: '#86efac' }}>✓ {t('verify')}</span> : null}
              </div>
            ) : null}
          </div>
        )}

        <div className="field">
          <label>{t('password')}</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            dir="ltr"
          />
          <span className="hint">{t('passwordHint')}</span>
        </div>

        {error ? <div className="error-text">{error}</div> : null}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? <span className="spinner" /> : t('createAccount')}
        </button>
        <Link className="tiny muted center" to="/login">
          {t('haveAccount')}
        </Link>
      </form>
    </div>
  );
}

export function ForgotPassword() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [stage, setStage] = useState<'request' | 'reset'>('request');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ devToken?: string; delivery: string }>('/auth/forgot-password', {
        method: 'POST',
        body: { email },
      });
      setStage('reset');
      if (response.devToken) {
        setToken(response.devToken);
        toast.push('Reset token filled in (preview mode)', 'info');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password } });
      toast.push(t('saved'), 'success');
      navigate('/login');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <AuthHeader title={t('resetPassword')} subtitle={t('forgotPassword')} />
      <div className="auth-card">
        {stage === 'request' ? (
          <>
            <div className="field">
              <label>{t('email')}</label>
              <input
                className="input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                dir="ltr"
              />
            </div>
            {error ? <div className="error-text">{error}</div> : null}
            <button className="btn btn-primary btn-block" onClick={() => void request()} disabled={busy}>
              {t('sendCode')}
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <label>Reset token</label>
              <input className="input" value={token} onChange={(event) => setToken(event.target.value)} dir="ltr" />
            </div>
            <div className="field">
              <label>{t('newPassword')}</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                dir="ltr"
              />
            </div>
            {error ? <div className="error-text">{error}</div> : null}
            <button className="btn btn-primary btn-block" onClick={() => void reset()} disabled={busy}>
              {t('save')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
