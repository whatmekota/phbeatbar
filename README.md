# phbeatbar

**18+ only.** A beat bar plugin for [playhound](https://github.com/whatmekota/playhound). It draws the stroke script over the video as something you can follow by hand, like a Cock Hero beat meter: each stroke's beat scrolls toward a hit zone that flashes as it lands. No device needed.

<!-- Screenshot: add docs/beatbar.webp (the beat meter at the bottom of a playing video) and link it here. -->

Needs playhound **2.0** or newer, in the desktop app or a browser.

## Install

In playhound: **Settings → Plugins**. Add `whatmekota/phbeatbar` under **Get plugins** and click **Install**, or download `phbeatbar-<version>.zip` from [Releases](https://github.com/whatmekota/phbeatbar/releases) and drop it on that page. It asks for three permissions:

- **Read the loaded scripts**: the stroke script it draws.
- **See what is playing, where**: the playback position, to stay in step with the picture.
- **Draw over the video**: the bar itself. It never takes your clicks.

## Using it

Play a video with a stroke script and the bar shows over it.

- **Beat meter** (the default): a dot for each beat, where a downstroke ends, scrolling to the ring on the left. The gap between dots is the tempo, a bigger dot is a longer stroke, and the colour is its speed on the heatmap's scale (blue slow, through green and yellow, to red fast). Thin lines between the dots mark the top of each stroke. The number at the end is strokes a minute.
- **Stroke guide**: a gauge with a marker where the stroke is now, and beside it the path of the next couple of seconds, coloured by speed.
- **Shift+B** shows and hides it (or **Show or hide the beat bar** in the command palette, Ctrl K). If another plugin already has Shift+B it takes Alt+B, or none; the setting's hint says which.
- It follows the video: pause, seeking, the playback speed (at double speed the beats close up) and the script's offset.
- Without a script, it follows playhound's generated motion (music sync, tap tempo, the Manual source) at the tempo it strokes at. With neither, it stays hidden.
- **Esc** (panic) hides it while the panic lasts.

It isn't on the mini player or in the pop-out window, only on the full-size player and in fullscreen.

### Settings

In **Settings → Plugins → Beat bar**: the style, where it sits (bottom, top, left or right), its size and opacity, how far ahead it looks (3 s by default; the stroke guide shows two thirds of that), the stroke tops, following generated motion, and a **metronome**: a quiet tick on each beat, off by default.

## Privacy

It reads only the loaded script and where the video is. It sends nothing anywhere and stores only its settings.

## Build

    npm install
    npm run build          # dist/index.js and phbeatbar.zip
    npm run build:public   # release/phbeatbar-<version>.zip and release/manifest.json
    npm test
    npm run typecheck

`manifest.json` points at `dist/index.js`, so **Settings → Plugins → Load from folder…** runs this folder as it is after a build; the zip's copy points at `index.js`. `src/types.ts` is a copy of playhound's plugin contract (`src/plugins/types.ts`); keep it in step.

## License

MIT
