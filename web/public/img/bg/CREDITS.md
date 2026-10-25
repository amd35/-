# Credits — photographic backdrops

Real photographs used as full-page backdrops by the web UI, one per section
(`body[data-surface]`, see `web/src/lib/surface.js`). All files come from Wikimedia
Commons with a free licence (shown per file); the licence travels with the file.
No AI-generated imagery: only real, freely licensed photographs.

Each file is the Commons thumbnail of the width noted below, used unchanged as a source
file. The cinematic treatment (dimming, colour glow, film grain, slow drift — no blur,
the photograph stays sharp)
is applied in CSS (`body::before` / `body::after` in `web/src/styles.css`, section 16), so
an asset stays a plain photograph and can be swapped by replacing that one file.

| File | Section | Commons file | Licence | Author | Source |
| --- | --- | --- | --- | --- | --- |
| backdrop.jpg | panel (admin/service pages) | DSCF0418 A close-up of a striped billiard ball resting on the green felt of a pool table with blurred bar lights and cues in the background.jpg | CC BY-SA 4.0 | PattayaPatrol | https://commons.wikimedia.org/wiki/File:DSCF0418_A_close-up_of_a_striped_billiard_ball_resting_on_the_green_felt_of_a_pool_table_with_blurred_bar_lights_and_cues_in_the_background.jpg |
| aurora.jpg | home (1600px) | Aurora borealis in Idaho (54933077470).jpg | Public domain | USFWS - Pacific Region | https://commons.wikimedia.org/wiki/File:Aurora_borealis_in_Idaho_(54933077470).jpg |
| nebula.jpg | auth + games (1280px) | Uncovering the Veil Nebula (2007-30-2164).jpg | Public domain | NASA, ESA, and the Hubble Heritage (STScI/AURA)-ESA/Hubble Collaboration | https://commons.wikimedia.org/wiki/File:Uncovering_the_Veil_Nebula_(2007-30-2164).jpg |
| stage.jpg | rooms (1280px) | DFC 5455 Live band lights up the night at Mahakanon Pattaya - energetic crowd electric guitars and a stage full of sound.jpg | CC BY-SA 4.0 | PattayaPatrol | https://commons.wikimedia.org/wiki/File:DFC_5455_Live_band_lights_up_the_night_at_Mahakanon_Pattaya_-_energetic_crowd_electric_guitars_and_a_stage_full_of_sound.jpg |
| bokeh.jpg | social (friends, notifications, search) (1280px) | Raindrops on a window with vibrant bokeh lights creating an artistic, abstract effect.jpg | CC BY-SA 4.0 | DP Singh Bhullar | https://commons.wikimedia.org/wiki/File:Raindrops_on_a_window_with_vibrant_bokeh_lights_creating_an_artistic,_abstract_effect.jpg |
| gold.jpg | store + wallet (1280px) | Gold bullion bars.jpg | CC0 | Stevebidmead | https://commons.wikimedia.org/wiki/File:Gold_bullion_bars.jpg |
| stone.jpg | profile (1280px) | Serpentinite (quarry south of Roxbury, Vermont, USA) 1.jpg | CC BY 2.0 | James St. John | https://commons.wikimedia.org/wiki/File:Serpentinite_(quarry_south_of_Roxbury,_Vermont,_USA)_1.jpg |
