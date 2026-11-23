import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { Icon, useToast } from '../lib/ui';

/**
 * Entry point to the official YALLA PHONE support thread. Shown on every
 * profile (own and other users) and pinned first in the chat list server-side.
 */
export function SupportCard() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    setBusy(true);
    try {
      const response = await api<{ conversationId: string }>('/chat/support', { method: 'POST' });
      navigate(`/chats/${response.conversationId}`);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className="support-card" onClick={() => void open()} disabled={busy}>
      <span className="support-mark" aria-hidden="true">
        <Icon name="shield" size={20} />
      </span>
      <span className="row-main">
        <span className="row-title support-title">
          {t('officialSupport')}
          <span className="official-badge">
            <Icon name="check" size={10} /> {t('verified')}
          </span>
        </span>
        <span className="row-sub">YALLA PHONE • {t('officialAccount')}</span>
      </span>
      <Icon name="chat" size={18} />
    </button>
  );
}
