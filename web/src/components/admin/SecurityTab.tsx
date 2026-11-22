import { useState } from 'react';
import { api } from '../../lib/api';
import { Icon } from '../../lib/ui';
import { AdminCard, Field } from './shared';

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
      setError('The two passwords do not match');
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
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <AdminCard title="Admin password" subtitle="Change the password used to sign in to this panel">
        <form className="stack" onSubmit={submit}>
          <Field label="Current password">
            <input
              className="input"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              dir="ltr"
              autoComplete="current-password"
            />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              dir="ltr"
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
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
              <Icon name="check" size={13} /> Password changed — use it the next time you sign in
            </div>
          ) : null}
          <button
            className="btn btn-primary"
            disabled={busy || !currentPassword || !newPassword || !confirmPassword}
          >
            {busy ? <span className="spinner" /> : 'Change password'}
          </button>
        </form>
      </AdminCard>

      <AdminCard title="Forgot the current password?">
        <p className="tiny muted" style={{ lineHeight: 1.8 }}>
          If you cannot sign in, update the <code>ADMIN_PASSWORD</code> secret from the workspace
          Secrets page and restart the API. That value becomes the admin password again on the next
          boot.
        </p>
      </AdminCard>
    </div>
  );
}
