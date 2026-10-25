# Credits — photographic game sprites (Ludo & Domino)

Real photographs used as the board, table, piece and die sprites of the web game tables
(`web/src/styles.css`, section 13) instead of CSS-drawn graphics. All source files come from
Wikimedia Commons with a free licence (shown per file); the licence travels with the file.
No AI-generated imagery: only real, freely licensed photographs.

| Sprite | Commons file | Licence | Author | Source |
| --- | --- | --- | --- | --- |
| `board-wood.jpg` | Seamless Beech.jpg | CC BY-SA 4.0 | Cbobdude | https://commons.wikimedia.org/wiki/File:Seamless_Beech.jpg |
| `board-surface.jpg` | Pergament.1.jpg | CC0 | Membeth | https://commons.wikimedia.org/wiki/File:Pergament.1.jpg |
| `hub.jpg` | Ludo-3.jpg | Attribution only (any use permitted, attribution required) | Micha L. Rieser | https://commons.wikimedia.org/wiki/File:Ludo-3.jpg |
| `pawn-red.png`, `pawn-green.png`, `pawn-blue.png`, `pawn-yellow.png` | Spielfiguren (surreal) -- 2021 -- 8820.jpg | CC BY-SA 4.0 | Dietmar Rabich | https://commons.wikimedia.org/wiki/File:Spielfiguren_(surreal)_--_2021_--_8820.jpg |
| `ivory.jpg` | Cream ivory speckled flecked clean marble seamless square tiled floor paving texture.jpg | CC0 | Sisters.seamless | https://commons.wikimedia.org/wiki/File:Cream_ivory_speckled_flecked_clean_marble_seamless_square_tiled_floor_paving_texture.jpg |
| `domino-felt.jpg` | Baize closeup.jpg | CC BY-SA 4.0 | SMcCandlish | https://commons.wikimedia.org/wiki/File:Baize_closeup.jpg |

## Derivations

Every file above is a crop and/or re-encode of its Commons original, so the CC BY-SA 4.0
files stay under CC BY-SA 4.0. What was done:

- `board-wood.jpg` — the wood band of the beech texture, warmed and darkened; the ludo frame.
- `board-surface.jpg` — parchment, lifted to a cream board surface; the ludo playing field.
- `hub.jpg` — the centre rosette cropped from a real top-down ludo photograph and rotated a quarter
  turn so its red and green wedges point at this board's red (left) and green (top) arms; the hub.
- `pawn-*.png` — each pawn cut out of the row of plastic pawns with a soft alpha matte and its
  saturation raised, keeping the colours the photograph shows (red, green, blue, yellow are the
  four seats); the ludo tokens.
- `ivory.jpg` — cream marble, brightened; the domino tiles and the die body.
- `domino-felt.jpg` — the green baize as photographed; the domino table surface.

Not sprites: the pips printed on the dominoes and on the die, and the safe-square star on the
ludo track, carry game state and stay CSS-drawn (`pipsFor` in `web/src/lib/pips.js`).
