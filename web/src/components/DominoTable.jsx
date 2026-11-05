import { pipsFor } from '../lib/pips.js'

/** نصف القطعة: نقاط حقيقية في شبكة 3×3 بدل الأرقام. */
function Half({ value }) {
  return (
    <span className="dom-half">
      {pipsFor(value).map((on, index) => (
        <span key={index} className={on ? 'dom-pip dom-pip-on' : 'dom-pip'} />
      ))}
    </span>
  )
}

/** Domino table: the shared chain plus the player's own tiles. */
function Tile({ tile, highlighted }) {
  const [a, b] = tile
  return (
    <span className={`dom-tile${highlighted ? ' dom-tile-matching' : ''}`} data-value={`${a}-${b}`}>
      <Half value={a} />
      <span className="dom-tile-divider" />
      <Half value={b} />
    </span>
  )
}

export default function DominoTable({ state, mySeat, legal, onPlay, onDraw, onPass }) {
  if (!state?.players) return <p className="muted">…</p>
  const board = state.board || []
  const ends = board.length ? [board[0][0], board[board.length - 1][1]] : null
  const me = state.players.find((player) => player.seat === mySeat)
  const others = state.players.filter((player) => player.seat !== mySeat)
  const myTurn = state.turn === mySeat && state.phase === 'playing'
  const playable = new Map((legal || []).map((move) => [move.tile, move.sides || []]))

  return (
    <div className="domino-wrap">
      <div className="row wrap" data-testid="domino-opponents">
        {others.map((player) => (
          <span className="chip" key={player.seat}>
            {player.user?.display_name || player.user?.username}: {player.hand_count ?? player.hand?.length ?? 0} قطعة · {player.score} نقطة
          </span>
        ))}
        <span className="chip chip-gold">الجولة {state.round} · الهدف {state.target}</span>
        <span className="chip">المخزن: {state.boneyard_count ?? 0}</span>
      </div>

      <div className="domino-board card glass" data-testid="domino-board">
        {board.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            بانتظار أول قطعة من صاحب أعلى دبل…
          </p>
        ) : (
          <div className="domino-chain">
            {board.map((tile, index) => (
              <Tile
                key={`${tile[0]}-${tile[1]}-${index}`}
                tile={tile}
                highlighted={index === 0 || index === board.length - 1}
              />
            ))}
          </div>
        )}
        {ends ? (
          <p className="muted" style={{ margin: '10px 0 0' }}>
            الأطراف المفتوحة: {ends[0]} و {ends[1]}
          </p>
        ) : null}
      </div>

      <h3 className="section-title">قطعك {me ? `(${me.hand?.length ?? 0})` : ''}</h3>
      <div className="domino-hand" data-testid="domino-hand">
        {(me?.hand || []).map((tile, index) => {
          const sides = playable.get(index) || []
          const allowed = sides.length > 0
          return (
            <div className="domino-hand-item" key={`${tile[0]}-${tile[1]}-${index}`}>
              <button
                type="button"
                className="domino-tile-button"
                disabled={!allowed || !myTurn}
                data-testid={`domino-tile-${index}`}
                onClick={() => allowed && onPlay(index, sides[0])}
              >
                <Tile tile={tile} highlighted={allowed && myTurn} />
              </button>
              {allowed && myTurn && sides.length > 1 ? (
                <span className="domino-side-buttons">
                  <button
                    type="button"
                    className="btn btn-small"
                    data-testid={`domino-tile-${index}-left`}
                    onClick={() => onPlay(index, 'left')}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    className="btn btn-small"
                    data-testid={`domino-tile-${index}-right`}
                    onClick={() => onPlay(index, 'right')}
                  >
                    ▶
                  </button>
                </span>
              ) : null}
            </div>
          )
        })}
      </div>

      {myTurn && (legal || []).length === 0 ? (
        <div className="row wrap" style={{ marginTop: 12 }}>
          <button type="button" className="btn" data-testid="domino-draw" onClick={onDraw} disabled={!state.boneyard_count}>
            سحب قطعة
          </button>
          <button type="button" className="btn" data-testid="domino-pass" onClick={onPass} disabled={Boolean(state.boneyard_count)}>
            تمرير الدور
          </button>
        </div>
      ) : null}
    </div>
  )
}
