import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { Avatar, Icon } from '../lib/ui';

interface BotInfo {
  conversationId: string;
  greeting: string;
  bot: { id: string; displayName: string; avatarUrl: string };
}

/**
 * Lina's greeting card on the home screen: she appears as soon as the app opens
 * and talks to the user, and one tap opens her private chat.
 */
export function BotGreeter() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [info, setInfo] = useState<BotInfo | null>(null);

  useEffect(() => {
    api<BotInfo>('/chat/bot')
      .then(setInfo)
      .catch(() => undefined);
  }, []);

  if (!info) return null;

  return (
    <button
      type="button"
      className="bot-card"
      onClick={() => navigate(`/chats/${info.conversationId}`)}
    >
      <Avatar
        user={{ displayName: info.bot.displayName, avatarUrl: info.bot.avatarUrl, online: true }}
        size={52}
      />
      <div className="bot-main">
        <div className="bot-name">
          {info.bot.displayName}
          <span className="bot-badge">
            <Icon name="sparkle" size={11} /> {t('aiAssistant')}
          </span>
        </div>
        <div className="bot-line">{info.greeting}</div>
      </div>
      <span className="bot-cta">
        <Icon name="chat" size={17} />
      </span>
    </button>
  );
}
