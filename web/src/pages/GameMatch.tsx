import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { Avatar, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { useGameVoice } from '../lib/gameVoice';
import {
  GAME_EMOJIS,
  type GameMessage,
  type MatchDetail,
  type MatchState,
  type StoneColor,
} from '../lib/gameTypes';
import { GameBoard, type BoardAnimation } from '../components/game/GameBoard';
import { GameChat } from '../components/game/GameChat';
import { GameWinner } from '../components/game/GameWinner';
import { CurrencyIcon } from '../components/CurrencyIcon';

function clockText(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export default function GameMatch() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const { on, send } = useRealtime();
  const toast = useToast();

  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [state, setState] = useState<MatchState | null>(null);
  const stateRef = useRef<MatchState | null>(null);
  const [animation, setAnimation] = useState<BoardAnimation | null>(null);
  const pendingRef = useRef<MatchState | null>(null);
  const [messages, setMessages] = useState<GameMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [ended, setEnded] = useState<{
    winnerId: string | null;
    refunded: boolean;
    scores: Record<StoneColor, number>;
  } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const chatOpenRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const payload = await api<MatchDetail>(`/game/matches/${id}`);
      setDetail(payload);
      setMessages(payload.messages);
      const next = payload.match.state as MatchState;
      if (Array.isArray(next?.stones)) {
        setState(next);
        stateRef.current = next;
      }
      if (payload.match.status === 'playing') setEnded(null);
      if (payload.match.status === 'finished') {
        const finalState = payload.match.state as MatchState;
        setEnded({
          winnerId: payload.match.winnerId,
          refunded: false,
          scores: finalState?.scores ?? { white: 0, black: 0 },
        });
      }
    } catch (error) {
      toast.push((error as Error).message, 'error');
      navigate('/game');
    }
  }, [id, toast, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (chatOpen) setUnread(0);
  }, [chatOpen]);

  useEffect(() => {
    const offShot = on('game:shot', (data) => {
      if (String(data.matchId) !== id) return;
      const current = stateRef.current;
      if (!current) return;
      setAnimation({
        frames: data.frames as number[][],
        stones: current.stones,
        striker: current.striker,
        frameMs: Number(data.frameMs) || undefined,
      });
      pendingRef.current = data.state as MatchState;
    });
    const offMessage = on('game:message', (data) => {
      if (String(data.matchId) !== id) return;
      const message = data.message as GameMessage;
      setMessages((list) => [...list, message]);
      if (!chatOpenRef.current && message.userId !== me?.user.id) setUnread((count) => count + 1);
    });
    const offEnd = on('game:ended', (data) => {
      if (String(data.matchId) !== id) return;
      const scores = (data.scores as Record<StoneColor, number> | undefined) ?? stateRef.current?.scores;
      setEnded({
        winnerId: (data.winnerId as string | null) ?? null,
        refunded: Boolean(data.refunded),
        scores: scores ?? { white: 0, black: 0 },
      });
      void load();
    });
    const offMatched = on('game:matched', () => {
      void load();
    });
    return () => {
      offShot();
      offMessage();
      offEnd();
      offMatched();
    };
  }, [on, id, me?.user.id, load]);

  const handleAnimationEnd = useCallback(() => {
    if (pendingRef.current) {
      setState(pendingRef.current);
      stateRef.current = pendingRef.current;
      pendingRef.current = null;
    }
    setAnimation(null);
  }, []);

  useEffect(() => {
    if (!detail?.match.startedAt || detail.match.status !== 'playing') return;
    const started = new Date(detail.match.startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, (Date.now() - started) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [detail?.match.startedAt, detail?.match.status]);

  const players = detail?.players ?? [];
  const myPlayer = players.find((player) => player.userId === me?.user.id) ?? null;
  const opponent = players.find((player) => player.userId !== me?.user.id) ?? null;
  const myColor = detail?.myColor ?? null;
  const myTurn = Boolean(state && myColor && state.turn === myColor && !ended);

  const voice = useGameVoice({ matchId: id, opponentId: opponent?.userId ?? null, on, send });

  useEffect(() => {
    if (voice.error) toast.push(voice.error, 'error');
  }, [voice.error, toast]);

  const shoot = async (shot: { x: number; angle: number; power: number }) => {
    if (busy || !myTurn) return;
    setBusy(true);
    try {
      await api(`/game/matches/${id}/shoot`, { method: 'POST', body: shot });
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendText = async (body: string) => {
    try {
      await api(`/game/matches/${id}/messages`, { method: 'POST', body: { kind: 'text', body } });
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const sendEmoji = async (emoji: string) => {
    try {
      await api(`/game/matches/${id}/messages`, { method: 'POST', body: { kind: 'emoji', body: emoji } });
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const leave = async () => {
    if (detail?.match.status === 'playing' && !window.confirm('مغادرة المباراة؟ ستُحسب خسارة وتخسر رسوم الدخول.')) {
      return;
    }
    try {
      await api(`/game/matches/${id}/leave`, { method: 'POST' });
    } catch {
      // Leaving an already-finished match is fine.
    }
    voice.stop();
    navigate('/game');
  };

  const report = async () => {
    if (!opponent) return;
    try {
      await api(`/game/matches/${id}/report`, {
        method: 'POST',
        body: { targetId: opponent.userId, reason },
      });
      setReportOpen(false);
      setReason('');
      toast.push('تم إرسال البلاغ إلى الإدارة', 'success');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    }
  };

  const rematch = async () => {
    try {
      const result = await api<{ matchId: string; status: string }>('/game/queue', {
        method: 'POST',
        body: { fee: detail?.match.entryFee },
      });
      navigate(result.status === 'playing' ? `/game/${result.matchId}` : '/game');
    } catch (error) {
      toast.push((error as Error).message, 'error');
      navigate('/game');
    }
  };

  if (!detail) {
    return (
      <div className="game-match-screen">
        <Spinner label="جاري فتح المباراة…" />
      </div>
    );
  }

  const waiting = detail.match.status === 'waiting';
  const winner = ended?.winnerId ? players.find((player) => player.userId === ended.winnerId) ?? null : null;

  return (
    <div className="game-match-screen" dir="rtl">
      <header className="gm-top">
        <button type="button" className="gm-icon-btn" onClick={() => void leave()} aria-label="رجوع">
          <Icon name="arrowLeft" size={17} />
        </button>

        <div className={`gm-player ${myTurn ? 'live' : ''}`}>
          <span className={`gm-avatar ${voice.speaking ? 'speaking' : ''}`}>
            <Avatar user={myPlayer ?? null} size={42} />
          </span>
          <span className="gm-player-copy">
            <b>{myPlayer?.displayName ?? 'أنت'}</b>
            <span className="gm-score">{state?.scores[myColor ?? 'white'] ?? myPlayer?.score ?? 0}</span>
          </span>
        </div>

        <div className="gm-center">
          <span className="gm-clock">{clockText(elapsed)}</span>
          <span className={`gm-turn ${myTurn ? 'mine' : ''}`}>
            {waiting ? 'بانتظار المنافس' : ended ? 'انتهت' : myTurn ? 'دورك الآن' : 'دور الخصم'}
          </span>
        </div>

        <div className={`gm-player opponent ${!myTurn && !ended ? 'live' : ''}`}>
          <span className={`gm-avatar ${voice.remoteSpeaking ? 'speaking' : ''}`}>
            <Avatar user={opponent ?? null} size={42} />
          </span>
          <span className="gm-player-copy">
            <b>{opponent?.displayName ?? 'بانتظار…'}</b>
            <span className="gm-score">
              {state?.scores[myColor === 'white' ? 'black' : 'white'] ?? opponent?.score ?? 0}
            </span>
          </span>
        </div>

        <button type="button" className="gm-icon-btn" onClick={() => setReportOpen(true)} aria-label="إبلاغ">
          <Icon name="alert" size={16} />
        </button>
      </header>

      {waiting ? (
        <div className="gm-waiting">
          <Spinner label="بانتظار انضمام صديقك…" />
          {detail.match.code ? (
            <div className="game-code">
              <span className="tiny muted">كود الغرفة</span>
              <b>{detail.match.code}</b>
            </div>
          ) : null}
          <p className="tiny muted">تُخصم رسوم الدخول عند بدء المباراة فقط.</p>
        </div>
      ) : state ? (
        <GameBoard
          state={state}
          myColor={myColor}
          disabled={Boolean(ended) || busy}
          animation={animation}
          onAnimationEnd={handleAnimationEnd}
          onShoot={(shot) => void shoot(shot)}
        />
      ) : (
        <Spinner label="جاري تحميل الساحة…" />
      )}

      {!waiting ? (
        <div className="gm-hint">
          {ended
            ? 'انتهت المباراة'
            : myTurn
              ? 'اسحب إصبعك من الكرة الذهبية لتحديد الاتجاه والقوة ثم اتركه'
              : 'بانتظار ضربة الخصم…'}
        </div>
      ) : null}

      <div className="gm-controls">
        <button type="button" className="gm-ctrl" onClick={() => setChatOpen(true)}>
          <span className="gm-ctrl-icon">
            <Icon name="chat" size={20} />
            {unread > 0 ? <span className="gm-badge">{unread > 9 ? '9+' : unread}</span> : null}
          </span>
          الدردشة
        </button>
        <button type="button" className="gm-ctrl" onClick={() => setChatOpen(true)}>
          <span className="gm-ctrl-icon">{GAME_EMOJIS[0]}</span>
          إيموجيات
        </button>
        <button
          type="button"
          className={`gm-ctrl ${voice.active && !voice.muted ? 'on' : ''}`}
          onClick={() => {
            if (!voice.active) void voice.start();
            else voice.toggleMute();
          }}
          disabled={voice.starting || !opponent}
        >
          <span className="gm-ctrl-icon">
            <Icon name={voice.active && !voice.muted ? 'mic' : voice.active ? 'micOff' : 'mic'} size={20} />
          </span>
          {voice.active ? (voice.muted ? 'المايك مكتوم' : 'المايك يعمل') : 'تشغيل المايك'}
        </button>
        <button
          type="button"
          className={`gm-ctrl ${voice.remoteMuted ? 'on' : ''}`}
          onClick={() => voice.toggleRemoteMute()}
          disabled={!voice.active}
        >
          <span className="gm-ctrl-icon">
            <Icon name={voice.remoteMuted ? 'volumeOff' : 'volume'} size={20} />
          </span>
          {voice.remoteMuted ? 'الخصم مكتوم' : 'كتم الخصم'}
        </button>
        <button type="button" className="gm-ctrl danger" onClick={() => void leave()}>
          <span className="gm-ctrl-icon">
            <Icon name="logout" size={20} />
          </span>
          مغادرة
        </button>
      </div>

      {ended ? (
        <GameWinner
          winner={winner}
          meId={me?.user.id ?? ''}
          prize={detail.match.prize}
          refunded={ended.refunded}
          scores={ended.scores}
          onRematch={() => void rematch()}
          onHome={() => navigate('/')}
        />
      ) : null}

      <GameChat
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={messages}
        meId={me?.user.id ?? ''}
        players={players}
        onSendText={sendText}
        onSendEmoji={sendEmoji}
        onReport={() => {
          setChatOpen(false);
          setReportOpen(true);
        }}
      />

      <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title="الإبلاغ عن اللاعب">
        <div className="game-join" dir="rtl">
          <textarea
            className="input"
            rows={3}
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="اكتب سبب البلاغ…"
          />
          <button type="button" className="btn btn-gold" disabled={!reason.trim()} onClick={() => void report()}>
            إرسال البلاغ
          </button>
        </div>
      </Sheet>

      <div className="gm-fee">
        <CurrencyIcon code="GOLD" size={13} /> رسوم {detail.match.entryFee} • الجائزة{' '}
        {detail.match.prize}
      </div>
    </div>
  );
}
