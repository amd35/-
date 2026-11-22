import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useCall } from '../lib/call';
import { useI18n } from '../lib/i18n';
import { useRealtime } from '../lib/realtime';
import { Avatar, EmptyState, formatCoins, formatDuration, formatTimeAgo, Icon, useAsyncData } from '../lib/ui';
import { AppShell } from '../components/AppShell';

interface CallRecord {
  id: string;
  kind: 'voice' | 'video';
  status: string;
  isFree: boolean;
  durationSeconds: number;
  coinsCharged: number;
  coinsRefunded: number;
  ratePerMinute: number;
  createdAt: string;
  direction: 'incoming' | 'outgoing';
  missed: boolean;
  endReason: string | null;
  peer: { id: string; displayName: string; username: string; avatarUrl: string | null };
}

type Tab = 'all' | 'voice' | 'video' | 'missed';

export default function Calls() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { startCall } = useCall();
  const { on } = useRealtime();
  const [tab, setTab] = useState<Tab>('all');
  const { data, loading, reload } = useAsyncData(
    () => api<{ calls: CallRecord[] }>(`/calls/history?filter=${tab}`),
    [tab]
  );

  useEffect(() => {
    const off = on('call:ended', () => reload());
    return () => off();
  }, [on, reload]);

  const calls = data?.calls ?? [];

  return (
    <AppShell title={t('callHistory')} active="calls">
      <div className="page page-tight">
        <div className="tabs">
          {(['all', 'voice', 'video', 'missed'] as Tab[]).map((item) => (
            <button
              key={item}
              className={`tab ${tab === item ? 'active' : ''}`}
              onClick={() => setTab(item)}
            >
              {t(item === 'all' ? 'all' : item === 'voice' ? 'voiceCalls' : item === 'video' ? 'videoCalls' : 'missed')}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="stack">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="skeleton" />
            ))}
          </div>
        ) : calls.length === 0 ? (
          <EmptyState icon="phone" title={t('noCalls')} hint={t('freeCallsInfo')} />
        ) : (
          <div className="list">
            {calls.map((call) => {
              const missed = call.status === 'missed';
              return (
                <div key={call.id} className="row" onClick={() => navigate(`/u/${call.peer.id}`)}>
                  <Avatar user={call.peer} />
                  <div className="row-main">
                    <div className="row-title" style={{ color: missed ? '#fca5a5' : undefined }}>
                      {call.peer.displayName}
                    </div>
                    <div className="row-sub inline" style={{ gap: 6 }}>
                      <Icon
                        name={call.direction === 'outgoing' ? 'phoneOut' : 'phoneIn'}
                        size={12}
                        style={{ color: missed ? '#f87171' : '#86efac' }}
                      />
                      <span>{t(call.direction)}</span>
                      <span>•</span>
                      <span>{call.kind === 'video' ? t('videoCall') : t('voiceCall')}</span>
                      {call.durationSeconds > 0 ? (
                        <>
                          <span>•</span>
                          <span>{formatDuration(call.durationSeconds)}</span>
                        </>
                      ) : null}
                    </div>
                    <div className="row-sub inline" style={{ gap: 6 }}>
                      <span>{formatTimeAgo(call.createdAt, lang)}</span>
                      <span className={`pill ${call.isFree ? 'pill-green' : 'pill-gold'}`} style={{ padding: '1px 7px', fontSize: 10 }}>
                        {call.isFree ? t('free') : `${formatCoins(call.coinsCharged)} ${t('coins')}`}
                      </span>
                    </div>
                  </div>
                  <div className="inline" style={{ gap: 6 }}>
                    <button
                      className="icon-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        void startCall(
                          { id: call.peer.id, displayName: call.peer.displayName, avatarUrl: call.peer.avatarUrl },
                          'voice'
                        );
                      }}
                      aria-label="call again"
                    >
                      <Icon name="phone" size={17} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        void startCall(
                          { id: call.peer.id, displayName: call.peer.displayName, avatarUrl: call.peer.avatarUrl },
                          'video'
                        );
                      }}
                      aria-label="video call"
                    >
                      <Icon name="video" size={17} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
