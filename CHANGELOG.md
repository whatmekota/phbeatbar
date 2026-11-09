# Changelog

## 0.2.1

- The **hit marker takes the markers' shape**: a ring for circles, a hollow heart for hearts, a star, paw or diamond outline for the others, with the pointer under it if picked. The beat lands in it and pops, in its own colour.
- The **Hearts** look has its big hollow heart at the left end, for the beat to land in.
- **Tall videos keep your settings** instead of switching to a Portrait look: the bar sits over the picture and its length is measured on it, and a shorter bar looks less far ahead (at least 1.5 s) so the beats keep their spacing. On a very short bar fast beats are spread out, never piled up.
- The **Portrait** look and the **Video shape** setting are gone. A saved Portrait look, or "always the Portrait look", becomes Custom with the values it set.
- Picking a look keeps it picked (a test makes sure of it).

## 0.2.0

- **Looks** in one click: **Classic centre**, **Hearts** and **Portrait**. Changing anything they set makes the look Custom.
- **Video shape: Auto** (the default): a tall video gets the Portrait look, over the picture itself rather than the black bars (playhound 2.2+).
- Where the beat lands: **at the start** or **in the middle**, with past beats carrying on, greyed.
- **Markers**: circles, hearts, stars, paws or diamonds, drawn as vector shapes; one colour (pink, white, the theme's accent) or by speed; sized by stroke length or all the same.
- **Hit marker**: a ring, a ring with a pointer, or none.
- The bar's place: any edge, left, centre or right along it, and its **length** up to the whole width of the picture; the dark strip can be turned off.
- When the strokes stop inside the lookahead, the last ones fade out; generated motion's further beats fade, its future being a guess.
- **Metronome sounds**: soft click, wood block, tick and pop, made with Web Audio. Picking one plays it; a palette command plays it again.
- Stroke tops are off by default. The strokes-a-minute label can be turned off.
- With playhound 2.2: dims and counts down during an edge (or hides, a setting), keeps clear of the player's bars as they show and hide, follows generated motion from its first beat, and repaints on a theme change. Still runs on 2.0.

## 0.1.0

First version, for playhound 2.0 and newer.

- A **beat meter** over the video: the stroke script's beats scroll to a hit zone that flashes as they land. Spacing is tempo, size is stroke length, colour is speed on the heatmap scale; thin lines mark the tops.
- A **stroke guide**: where the stroke is now, and its path over the next seconds.
- Follows pause, seeking, playback speed and the script offset. Without a script, follows generated motion (music sync, tap tempo, Manual).
- Settings: style, position, size, opacity, lookahead, stroke tops, generated motion, and a metronome tick (off by default).
- **Shift+B** (or the command palette) shows and hides it; panic hides it.
