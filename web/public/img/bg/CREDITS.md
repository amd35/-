# Credits — photographic backdrops

Real photographs used as full-page backdrops by the web UI. All files come from Wikimedia
Commons with a free licence (shown per file); the licence travels with the file.
No AI-generated imagery: only real, freely licensed photographs.

| File | Commons file | Licence | Author | Source |
| --- | --- | --- | --- | --- |
| backdrop.jpg | DSCF0418 A close-up of a striped billiard ball resting on the green felt of a pool table with blurred bar lights and cues in the background.jpg | CC BY-SA 4.0 | PattayaPatrol | https://commons.wikimedia.org/wiki/File:DSCF0418_A_close-up_of_a_striped_billiard_ball_resting_on_the_green_felt_of_a_pool_table_with_blurred_bar_lights_and_cues_in_the_background.jpg |

`backdrop.jpg` is the 1600px-wide Commons thumbnail, used unchanged as a source file. The
green/blurred treatment (soft blur, dimming, vignette, grain) is applied in CSS
(`body::before` / `body::after` in `web/src/styles.css`), so the asset stays a plain photo
and can be swapped by replacing this one file.
