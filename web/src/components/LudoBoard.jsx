import { useMemo } from 'react'

/** The Ludo board: 15x15 cells, tokens placed from the server board geometry. */
export default function LudoBoard({ geometry, state, mySeat, legal, onMove }) {
  const map = useMemo(() => {
    const cells = new Map()
    const set = (row, col, patch) => {
      const key = `${row}-${col}`
      cells.set(key, { ...(cells.get(key) || {}), ...patch })
    }
    if (!geometry) return cells
    geometry.track.forEach(([row, col], index) => set(row, col, { kind: 'track', index }))
    Object.entries(geometry.home_columns).forEach(([seat, list]) => {
      list.forEach(([row, col], index) => set(row, col, { kind: 'home', seat: Number(seat), index }))
    })
    Object.entries(geometry.starts).forEach(([seat, index]) => {
      const [row, col] = geometry.track[index]
      set(row, col, { start: Number(seat) })
    })
    geometry.safe.forEach((index) => {
      const [row, col] = geometry.track[index]
      set(row, col, { safe: true })
    })
    if (geometry.yards?.[0]) {
      Object.entries(geometry.yards).forEach(([seat, list]) => {
        list.forEach(([row, col]) => set(row, col, { yard: Number(seat) }))
      })
    }
    for (let row = 6; row <= 8; row += 1) {
      for (let col = 6; col <= 8; col += 1) set(row, col, { kind: 'center' })
    }
    return cells
  }, [geometry])

  const tokens = useMemo(() => {
    if (!geometry || !state?.players) return []
    const list = []
    state.players.forEach((player) => {
      player.tokens.forEach((steps, tokenIndex) => {
        let cell
        if (steps === -1) cell = geometry.yards[String(player.seat)][tokenIndex % 4]
        else if (steps <= 50) cell = geometry.track[(geometry.starts[String(player.seat)] + steps) % geometry.track.length]
        else if (steps < geometry.home) cell = geometry.home_columns[String(player.seat)][steps - 51]
        else cell = [7, 7]
        const playable = player.seat === mySeat && (legal || []).some((move) => move.token === tokenIndex && move.from === steps)
        list.push({
          id: `${player.seat}-${tokenIndex}`,
          seat: player.seat,
          color: player.color,
          steps,
          cell,
          playable,
          tokenIndex,
        })
      })
    })
    return list
  }, [geometry, state, mySeat, legal])

  if (!geometry) return <p className="muted">…</p>

  const size = geometry.size
  const rows = Array.from({ length: size }, (_, index) => index)

  return (
    <div className="ludo-board" data-testid="ludo-board" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
      <span className="ludo-hub" aria-hidden="true" />
      {rows.map((row) =>
        rows.map((col) => {
          const key = `${row}-${col}`
          const meta = map.get(key) || {}
          const classes = ['ludo-cell']
          if (meta.kind === 'track') classes.push('ludo-track')
          if (meta.kind === 'home') classes.push(`ludo-home ludo-home-${meta.seat}`)
          if (meta.kind === 'center') classes.push('ludo-center')
          if (meta.yard !== undefined) classes.push(`ludo-yard ludo-yard-${meta.yard}`)
          if (meta.start !== undefined) classes.push(`ludo-start ludo-start-${meta.start}`)
          if (meta.safe) classes.push('ludo-safe')
          const here = tokens.filter((token) => token.cell[0] === row && token.cell[1] === col)
          return (
            <div key={key} className={classes.join(' ')}>
              {here.map((token, index) => (
                <button
                  key={token.id}
                  type="button"
                  className={`ludo-token ludo-token-${token.color}${token.playable ? ' ludo-token-playable' : ''}`}
                  style={{
                    transform: `translate(${(index % 2) * 55 - 27}%, ${Math.floor(index / 2) * 55 - 27}%)`,
                  }}
                  disabled={!token.playable}
                  data-testid={`ludo-token-${token.seat}-${token.tokenIndex}`}
                  onClick={() => token.playable && onMove(token.tokenIndex)}
                  aria-label={`قطعة ${token.tokenIndex + 1}`}
                />
              ))}
            </div>
          )
        }),
      )}
    </div>
  )
}
