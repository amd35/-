# Credits — photographic game sprites (Ludo & Domino)

Real photographs used as the board, table, piece and die sprites of the web game tables
(`web/src/styles.css`, section 13) instead of CSS-drawn graphics. All source files come from
Wikimedia Commons with a free licence (shown per file); the licence travels with the file.
No AI-generated imagery: only real, freely licensed photographs.

Every sprite is now taken from the **full-resolution original** of its Commons source
(several thousand pixels wide) instead of a small thumbnail, so the boards, pieces and
surfaces stay sharp on high-density screens.

| Sprite | Commons file | Licence | Author | Source |
| --- | --- | --- | --- | --- |
| `board-wood.jpg` | Wood Texture Background.jpg | CC0 | Bango Textures | https://commons.wikimedia.org/wiki/File:Wood_Texture_Background.jpg |
| `board-surface.jpg` | Pergament.1.jpg | CC0 | Membeth | https://commons.wikimedia.org/wiki/File:Pergament.1.jpg |
| `hub.jpg` | Ludo-3.jpg | Attribution only (any use permitted, attribution required) | Micha L. Rieser | https://commons.wikimedia.org/wiki/File:Ludo-3.jpg |
| `pawn-red.png`, `pawn-green.png`, `pawn-blue.png`, `pawn-yellow.png` | Spielfiguren (surreal) -- 2021 -- 8820.jpg | CC BY-SA 4.0 | Dietmar Rabich | https://commons.wikimedia.org/wiki/File:Spielfiguren_(surreal)_--_2021_--_8820.jpg |
| `ivory.jpg` | Cream ivory speckled flecked clean marble seamless square tiled floor paving texture.jpg | CC0 | Sisters.seamless | https://commons.wikimedia.org/wiki/File:Cream_ivory_speckled_flecked_clean_marble_seamless_square_tiled_floor_paving_texture.jpg |
| `domino-felt.jpg` | Snooker board.jpg | CC BY-SA 4.0 | Integrity Concepts | https://commons.wikimedia.org/wiki/File:Snooker_board.jpg |

## Derivations

Every file above is a crop and/or re-encode of its Commons original, so the CC BY-SA 4.0
files stay under CC BY-SA 4.0. What was done:

- `board-wood.jpg` — 1500×750 (was 760×397): a low-detail window of the 8192×5464 grain
  (picked automatically as the flattest region, so no seam or knot sits on the frame),
  warmed and darkened to the frame tone the board already had.
- `board-surface.jpg` — full resolution 1024×1024 (was 700×700): the parchment, lifted to the
  same cream board surface.
- `hub.jpg` — 240×240 (was 176×176): the printed HOME square in the centre of a real top-down
  ludo photograph — the frame where the four coloured wedges and the "HOME" lettering sit —
  rotated a quarter turn so its red wedge points at this board's red (left) arm and its green
  wedge at the green (top) arm, then toned to the rosette it replaces.
- `pawn-*.png` — roughly 210×420 each (was 162–230×314): each pawn cut out of the row of
  plastic pawns in the 6460×4307 original with a soft alpha matte, keeping the colours the
  photograph shows (red, green, blue, yellow are the four seats) and the cast shadow dropped;
  the previous cut-outs were still fully opaque, so the studio floor showed as a rectangle
  behind every token.
- `ivory.jpg` — 1000×1000 (was 640×640): cream marble, brightened; the domino tiles and the
  die body.
- `domino-felt.jpg` — 1100×1000 (was 640×668, an upscale of a 207×216 photo): a plain window of
  the baize of a real snooker table, with the hue, saturation and brightness matched to the
  green cloth it replaces (the table surface).

Not sprites: the pips printed on the dominoes and on the die, and the safe-square star on the
ludo track, carry game state and stay CSS-drawn (`pipsFor` in `web/src/lib/pips.js`).
