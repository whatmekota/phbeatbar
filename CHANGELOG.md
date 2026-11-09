# Changelog

## 0.1.0

First version, for playhound 2.0 and newer.

- A **beat meter** over the video: the stroke script's beats scroll to a hit zone that flashes as they land. Spacing is tempo, size is stroke length, colour is speed on the heatmap scale; thin lines mark the tops.
- A **stroke guide**: where the stroke is now, and its path over the next seconds.
- Follows pause, seeking, playback speed and the script offset. Without a script, follows generated motion (music sync, tap tempo, Manual).
- Settings: style, position, size, opacity, lookahead, stroke tops, generated motion, and a metronome tick (off by default).
- **Shift+B** (or the command palette) shows and hides it; panic hides it.
