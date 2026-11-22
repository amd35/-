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
      toast.push(`أُرسل إلى ${response.sent} مستخدم`, 'success');
      setTitle('');
      setBody('');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard title="إشعار عام" subtitle="يُسلَّم فوراً لكل حساب نشط">
      <div className="stack" style={{ maxWidth: 560 }}>
        <Field label="العنوان">
          <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="الرسالة">
          <textarea className="textarea" value={body} onChange={(event) => setBody(event.target.value)} />
        </Field>
        <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => void send()} disabled={busy}>
          إرسال لكل المستخدمين
        </button>
      </div>
    </AdminCard>
  );
}
