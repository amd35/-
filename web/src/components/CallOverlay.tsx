import { useEffect, useRef } from 'react';
import { useCall } from '../lib/call';
import { useI18n } from '../lib/i18n';
import { Avatar, formatCoins, formatDuration, Icon } from '../lib/ui';

const WAVE_BARS = 9;

export function CallOverlay() {
  const {
    phase,
    call,
    incoming,
    elapsed,
    cost,
    balance,
    summary,
    muted,
    speaker,
    cameraOn,
    localStream,
    remoteStream,
    mediaError,
    accept,
    reject,
    cancel,
    end,
    dismiss,
    toggleMute,
    toggleSpeaker,
    toggleCamera,
    switchCamera,
  } = useCall();
  const { t } = useI18n();
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (localVideo.current && localStream) localVideo.current.srcObject = localStream;
  }, [localStream, phase]);

  useEffect(() => {
    if (remoteVideo.current && remoteStream) {
      remoteVideo.current.srcObject = remoteStream;
      void remoteVideo.current.play().catch(() => undefined);
    }
  }, [remoteStream, phase]);

  useEffect(() => {
    if (remoteVideo.current) remoteVideo.current.volume = speaker ? 1 : 0.35;
  }, [speaker, remoteStream]);

  if (phase === 'idle') return null;

  const peer = incoming?.peer ?? call?.peer ?? null;
  const kind = incoming?.kind ?? call?.kind ?? 'voice';
  const isVideo = kind === 'video';

  if (phase === 'incoming' && incoming) {
    return (
      <div className="call-screen">
        <div className="call-top">
          <div className="pulse-wrap">
            <span className="pulse-ring" />
            <span className="pulse-ring delay" />
            <Avatar user={peer} size={132} />
          </div>
          <div className="call-peer-name">{incoming.peer.displayName}</div>
          <div className="call-status">
            {t('incomingCall')} • {isVideo ? t('videoCall') : t('voiceCall')}
          </div>
          <div className="wave">
            {Array.from({ length: WAVE_BARS }).map((_, index) => (
              <span key={index} style={{ animationDelay: `${index * 0.09}s` }} />
            ))}
          </div>
          <div className={`pill ${incoming.isFree ? 'pill-green' : 'pill-gold'}`} style={{ marginTop: 14 }}>
            <Icon name={incoming.isFree ? 'gift' : 'coins'} size={14} />
            {incoming.isFree
              ? t('freeCallBadge')
              : `${incoming.ratePerMinute} ${t('coins')} / ${t('minutes')}`}
          </div>
        </div>
        <div className="call-controls">
          <div className="incoming-actions">
            <div style={{ textAlign: 'center' }}>
              <button className="ctrl ctrl-lg ctrl-reject" onClick={() => void reject()} aria-label="reject">
                <Icon name="phoneOff" size={26} />
              </button>
              <div className="incoming-label">{t('reject')}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button className="ctrl ctrl-lg ctrl-accept" onClick={() => void accept()} aria-label="accept">
                <Icon name={isVideo ? 'video' : 'phone'} size={26} />
              </button>
              <div className="incoming-label">{t('accept')}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'ended') {
    const endedFree = summary?.isFree ?? false;
    return (
      <div className="call-screen" onClick={dismiss}>
        <div className="call-top" style={{ marginTop: 'auto', marginBottom: 'auto' }}>
          <Avatar user={peer} size={110} />
          <div className="call-peer-name">
            {summary?.status === 'rejected'
              ? t('callRejected')
              : summary?.status === 'missed'
                ? t('callMissed')
                : t('callEnded')}
          </div>
          <div className="call-timer">{formatDuration(summary?.durationSeconds ?? 0)}</div>
          <div className={`pill ${endedFree ? 'pill-green' : 'pill-gold'}`}>
            {endedFree
              ? t('freeCallBadge')
              : `${formatCoins(summary?.coinsCharged ?? 0)} ${t('coins')}`}
          </div>
          {summary?.balance !== null && summary?.balance !== undefined ? (
            <div className="tiny muted">
              {t('balance')}: {formatCoins(summary.balance)} {t('coins')}
            </div>
          ) : null}
          <button className="btn btn-outline" style={{ marginTop: 18 }} onClick={dismiss}>
            {t('close')}
          </button>
        </div>
      </div>
    );
  }

  // 'connecting' is already an accepted, billable call: it needs real hang-up controls,
  // not the "cancel" button used before the other side picks up.
  const inProgress = phase === 'active' || phase === 'connecting';
  const statusLabel =
    phase === 'outgoing'
      ? t('calling')
      : phase === 'connecting'
        ? t('connecting')
        : t('callConnected');

  return (
    <div className="call-screen">
      {inProgress && isVideo ? (
        <div className="call-video-area">
          {remoteStream ? (
            <video ref={remoteVideo} className="remote" autoPlay playsInline />
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
              <Avatar user={peer} size={140} />
            </div>
          )}
          <div className="scrim" />
        </div>
      ) : null}

      {inProgress && isVideo && localStream ? (
        <div className="pip">
          <video ref={localVideo} autoPlay playsInline muted />
        </div>
      ) : null}

      <div className="call-top" style={inProgress && isVideo ? {} : { marginTop: 40 }}>
        {!inProgress || !isVideo ? (
          <div className="pulse-wrap">
            {!inProgress ? <span className="pulse-ring" /> : null}
            <Avatar user={peer} size={132} />
          </div>
        ) : null}
        <div className="call-peer-name">{peer?.displayName ?? '—'}</div>
        <div className="call-status">{statusLabel}</div>
        <div className="call-timer">{formatDuration(elapsed)}</div>
        <div className="call-cost">
          {call?.isFree
            ? t('freeCallBadge')
            : `${formatCoins(cost)} ${t('coins')} • ${call?.ratePerMinute ?? 100} ${t('perMinute')}`}
        </div>
        {!call?.isFree ? (
          <div className="tiny muted">
            {t('balance')}: {formatCoins(balance)} {t('coins')}
          </div>
        ) : null}
        {mediaError ? (
          <div className="tiny" style={{ color: '#fca5a5', maxWidth: 280, textAlign: 'center' }}>
            {mediaError}
          </div>
        ) : null}
      </div>

      <div className="call-controls">
        {!inProgress ? (
          <div className="incoming-actions">
            <button className="ctrl ctrl-lg ctrl-reject" onClick={() => void cancel()} aria-label="cancel">
              <Icon name="phoneOff" size={26} />
            </button>
          </div>
        ) : (
          <div className="controls-row">
            <button
              className={`ctrl ${muted ? 'on' : ''}`}
              onClick={toggleMute}
              aria-label="mute"
              title={t('mute')}
            >
              <Icon name={muted ? 'micOff' : 'mic'} size={22} />
            </button>
            <button
              className={`ctrl ${speaker ? 'on' : ''}`}
              onClick={toggleSpeaker}
              aria-label="speaker"
              title={t('speaker')}
            >
              <Icon name={speaker ? 'volume' : 'volumeOff'} size={22} />
            </button>
            {isVideo ? (
              <>
                <button
                  className={`ctrl ${cameraOn ? '' : 'on'}`}
                  onClick={toggleCamera}
                  aria-label="camera"
                  title={t('camera')}
                >
                  <Icon name={cameraOn ? 'camera' : 'cameraOff'} size={22} />
                </button>
                <button className="ctrl" onClick={() => void switchCamera()} aria-label="switch camera">
                  <Icon name="switchCam" size={22} />
                </button>
              </>
            ) : null}
            <button className="ctrl ctrl-reject" onClick={() => void end()} aria-label="end">
              <Icon name="phoneOff" size={24} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
