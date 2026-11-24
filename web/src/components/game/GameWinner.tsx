import { Avatar, formatCoins, Icon } from '../../lib/ui';
import type { GamePlayer } from '../../lib/gameTypes';
import { CurrencyIcon } from '../CurrencyIcon';

interface Props {
  winner: GamePlayer | null;
  meId: string;
  prize: number;
  refunded: boolean;
  scores: Record<'white' | 'black', number>;
  onRematch: () => void;
  onHome: () => void;
}

/** End-of-match screen: winner portrait, points, gold won and the two actions. */
export function GameWinner({ winner, meId, prize, refunded, scores, onRematch, onHome }: Props) {
  const iWon = Boolean(winner && winner.userId === meId);
  return (
    <div className="game-winner-overlay" dir="rtl">
      <div className="game-winner-card">
        <span className="game-winner-crown" aria-hidden="true">
          👑
        </span>
        <span className="game-winner-title">{refunded ? 'تعادل' : iWon ? 'الفائز' : 'انتهت المباراة'}</span>

        {winner ? (
          <>
            <div className="game-winner-avatar">
              <span className="game-winner-wreath" aria-hidden="true" />
              <Avatar user={winner} size={96} />
            </div>
            <span className="game-winner-name">{winner.displayName}</span>
            <span className="game-winner-score">{winner.score} نقطة</span>
          </>
        ) : (
          <span className="game-winner-name">تعادل — أُعيدت رسوم الدخول</span>
        )}

        <div className="game-winner-scores">
          <span>
            أبيض <b>{scores.white}</b>
          </span>
          <span>
            أسود <b>{scores.black}</b>
          </span>
        </div>

        <div className={`game-winner-prize ${iWon ? 'won' : ''}`}>
          <CurrencyIcon code="GOLD" size={24} />
          <span>
            {refunded
              ? 'أُعيدت رسوم الدخول'
              : iWon
                ? `+${formatCoins(prize)} ذهب`
                : 'حظاً أوفر في المباراة القادمة'}
          </span>
        </div>

        <div className="game-winner-actions">
          <button type="button" className="btn btn-gold" onClick={onRematch}>
            <Icon name="refresh" size={16} /> مباراة جديدة
          </button>
          <button type="button" className="btn btn-ghost" onClick={onHome}>
            <Icon name="home" size={16} /> العودة للرئيسية
          </button>
        </div>
      </div>
    </div>
  );
}
