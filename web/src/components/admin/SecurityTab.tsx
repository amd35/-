import { useState } from 'react';
import { api } from '../../lib/api';
import { Icon } from '../../lib/ui';
import { AdminCard, Field, adminError } from './shared';

export default function SecurityTab() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }
    setBusy(true);
    try {
      await api('/admin/password', {
        method: 'POST',
        admin: true,
        body: { currentPassword, newPassword },
      });
      setSaved(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(adminError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <AdminCard title="كلمة مرور الإدارة" subtitle="غيّر كلمة المرور المستخدمة لتسجيل الدخول إلى هذه اللوحة">
        <form className="stack" onSubmit={submit}>
          <Field label="كلمة المرور الحالية">
            <input
              className="input"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              dir="ltr"
              autoComplete="current-password"
            />
          </Field>
          <Field label="كلمة المرور الجديدة" hint="8 أحرف على الأقل">
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              dir="ltr"
              autoComplete="new-password"
            />
          </Field>
          <Field label="تأكيد كلمة المرور الجديدة">
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              dir="ltr"
              autoComplete="new-password"
            />
          </Field>
          {error ? <div className="error-text">{error}</div> : null}
          {saved ? (
            <div className="tiny" style={{ color: '#86efac' }}>
              <Icon name="check" size={13} /> تم تغيير كلمة المرور — استخدمها في تسجيل الدخول القادم
            </div>
          ) : null}
          <button
            className="btn btn-primary"
            disabled={busy || !currentPassword || !newPassword || !confirmPassword}
          >
            {busy ? <span className="spinner" /> : 'تغيير كلمة المرور'}
          </button>
        </form>
      </AdminCard>

      <AdminCard title="نسيت كلمة المرور الحالية؟">
        <p className="tiny muted" style={{ lineHeight: 1.8 }}>
          إذا لم تستطع تسجيل الدخول، حدّث سرّ <code>ADMIN_PASSWORD</code> من صفحة الأسرار في مساحة
          العمل ثم أعد تشغيل الـ API. ستصبح تلك القيمة كلمة مرور الإدارة مجدداً عند التشغيل التالي.
        </p>
      </AdminCard>
    </div>
  );
}
