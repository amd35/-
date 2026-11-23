import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { Avatar, formatCoins, Icon, Sheet, Spinner, useToast } from '../lib/ui';
import { AppShell } from '../components/AppShell';
import { CurrencyIcon } from '../components/CurrencyIcon';
import type { GameSnapshot } from '../lib/gameTypes';

/** «أم الحجار» lobby: black-and-gold stage, entry fee, real players only. */
export default function Game() {
  const { me } = useAuth();
  const { on } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState<GameSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [fee, setFee] = useState(1000);
  const [waiting, setWaiting] = useState<{ code: string | null; fee: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const load = useCallback(async () => {
    try {
      const snapshot = await api<GameSnapshot>('/game');
      setData(snapshot);
      setFee((current) => {
        if (current < snapshot.settings.minEntry || current > snapshot.settings.maxEntry) {
          return snapshot.settings.entryFee;
        }
        return current;
      });
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const off = on('game:matched', (event) => {
      const matchId = String(event.matchId || '');
      if (matchId) navigate(`/game/${matchId}`);
    });
    const offEnd = on('game:ended', () => {
      void load();
    });
    return () => {
      off();
      offEnd();
    };
  }, [on, navigate, load]);

  const settings = data?.settings;
  const gold = data?.gold ?? 0;
  const prize = useMemo(() => {
    if (!settings) return 0;
    const pot = fee * 2;
    return pot - Math.floor((pot * settings.appPercent) / 100);
  }, [fee, settings]);

  const step = settings ? Math.max(100, Math.round((settings.maxEntry - settings.minEntry) / 10 / 500) * 500) : 500;

  const play = async () => {
    if (busy) return;
    if (gold < fee) {
      toast.push('رصيد الذهب لا يكفي لرسوم الدخول', 'error');
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ matchId: string; status: string; code: string | null }>('/game/queue', {
        method: 'POST',
        body: { fee },
      });
      if (result.status === 'playing') {
        navigate(`/game/${result.matchId}`);
        return;
      }
      setWaiting({ code: null, fee });
      toast.push('جاري البحث عن منافس حقيقي…', 'info');
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const createRoom = async () => {
    if (busy) return;
    if (gold < fee) {
      toast.push('رصيد الذهب لا يكفي لرسوم الدخول', 'error');
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ matchId: string; status: string; code: string | null }>('/game/rooms', {
        method: 'POST',
        body: { fee },
      });
      if (result.status === 'playing') {
        navigate(`/game/${result.matchId}`);
        return;
      }
      setWaiting({ code: result.code, fee });
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const joinByCode = async (code: string) => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const result = await api<{ matchId: string; status: string }>('/game/rooms/join', {
        method: 'POST',
        body: { code: code.trim() },
      });
      setJoinOpen(false);
      setJoinCode('');
      navigate(`/game/${result.matchId}`);
    } catch (error) {
      toast.push((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancelWaiting = async () => {
    setWaiting(null);
    try {
      await api('/game/queue', { method: 'DELETE' });
    } catch {
      // The lobby was already gone on the server.
    }
  };

  const invite = async () => {
    const url = `${window.location.origin}/game`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'أم الحجار', text: 'تعال نلعب أم الحجار معاً!', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.push('تم نسخ رابط اللعبة — شاركه مع أصدقائك', 'success');
    } catch {
      toast.push(url, 'info');
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.push('تم نسخ كود الغرفة', 'success');
    } catch {
      toast.push(`كود الغرفة: ${code}`, 'info');
    }
  };

  return (
    <AppShell title="أم الحجار" subtitle="لعبة الحجارة الأسطورية" active="games">
      <div className="page game-page" dir="rtl">
        <section className="game-hero">
          <span className="game-hero-crown" aria-hidden="true">
            👑
          </span>
          <h1>أم الحجار</h1>
          <p className="game-hero-sub">لعبة الحجارة الرائعة — أونلاين مع لاعبين حقيقيين</p>
          <div className="game-hero-board" aria-hidden="true">
            <span className="game-hero-ring" />
            <span className="game-hero-stone white s1" />
            <span className="game-hero-stone black s2" />
            <span className="game-hero-stone white s3" />
            <span className="game-hero-stone black s4" />
            <span className="game-hero-stone white s5" />
            <span className="game-hero-stone gold s6" />
          </div>
          <span className="game-hero-tagline">العب مع أصدقائك الحقيقيين</span>
        </section>

        {loading && !data ? (
          <Spinner label="جاري تحميل اللعبة…" />
        ) : !settings?.enabled ? (
          <section className="game-panel">
            <p className="game-offline">اللعبة متوقفة مؤقتاً من الإدارة — عاود المحاولة لاحقاً.</p>
          </section>
        ) : (
          <>
            <section className="game-player-card">
              <Avatar user={me?.user ?? null} size={54} />
              <div className="game-player-copy">
                <span className="game-player-name">{me?.user?.displayName}</span>
                <span className="game-player-level">
                  المستوى {me?.level?.level ?? 1} • {data?.stats.wins ?? 0} فوز
                </span>
              </div>
              <div className="game-gold">
                <CurrencyIcon code="GOLD" size={20} />
                <span>{formatCoins(gold)}</span>
              </div>
            </section>

            <div className="game-online">
              <span className="game-online-dot" aria-hidden="true" />
              {data?.online ?? 0} لاعب متصل الآن
            </div>

            {data?.active ? (
              <section className="game-panel game-resume">
                <div>
                  <b>لديك مباراة {data.active.status === 'playing' ? 'جارية' : 'بانتظار منافس'}</b>
                  <span className="tiny muted">
                    {data.active.mode === 'private' ? 'غرفة خاصة' : 'مباراة سريعة'} • {data.active.fee} ذهب
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={() => navigate(`/game/${data.active!.matchId}`)}
                >
                  متابعة
                </button>
              </section>
            ) : waiting ? (
              <section className="game-panel game-waiting">
                <Spinner label={waiting.code ? 'بانتظار انضمام صديقك…' : 'جاري البحث عن منافس حقيقي…'} />
                {waiting.code ? (
                  <button type="button" className="game-code" onClick={() => void copyCode(waiting.code!)}>
                    <span className="tiny muted">كود الغرفة</span>
                    <b>{waiting.code}</b>
                    <Icon name="copy" size={15} />
                  </button>
                ) : null}
                <button type="button" className="btn btn-ghost" onClick={() => void cancelWaiting()}>
                  إلغاء
                </button>
              </section>
            ) : (
              <section className="game-panel game-entry">
                <div className="game-entry-head">
                  <span>رسوم الدخول</span>
                  <div className="game-fee">
                    <button
                      type="button"
                      onClick={() => setFee((value) => Math.max(settings.minEntry, value - step))}
                      aria-label="تقليل"
                    >
                      −
                    </button>
                    <span className="game-fee-value">
                      <CurrencyIcon code="GOLD" size={18} /> {formatCoins(fee)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFee((value) => Math.min(settings.maxEntry, value + step))}
                      aria-label="زيادة"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="game-entry-meta">
                  <span>الجائزة للفائز</span>
                  <b>
                    <CurrencyIcon code="GOLD" size={15} /> {formatCoins(prize)}
                  </b>
                </div>
                <p className="game-entry-hint">
                  {settings.minEntry} — {settings.maxEntry} ذهب • نسبة التطبيق {settings.appPercent}%
                </p>
                <button
                  type="button"
                  className="game-play-btn"
                  disabled={busy}
                  onClick={() => void play()}
                >
                  ابدأ اللعب ▶
                </button>
                <div className="game-secondary-actions">
                  <button type="button" onClick={() => void createRoom()} disabled={busy}>
                    <Icon name="users" size={15} /> غرفة خاصة
                  </button>
                  <button type="button" onClick={() => setJoinOpen(true)}>
                    <Icon name="plus" size={15} /> الانضمام بكود
                  </button>
                  <button type="button" onClick={() => void invite()}>
                    <Icon name="send" size={15} /> دعوة الأصدقاء
                  </button>
                </div>
              </section>
            )}

            {data?.openRooms.length ? (
              <section className="game-panel">
                <h3 className="game-panel-title">غرف بانتظار منافس</h3>
                <ul className="game-rooms">
                  {data.openRooms.map((room) => (
                    <li key={room.id}>
                      <Avatar user={{ displayName: room.hostName, avatarUrl: room.hostAvatar }} size={34} />
                      <span className="game-room-main">
                        <b>{room.hostName}</b>
                        <span className="tiny muted">
                          <CurrencyIcon code="GOLD" size={12} /> {formatCoins(room.entryFee)} ذهب
                        </span>
                      </span>
                      <button type="button" className="btn btn-gold btn-sm" onClick={() => void joinByCode(room.code)}>
                        انضم
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="game-panel">
              <h3 className="game-panel-title">سجل مبارياتي</h3>
              {data?.history.length ? (
                <ul className="game-history">
                  {data.history.map((match) => (
                    <li key={match.id}>
                      <span className={`game-history-badge ${match.won ? 'won' : 'lost'}`}>
                        {match.won ? 'فوز' : 'خسارة'}
                      </span>
                      <Avatar user={match.opponent} size={30} />
                      <span className="game-room-main">
                        <b>{match.opponent.displayName}</b>
                        <span className="tiny muted">
                          {match.endedAt ? new Date(match.endedAt).toLocaleDateString('ar-IQ') : ''}
                        </span>
                      </span>
                      <span className={`game-history-gold ${match.won ? 'won' : ''}`}>
                        {match.won ? `+${formatCoins(match.prize)}` : `-${formatCoins(match.entryFee)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="tiny muted">لا مباريات بعد — العب أول مباراة لتدخل السجل.</p>
              )}
            </section>

            <section className="game-panel">
              <h3 className="game-panel-title">أفضل اللاعبين</h3>
              {data?.leaderboard.length ? (
                <ul className="game-leaderboard">
                  {data.leaderboard.map((entry) => (
                    <li key={entry.userId}>
                      <span className="game-rank">{entry.rank}</span>
                      <Avatar user={entry} size={30} />
                      <span className="game-room-main">
                        <b>{entry.displayName}</b>
                        <span className="tiny muted">{entry.played} مباراة</span>
                      </span>
                      <span className="game-wins">{entry.wins} فوز</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="tiny muted">الترتيب يُفتح مع أول مباراة منتهية.</p>
              )}
            </section>

            <p className="game-rules">
              مباريات حقيقية فقط بين لاعبين متصلين — لا بوتات ولا لاعبين وهميين. تُخصم رسوم الدخول من رصيد
              الذهب عند بدء المباراة وتُعاد تلقائياً إذا لم تبدأ.
            </p>
          </>
        )}
      </div>

      <Sheet open={joinOpen} onClose={() => setJoinOpen(false)} title="الانضمام بكود الغرفة">
        <div className="game-join" dir="rtl">
          <input
            className="input"
            inputMode="numeric"
            maxLength={6}
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, ''))}
            placeholder="مثال: 482913"
          />
          <button
            type="button"
            className="btn btn-gold"
            disabled={busy || joinCode.length !== 6}
            onClick={() => void joinByCode(joinCode)}
          >
            انضم للمباراة
          </button>
        </div>
      </Sheet>
    </AppShell>
  );
}
