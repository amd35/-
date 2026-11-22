import { useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../lib/ui';
import { AdminCard, Field } from './shared';

export default function BroadcastTab() {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const response = await api<{ sent: number }>('/admin/notifications/broadcast', {
        method: 'POST',
        admin: true,
        body: { title, body },
      });
      toast.push(`Sent to ${response.sent} users`, 'success');
      setTitle('');
      setBody('');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard title="Broadcast notification" subtitle="Delivered instantly to every active account">
      <div className="stack" style={{ maxWidth: 560 }}>
        <Field label="Title">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="Message">
          <textarea className="textarea" value={body} onChange={(event) => setBody(event.target.value)} />
        </Field>
        <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => void send()} disabled={busy}>
          Send to all users
        </button>
      </div>
    </AdminCard>
  );
}
