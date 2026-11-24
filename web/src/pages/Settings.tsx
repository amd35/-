import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { notificationPermission, requestNotificationPermission, showNotification } from '../lib/appNotify';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useNotify } from '../lib/notifyCenter';
import { formatCoins, formatCountdown, Icon, Sheet, useCountdown, useToast } from '../lib/ui';
import { AppShell } from '../components/AppShell';
import { GiftCodeSheet } from '../components/GiftCodeSheet';

type SheetKind = 'gift' | 'password' | 'privacy' | 'calls' | 'support' | 'about' | 'delete' | null;

export default function Settings() {
  const { me, refresh, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = Boolean(me?.user.isAdmin);
  const free = me?.freeCalls;
  const countdown = useCountdown(free?.nextResetAt);
  const notify = useNotify();
  const [notifState, setNotifState] = useState<'granted' | 'denied' | 'prompt'>('prompt');

  useEffect(() => {
    void notificationPermission().then(setNotifState);
  }, []);

  /** Enables OS notifications and shows a sample of the luxury card. */
  const enableAppNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotifState(granted ? 'granted' : await notificationPermission());
    notify.show({
      kind: 'system',
      title: 'يلا فون',
      body: granted
        ? 'إشعاراتك صارت جاهزة ✨ رح توصلك رسائل الأصدقاء وهدايا الإدارة حتى وأنت خارج التطبيق.'
        : 'هكذا يوصلك إشعار يلا فون الفخم — فعّل الإشعارات من إعدادات الهاتف حتى يصلك وأنت خارج التطبيق.',
      route: '/notifications',
    });
    if (!granted) {
      toast.push(
        lang === 'ar'
          ? 'الإشعارات معطلة — فعّلها من إعدادات الهاتف'
          : 'Notifications are blocked — enable them in phone settings',
        'error'
      );
      return;
    }
    void showNotification({
      kind: 'system',
      title: 'يلا فون',
      body: 'إشعاراتك مفعّلة — رح ندلّعك برسائل فخمة 💜',
    });
    toast.push(lang === 'ar' ? 'تم تفعيل إشعارات يلا فون' : 'Yalla Phone notifications enabled', 'success');
  };

  const changePassword = async () => {
    setBusy(true);
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      toast.push(t('saved'), 'success');
      setSheet(null);
      setCurrentPassword('');
      setNewPassword('');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const deleteAccount = async () => {
    setBusy(true);
    try {
      await api('/auth/me', { method: 'DELETE', body: { password: deletePassword } });
      logout();
      navigate('/welcome', { replace: true });
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const disableAdminMode = async () => {
    setBusy(true);
    try {
      await api('/auth/admin-mode', { method: 'DELETE' });
      await refresh();
      toast.push(lang === 'ar' ? 'تم إيقاف وضع الأدمن' : 'Admin mode disabled', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const markAll = async () => {
    await api('/notifications/read-all', { method: 'POST' }).catch(() => undefined);
    await refresh();
    toast.push(t('saved'), 'success');
  };

  return (
    <AppShell
      title={t('settings')}
      active="profile"
      right={
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="back">
          <Icon name="arrowRight" size={19} />
        </button>
      }
    >
      <div className="page page-tight">
        <section className="card stack">
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="row-title">{t('freeAttempts')}</div>
              <div className="row-sub">
                {free?.remaining ?? 0} / {free?.perDay ?? 5} • {t('renewsIn')}{' '}
                {formatCountdown(countdown, lang)}
              </div>
            </div>
            <span className="pill pill-gold">
              <Icon name="gift" size={13} /> {t('free')}
            </span>
          </div>
          <div className="divider" />
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <span className="row-sub">{t('priceVoice')}</span>
            <strong>
              {me?.config.voicePrice ?? 100} {t('coins')} / {t('minutes')}
            </strong>
          </div>
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <span className="row-sub">{t('priceVideo')}</span>
            <strong>
              {me?.config.videoPrice ?? 100} {t('coins')} / {t('minutes')}
            </strong>
          </div>
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <span className="row-sub">{t('balance')}</span>
            <strong>
              {formatCoins(me?.wallet.balance ?? 0)} {t('coins')}
            </strong>
          </div>
        </section>

        <section className="list">
          <div className="row" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>
            <Icon name="globe" size={19} />
            <div className="row-main">
              <div className="row-title">{t('language')}</div>
              <div className="row-sub">{lang === 'ar' ? 'العربية' : 'English'}</div>
            </div>
            <span className="pill">{lang === 'ar' ? 'EN' : 'AR'}</span>
          </div>

          <div className="row" onClick={() => setSheet('gift')}>
            <Icon name="gift" size={19} />
            <div className="row-main">
              <div className="row-title">{t('redeemGiftCode')}</div>
              <div className="row-sub">{t('giftCodeHint')}</div>
            </div>
            <Icon name="arrowLeft" size={17} />
          </div>

          <div className="row" onClick={() => setSheet('password')}>
            <Icon name="lock" size={19} />
            <div className="row-main">
              <div className="row-title">{t('privacySecurity')}</div>
              <div className="row-sub">{t('changePassword')}</div>
            </div>
            <Icon name="arrowLeft" size={17} />
          </div>

          <div className="row" onClick={() => setSheet('calls')}>
            <Icon name="phone" size={19} />
            <div className="row-main">
              <div className="row-title">{t('callSettings')}</div>
              <div className="row-sub">
                {me?.config.voicePrice ?? 100} / {me?.config.videoPrice ?? 100} {t('coins')} / {t('minutes')}
              </div>
            </div>
            <Icon name="arrowLeft" size={17} />
          </div>

          <div className="row" onClick={() => navigate('/notifications')}>
            <Icon name="bell" size={19} />
            <div className="row-main">
              <div className="row-title">{t('notifications')}</div>
              <div className="row-sub">
                {me?.unreadNotifications ?? 0} • {t('markAllRead')}
              </div>
            </div>
            <button
              className="btn btn-ghost btn-xs"
              onClick={(event) => {
                event.stopPropagation();
                void markAll();
              }}
            >
              {t('markAllRead')}
            </button>
          </div>

          <div className="row" onClick={() => void enableAppNotifications()}>
            <Icon name="sparkle" size={19} />
            <div className="row-main">
              <div className="row-title">{t('appNotifications')}</div>
              <div className="row-sub">
                {notifState === 'granted'
                  ? lang === 'ar'
                    ? 'مفعّلة — تصلك رسائل يلا فون حتى خارج التطبيق'
                    : 'On — you get Yalla Phone alerts outside the app'
                  : notifState === 'denied'
                    ? lang === 'ar'
                      ? 'معطلة من إعدادات الهاتف'
                      : 'Blocked in phone settings'
                    : lang === 'ar'
                      ? 'اضغط للتفعيل واستلام الرسائل خارج التطبيق'
                      : 'Tap to enable notifications'}
              </div>
            </div>
            <button
              className="btn btn-ghost btn-xs"
              onClick={(event) => {
                event.stopPropagation();
                void enableAppNotifications();
              }}
            >
              {notifState === 'granted'
                ? lang === 'ar'
                  ? 'مفعّلة'
                  : 'On'
                : lang === 'ar'
                  ? 'تفعيل'
                  : 'Enable'}
            </button>
          </div>

          <div className="row" onClick={() => setSheet('privacy')}>
            <Icon name="shield" size={19} />
            <div className="row-main">
              <div className="row-title">{t('privacy')}</div>
            </div>
            <Icon name="arrowLeft" size={17} />
          </div>

          <div className="row" onClick={() => setSheet('support')}>
            <Icon name="chat" size={19} />
            <div className="row-main">
              <div className="row-title">{t('support')}</div>
            </div>
            <Icon name="arrowLeft" size={17} />
          </div>

          <div className="row" onClick={() => setSheet('about')}>
            <Icon name="sparkle" size={19} />
            <div className="row-main">
              <div className="row-title">{t('about')}</div>
              <div className="row-sub">يلا فون 1.0.0</div>
            </div>
            <Icon name="arrowLeft" size={17} />
          </div>

          {isAdmin ? (
            <>
              <div className="row" onClick={() => navigate('/admin')}>
                <Icon name="chart" size={19} />
                <div className="row-main">
                  <div className="row-title">{t('adminPanel')}</div>
                  <div className="row-sub">{t('adminLogin')}</div>
                </div>
                <Icon name="arrowLeft" size={17} />
              </div>
              <div className="row" onClick={() => void disableAdminMode()}>
                <Icon name="lock" size={19} />
                <div className="row-main">
                  <div className="row-title">
                    {lang === 'ar' ? 'إيقاف وضع الأدمن' : 'Turn off admin mode'}
                  </div>
                  <div className="row-sub">
                    {lang === 'ar'
                      ? 'إخفاء أدوات الإدارة من هذا الحساب'
                      : 'Hide admin tools from this account'}
                  </div>
                </div>
                <Icon name="arrowLeft" size={17} />
              </div>
            </>
          ) : null}
        </section>

        <section className="list">
          <button
            className="btn btn-block logout-btn"
            onClick={() => {
              logout();
              navigate('/welcome', { replace: true });
            }}
          >
            <Icon name="logout" size={17} /> {t('logout')}
          </button>
          <button className="btn btn-danger btn-block" onClick={() => setSheet('delete')}>
            <Icon name="trash" size={17} /> {t('deleteAccount')}
          </button>
        </section>
      </div>

      <Sheet open={sheet === 'password'} onClose={() => setSheet(null)} title={t('changePassword')}>
        <div className="stack">
          <div className="field">
            <label>{t('currentPassword')}</label>
            <input
              className="input"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              dir="ltr"
            />
          </div>
          <div className="field">
            <label>{t('newPassword')}</label>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              dir="ltr"
            />
          </div>
          <button className="btn btn-primary btn-block" onClick={() => void changePassword()} disabled={busy}>
            {t('save')}
          </button>
        </div>
      </Sheet>

      <GiftCodeSheet open={sheet === 'gift'} onClose={() => setSheet(null)} />

      <Sheet open={sheet === 'calls'} onClose={() => setSheet(null)} title={t('callSettings')}>
        <div className="stack">
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <span className="row-sub">{t('priceVoice')}</span>
            <strong>
              {me?.config.voicePrice ?? 100} {t('coins')} / {t('minutes')}
            </strong>
          </div>
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <span className="row-sub">{t('priceVideo')}</span>
            <strong>
              {me?.config.videoPrice ?? 100} {t('coins')} / {t('minutes')}
            </strong>
          </div>
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <span className="row-sub">{t('freeAttempts')}</span>
            <strong>
              {free?.remaining ?? 0} / {free?.perDay ?? 5}
            </strong>
          </div>
          <p className="tiny muted">{t('nextCallPaid')}</p>
        </div>
      </Sheet>

      <Sheet open={sheet === 'privacy'} onClose={() => setSheet(null)} title={t('privacy')}>
        <p className="tiny muted" style={{ lineHeight: 1.9 }}>
          {t('privacyBody')}
        </p>
      </Sheet>

      <Sheet open={sheet === 'support'} onClose={() => setSheet(null)} title={t('support')}>
        <p className="tiny muted" style={{ lineHeight: 1.9 }}>
          {t('supportBody')}
        </p>
        <p className="tiny" style={{ marginTop: 8 }} dir="ltr">
          {me?.config.supportContact}
        </p>
      </Sheet>

      <Sheet open={sheet === 'about'} onClose={() => setSheet(null)} title={t('about')}>
        <p className="tiny muted" style={{ lineHeight: 1.9 }}>
          {t('aboutBody')}
        </p>
      </Sheet>

      <Sheet open={sheet === 'delete'} onClose={() => setSheet(null)} title={t('deleteAccount')}>
        <div className="stack">
          <div className="error-text">{t('confirmDelete')}</div>
          <div className="field">
            <label>{t('password')}</label>
            <input
              className="input"
              type="password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
              dir="ltr"
            />
          </div>
          <button className="btn btn-danger btn-block" onClick={() => void deleteAccount()} disabled={busy}>
            {t('deleteAccount')}
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}
