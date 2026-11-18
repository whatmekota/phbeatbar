# phbeatbar

**18+ only.** A beat bar plugin for [playhound](https://github.com/whatmekota/playhound). It draws the stroke script over the video as something you can follow by hand, like a Cock Hero beat meter: each stroke's beat scrolls toward a hit zone that flashes as it lands. No device needed.

<!-- Screenshot: add docs/beatbar.webp (the beat meter at the bottom of a playing video) and link it here. -->

Needs playhound **2.2.8** or newer (plugin API 7), in the desktop app or a browser.

## Install

In playhound: **Settings → Plugins**. Add `whatmekota/phbeatbar` under **Get plugins** and click **Install**, or download `phbeatbar-<version>.zip` from [Releases](https://github.com/whatmekota/phbeatbar/releases) and drop it on that page. It asks for three permissions:

- **Read the loaded scripts**: the stroke script it draws.
- **See what is playing, where**: the playback position, to stay in step with the picture.
- **Draw over the video**: the bar itself. It never takes your clicks.

## Using it

Play a video with a stroke script and the bar shows over it.

- **Beat meter** (the default): a marker for each beat, where a downstroke ends, scrolling to the hit zone. The gap between markers is the tempo. Markers can be circles, hearts, stars, paws or diamonds, in one colour or coloured by speed on the heatmap's scale (blue slow, through green and yellow, to red fast), and a longer stroke can get a bigger marker.
- The beat lands **at the start** of the bar (the first marker is the beat) or **in the middle** (past beats carry on out the other side, greyed). The hit zone is the markers' own shape as an outline (a ring for circles, a hollow heart for hearts, and so on), with or without a pointer under it, or nothing; the beat lands in it and pops.
- When the strokes stop inside the lookahead (the script ends or pauses), the last ones fade out instead of the row just stopping. Generated motion only knows its tempo now, so its further beats fade too.
- **Stroke guide**: a gauge with a marker where the stroke is now, and beside it the path of the next couple of seconds.
- **Shift+B** shows and hides it (or **Show or hide the beat bar** in the command palette, Ctrl K). If another plugin already has Shift+B it takes Alt+B, or none; the setting's hint says which.
- It follows the video: pause, seeking, the playback speed (at double speed the beats close up) and the script's offset.
- Without a script, it follows playhound's generated motion (music sync, tap tempo, the Manual source) at the tempo it strokes at, from its first beat, in the stroke's own shape: with a saw stroke the top comes late and the drop is fast, with a pulse the top comes early, and the stroke guide draws the path as the generator makes it. With neither, it stays hidden.
- During an edge it dims and counts the hold down, or hides (a setting). **Esc** (panic) hides it while the panic lasts.

It isn't on the mini player or in the pop-out window, only on the full-size player and in fullscreen.

The bar shows the stroke as the script or the generator makes it: a script's beats keep with the picture whatever your device's latency, and your range and invert don't change it.

### Looks

**Look** sets everything about the bar in one go; change any of it afterwards and it becomes **Custom**.

- **Classic centre**: a thin line across the bottom, the beat in the middle under a ring with a pointer, past beats grey on the left and the coming ones pink on the right.
- **Hearts**: pink hearts in a dark strip along the bottom, landing in a big hollow heart at the left end.

### Tall videos

A portrait video keeps your settings: the bar sits over the picture, not the black bars beside it, and **Length** is measured on the picture. A shorter bar looks less far ahead, so the beats keep about the spacing they have on a wide video of the same height (but always at least 1.5 s ahead), and on a very short bar fast strokes are spread out rather than piled up: the beats never crowd together.

### Settings

In **Settings → Plugins → Beat bar**, besides the look: the style; which edge it sits on, where along it (left, centre, right) and how much of it it covers (100% runs across the whole picture); size, opacity and the dark strip; where the beat lands, the markers, their colour and size, the hit marker; the stroke tops (off by default) and the strokes-a-minute label; how far ahead it looks (3 s by default; the stroke guide shows two thirds of that); generated motion; what to do during an edge; and a **metronome**, off by default, with four sounds (soft click, wood block, tick, pop). Picking a sound plays a few beats of it, and **Hear the beat bar's metronome sound** in the command palette plays it again.

### Achievements

In playhound's **Stats → Achievements**, under Beat bar: 100, 1,000 and 10,000 beats on the bar, and a minute of beats at 180 a minute or faster without a break. A beat counts when it reaches the hit zone while the bar shows and the video plays (or generated motion strokes), and not while an edge holds back.

## Privacy

It reads only the loaded script and where the video is. It sends nothing anywhere and stores only its settings and its count of beats.

## Build

    npm install
    npm run build          # dist/index.js and phbeatbar.zip
    npm run build:public   # release/phbeatbar-<version>.zip and release/manifest.json
    npm test
    npm run typecheck

`manifest.json` points at `dist/index.js`, so **Settings → Plugins → Load from folder…** runs this folder as it is after a build; the zip's copy points at `index.js`. `src/types.ts` is a copy of playhound's plugin contract (`src/plugins/types.ts`); keep it in step.

## License

MIT
