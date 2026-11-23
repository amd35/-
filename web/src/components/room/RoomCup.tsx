import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useRealtime } from '../../lib/realtime';
import { Avatar, formatCoins, Sheet } from '../../lib/ui';
import { CurrencyIcon } from '../CurrencyIcon';

type CupPeriod = 'daily' | 'weekly' | 'monthly';

interface CupStanding {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  coins: number;
  gifts: number;
}

interface CupWinner extends CupStanding {
  prize: number;
}

interface CupSnapshot {
  enabled: boolean;
  period: CupPeriod;
  ownerPercent: number;
  adminPercent: number;
  prizes: number[];
  owner: { id: string; displayName: string; avatarUrl: string | null } | null;
  competition: {
    id: string;
    period: CupPeriod;
    startsAt: string;
    endsAt: string;
    status: 'open' | 'closed';
  } | null;
  standings: CupStanding[];
  myRank: number | null;
  totalCoins: number;
  totalGifts: number;
  /** Diamonds spent inside the room, all time. */
  diamondsSpent: number;
  history: { id: string; period: CupPeriod; startsAt: string; endsAt: string; winners: CupWinner[] }[];
}

const PERIOD_LABEL: Record<CupPeriod, string> = {
  daily: 'مسابقة يومية',
  weekly: 'مسابقة أسبوعية',
  monthly: 'مسابقة شهرية',
};

const RANK_ART = ['🏆', '🥈', '🥉'];

function remainingLabel(endsAt: string | undefined, now: number): string {
  if (!endsAt) return '';
  const diff = Math.max(0, new Date(endsAt).getTime() - now);
  const seconds = Math.floor(diff / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days} يوم ${hours} ساعة`;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Golden room cup: a compact stage bar plus a details sheet with the live
 * ranking, prizes and past winners. It refreshes on every room gift.
 */
export function RoomCup({ roomId }: { roomId: string }) {
  const { on } = useRealtime();
  const [data, setData] = useState<CupSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setData(await api<CupSnapshot>(`/rooms/${roomId}/cup`));
    } catch {
      setData(null);
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const off = on('room_cup', (event) => {
      if (event.roomId === roomId) void load();
    });
    return off;
  }, [on, roomId, load]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Keep the open sheet fresh when a gift lands while the user is reading it.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!data?.enabled) return null;

  const remaining = remainingLabel(data.competition?.endsAt, now);
  const podium = data.standings.slice(0, 3);

  return (
    <>
      <button type="button" className="room-cup-fab" onClick={() => setOpen(true)} aria-label="كأس الغرفة">
        <span className="room-cup-fab-glow" aria-hidden="true" />
        <img className="room-cup-fab-art" src="/cup/room-cup.png" alt="" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="🏆 كأس الغرفة">
        <div className="cup-panel" dir="rtl">
          <div className="cup-diamonds">
            <span className="cup-diamonds-shine" aria-hidden="true" />
            <span className="cup-diamonds-icon">
              <CurrencyIcon code="DIAMOND" size={30} />
            </span>
            <span className="cup-diamonds-copy">
              <span className="cup-diamonds-label">الألماس المنفَق في الغرفة</span>
              <span className="cup-diamonds-value">{formatCoins(data.diamondsSpent)}</span>
            </span>
            <span className="cup-diamonds-spark cup-diamonds-spark-a" aria-hidden="true" />
            <span className="cup-diamonds-spark cup-diamonds-spark-b" aria-hidden="true" />
          </div>

          <div className="cup-hero">
            <div className="cup-hero-art-wrap">
              <img className="cup-hero-art" src="/cup/room-cup.png" alt="كأس الغرفة الذهبي" />
              <span className="cup-hero-spark cup-hero-spark-a" aria-hidden="true" />
              <span className="cup-hero-spark cup-hero-spark-b" aria-hidden="true" />
              <span className="cup-hero-spark cup-hero-spark-c" aria-hidden="true" />
            </div>
            <div className="cup-hero-info">
              <span className="cup-hero-kicker">{PERIOD_LABEL[data.competition?.period ?? data.period]}</span>
              <span className="cup-hero-owner">
                <span className="cup-hero-owner-label">صاحب الغرفة</span>
                <span className="cup-hero-owner-name">
                  {data.owner ? (
                    <>
                      <Avatar user={data.owner} size={22} />
                      {data.owner.displayName}
                    </>
                  ) : (
                    'بدون مالك'
                  )}
                </span>
              </span>
              <span className="cup-hero-split">
                {data.ownerPercent}% لصاحب الغرفة • {data.adminPercent}% للإدارة العامة
              </span>
              <span className="cup-hero-stats">
                <span>
                  إجمالي الذهب <b>{formatCoins(data.totalCoins)}</b>
                </span>
                <span>
                  الهدايا <b>{formatCoins(data.totalGifts)}</b>
                </span>
              </span>
              {data.competition ? (
                <span className="cup-hero-countdown">
                  ⏳ ينتهي خلال <b>{remaining}</b>
                </span>
              ) : null}
            </div>
          </div>

          <div className="cup-prizes">
            {[0, 1, 2].map((index) => (
              <div key={index} className={`cup-prize cup-prize-${index + 1}`}>
                <span className="cup-prize-art">{RANK_ART[index]}</span>
                <span className="cup-prize-label">المركز {['الأول', 'الثاني', 'الثالث'][index]}</span>
                <span className="cup-prize-value">{formatCoins(data.prizes[index] ?? 0)} ذهب</span>
              </div>
            ))}
          </div>

          <div className="cup-podium">
            {[1, 0, 2].map((slot) => {
              const entry = podium[slot];
              return (
                <div
                  key={slot}
                  className={`cup-podium-item cup-podium-${slot + 1} ${entry ? '' : 'empty'}`}
                >
                  <span className="cup-podium-art">{RANK_ART[slot]}</span>
                  {entry ? (
                    <>
                      <Avatar user={entry} size={44} />
                      <span className="cup-podium-name">{entry.displayName}</span>
                      <span className="cup-podium-coins">{formatCoins(entry.coins)} ذهب</span>
                    </>
                  ) : (
                    <span className="cup-podium-empty">بانتظار المتسابقين</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="cup-section">
            <div className="cup-section-head">
              <h4>ترتيب إنفاق الذهب</h4>
              {data.myRank ? <span className="cup-my-rank">مركزك: {data.myRank}</span> : null}
            </div>
            {data.standings.length ? (
              <ul className="cup-list">
                {data.standings.map((entry) => (
                  <li
                    key={entry.userId}
                    className={`cup-list-row ${entry.rank <= 3 ? `top-${entry.rank}` : ''} ${
                      data.myRank === entry.rank ? 'mine' : ''
                    }`}
                  >
                    <span className="cup-list-rank">{RANK_ART[entry.rank - 1] ?? entry.rank}</span>
                    <Avatar user={entry} size={34} />
                    <span className="cup-list-name">{entry.displayName}</span>
                    <span className="cup-list-coins">{formatCoins(entry.coins)} ذهب</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cup-empty">لا يوجد إنفاق ذهب في هذه المسابقة بعد — أرسل هدية لدخول الترتيب.</p>
            )}
          </div>

          <div className="cup-section">
            <div className="cup-section-head">
              <h4>سجل الفائزين السابقين</h4>
            </div>
            {data.history.length ? (
              <ul className="cup-history">
                {data.history.map((competition) => (
                  <li key={competition.id} className="cup-history-item">
                    <span className="cup-history-date">
                      {new Date(competition.endsAt).toLocaleDateString('ar-IQ')}
                    </span>
                    <span className="cup-history-winners">
                      {competition.winners.length
                        ? competition.winners
                            .map((winner) => `${RANK_ART[winner.rank - 1]} ${winner.displayName}`)
                            .join(' • ')
                        : 'لا فائزين'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cup-empty">لم تنتهِ أي مسابقة بعد — الفائزون سيظهرون هنا تلقائياً.</p>
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}
