import type { Palette } from './draw'
import type { Rect } from './layout'
import type { Config } from './settings'
import type { Action, Turn } from './turns'
import type { PlayerSnapshot, PluginContext, ScriptSnapshot } from './types'
import { ACHIEVEMENTS, beatsBetween, createBeatCounter, createFastTimer } from './achievements'
import { drawGuide, drawMeter } from './draw'
import { aheadInScript, barRect, meterTrack, rowEnd, scriptTime, uncrowdedWindow, windowFor } from './layout'
import { createMetronome, SCHEDULE_AHEAD_MS } from './metronome'
import { createReadoutTracker } from './readout'
import { FIELDS, lookChanges, migrate, readConfig } from './settings'
import { SHAPE_SCALE } from './shapes'
import { CSS } from './style'
import { cleanActions, firstAtOrAfter, pathBetween, positionAt, spmAround, turningPoints } from './turns'

/**
 * Beat bar: the stroke script drawn over the video as something to follow
 * by hand, Cock Hero style. The beats (where each downstroke ends) scroll
 * toward a hit zone; spacing is tempo, and size and colour can show stroke
 * length and speed. Or, as a stroke guide: where the stroke is now and where
 * it goes over the next seconds.
 *
 * Without a script it follows playhound's generated motion (music sync, tap
 * tempo, Manual) through motion.readout, in the stroke's own shape, and
 * hides when there is neither. On a tall video it keeps over the picture,
 * its beats spaced as on a wide one. It draws only while something moves,
 * and panic hides it.
 *
 * A script's beats are read off the script at the video's clock, so they
 * land with the picture: motion.axes and onAxis run the user's device
 * latency ahead of it while a script plays. Generated motion isn't run
 * ahead, so there motion.axes says where the stroke is.
 *
 * Written for plugin API 7 (playhound 2.2.8).
 */

/** The stroke guide shows the nearer part of the lookahead: a path is denser than a row of beats. */
const GUIDE_SHARE = 2 / 3
/** How long the bar stays after the script's last stroke. */
const END_GRACE_MS = 2000
/** How often the bar's place is checked against the player's bars, ms. */
const PLACE_EVERY_MS = 150

/** Keys to try for the toggle, in order; the first one free is taken. */
const TOGGLE_KEYS = ['Shift+B', 'Alt+B', 'Alt+Shift+B']
const ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><rect x="1.5" y="5" width="13" height="6" rx="3"/><circle cx="4.5" cy="8" r="1.6"/><path d="M8.5 7v2M11 6.5v3"/></svg>'
const SOUND_ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6v4h2.5l3.5 3V3L5 6Z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5"/></svg>'

/** Canvas oklch() colours (Chromium 111+); hsl otherwise. */
function canvasOklch(): boolean {
  const g = document.createElement('canvas').getContext('2d')
  if (!g)
    return false
  g.fillStyle = '#000'
  g.fillStyle = 'oklch(70% 0.1 200)'
  return g.fillStyle !== '#000000'
}

function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  return {
    accent: v('--accent', '#e0559a'),
    text: v('--text', '#f2f2f5'),
    bg: v('--bg-900', '#101014'),
    border: v('--border', 'rgba(255,255,255,0.12)'),
    font: getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif',
  }
}

export default function activate(ctx: PluginContext) {
  ctx.ui.style(CSS)
  let values: Record<string, unknown> = ctx.settings.all()
  // 0.2.0's Portrait look and Video shape setting are gone: bring their values over.
  const moved = migrate(values)
  for (const [k, v] of Object.entries(moved))
    ctx.settings.set(k, v)
  values = { ...values, ...moved }
  let cfg: Config = readConfig(values)
  /** Bumped by anything that changes the picture other than time. */
  let version = 0
  const refresh = () => {
    cfg = readConfig(values)
    version++
  }

  // ─── The script ──────────────────────────────────────────────────────────
  let actions: Action[] = []
  let turns: Turn[] = []
  let offsetMs = 0
  /** The turns, without strokes shorter than the user wants beats for (5 units always: the line's own wobble). */
  const strokeTurns = () => turningPoints(actions, Math.max(5, cfg.minStroke))
  function takeScripts(s: ScriptSnapshot) {
    const axis = s.axes.find(a => a.axis === 'L0')
    actions = axis ? cleanActions(axis.actions) : []
    turns = strokeTurns()
    offsetMs = axis?.offsetMs ?? 0
    version++
  }
  takeScripts(ctx.scripts.current())
  ctx.scripts.onChange(takeScripts)

  let player: PlayerSnapshot = ctx.player.state()
  ctx.player.onChange((s) => {
    player = s
    version++
  })

  const tracker = createReadoutTracker()
  const metronome = createMetronome()
  ctx.safety.onPanic(() => metronome.cancel())

  // ─── Achievements ────────────────────────────────────────────────────────
  ctx.achievements.define(ACHIEVEMENTS)
  const beats = createBeatCounter({
    load: () => ctx.storage.get<number>('beats'),
    save: n => void ctx.storage.set('beats', n).catch(() => {}),
    progress: (id, n) => ctx.achievements.progress(id, n),
  })
  const fastFor = createFastTimer()

  // ─── Settings, looks and the sound preview ───────────────────────────────
  let previewTimer: ReturnType<typeof setTimeout> | undefined
  const preview = () => metronome.preview(cfg.sound, cfg.volume)
  ctx.settings.onChange((v) => {
    const prev = values
    values = v
    // Picking a look sets what it sets; changing one of those by hand makes it Custom.
    for (const [k, want] of Object.entries(lookChanges(prev, v)))
      ctx.settings.set(k, want)
    refresh()
    if (v.minStroke !== prev.minStroke)
      turns = strokeTurns()
    if (!cfg.tick)
      metronome.cancel()
    if (v.sound !== prev.sound || v.volume !== prev.volume) {
      clearTimeout(previewTimer)
      previewTimer = setTimeout(preview, 250)
    }
  })

  const toggle = {
    id: 'toggle',
    title: 'Show or hide the beat bar',
    hint: 'The beat meter over the video',
    icon: ICON,
    run() {
      const on = !readConfig(values).visible
      ctx.settings.set('visible', on)
      values = { ...values, visible: on }
      refresh()
      const nothing = on && turns.length < 2 && !(cfg.generated && tracker.ready())
      ctx.ui.toast(on ? 'Beat bar on' : 'Beat bar off', nothing ? { detail: 'It shows once a stroke script is loaded, or generated motion runs.' } : undefined)
    },
  }
  // playhound takes the first free key of the list itself.
  const key = TOGGLE_KEYS.find(k => ctx.commands.keyFree(k)) ?? null
  ctx.commands.register({ ...toggle, kbd: TOGGLE_KEYS })
  ctx.commands.register({ id: 'preview', title: 'Hear the beat bar\'s metronome sound', hint: 'Four beats of the sound picked in its settings', icon: SOUND_ICON, run: preview })
  ctx.ui.settings(FIELDS.map(f => f.key === 'visible'
    ? { ...f, hint: key ? `Also ${key}, or "Show or hide the beat bar" in the command palette (Ctrl K).` : 'Also "Show or hide the beat bar" in the command palette (Ctrl K).' }
    : f))

  // ─── The layer over the video ────────────────────────────────────────────
  const oklch = canvasOklch()

  function mount(el: HTMLElement) {
    const box = document.createElement('div')
    box.className = 'phbb phbb-off'
    const canvas = document.createElement('canvas')
    box.append(canvas)
    el.append(box)
    const g = canvas.getContext('2d')
    if (!g)
      return () => box.remove()

    let palette = readPalette()
    const repaint = () => {
      palette = readPalette()
      version++
    }
    const unTheme = ctx.ui.onThemeChange(repaint)

    // Where the bar goes: worked out from the layer's size, the picture in
    // it, the player's bars and the settings; checked a few times a second.
    let rect: Rect & { full: boolean } = { x: 0, y: 0, w: 0, h: 0, full: false }
    /** How far ahead this bar looks, s: the lookahead, fitted to the bar (windowFor). */
    let windowS = cfg.lookaheadS
    let placedAt = -Infinity
    let placedFor = ''
    function place(now: number, force = false) {
      if (!force && now - placedAt < PLACE_EVERY_MS)
        return
      placedAt = now
      const cs = getComputedStyle(el)
      const insetTop = Number.parseFloat(cs.getPropertyValue('--ph-controls-top'))
      const insetBottom = Number.parseFloat(cs.getPropertyValue('--ph-controls-bottom'))
      const W = el.clientWidth
      const H = el.clientHeight
      const pic = ctx.player.picture()
      // The picture in the player (the same box as this layer); all of it without one.
      const picture = pic && pic.width > 0 && pic.height > 0
        ? { x: pic.x, y: pic.y, w: pic.width, h: pic.height }
        : { x: 0, y: 0, w: W, h: H }
      const vertical = cfg.side === 'left' || cfg.side === 'right'
      const thickness = cfg.style === 'guide' ? (vertical ? 220 : 110) * cfg.scale : 50 * cfg.scale
      const r = barRect(picture, H, {
        side: cfg.side,
        align: cfg.align,
        length: cfg.length,
        thickness,
        insetTop: Number.isFinite(insetTop) ? insetTop : 0,
        insetBottom: Number.isFinite(insetBottom) ? insetBottom : 0,
      })
      const sig = `${[r.x, r.y, r.w, r.h, picture.w, picture.h].map(n => Math.round(n)).join(',')}|${cfg.opacity}|${cfg.lookaheadS}`
      if (sig === placedFor)
        return
      placedFor = sig
      rect = r
      // A shorter bar on a narrow picture looks less far ahead, so its beats keep their spacing.
      windowS = windowFor(cfg.lookaheadS, r, picture, cfg)
      box.style.left = `${Math.round(r.x)}px`
      box.style.top = `${Math.round(r.y)}px`
      box.style.width = `${Math.round(r.w)}px`
      box.style.height = `${Math.round(r.h)}px`
      box.style.setProperty('--phbb-opacity', String(cfg.opacity))
      dpr = 0 // the canvas is sized again
    }
    const ro = new ResizeObserver(() => place(performance.now(), true))
    ro.observe(el)
    const unPicture = ctx.player.onPicture(() => place(performance.now(), true))

    let dpr = 0
    let shown = false
    let drawn = ''
    let lastNow = Number.NaN
    /** The generator's phase last frame, to count its beats; NaN when it wasn't followed. */
    let lastPhase = Number.NaN
    let placedVersion = -1
    /** The last tick scheduled, in the drawn time; ticks go only to later beats. */
    let tickedTo = -Infinity

    /** The window cut down so beats at `beatSpm` don't pile up on this bar (meter only). */
    function uncrowd(aheadMs: number, beatSpm: number): number {
      if (cfg.style !== 'meter' || !(beatSpm > 0))
        return aheadMs
      const vertical = cfg.side === 'left' || cfg.side === 'right'
      const T = vertical ? rect.w : rect.h
      const markerR = T * 0.34 * (cfg.sizeByDepth ? 1 : 0.62) * SHAPE_SCALE[cfg.shape]
      const track = meterTrack(vertical ? rect.h : rect.w, T, { centre: cfg.hit === 'centre', label: cfg.label, markerR })
      const want = uncrowdedWindow(aheadMs, track.spanPx, 60_000 / beatSpm, track.minGapPx)
      // Eased, so a change of tempo doesn't make the beats jump.
      eased = Number.isFinite(eased) && Math.abs(want - eased) > 1 ? eased + (want - eased) * 0.15 : want
      return eased
    }
    let eased = Number.NaN

    function show(on: boolean) {
      if (on === shown)
        return
      shown = on
      box.classList.toggle('phbb-off', !on)
      if (!on) {
        metronome.cancel()
        tickedTo = -Infinity
      }
    }

    function schedule(list: readonly Turn[], now: number, rate: number, minGap: number) {
      const horizon = now + SCHEDULE_AHEAD_MS * rate
      for (let i = firstAtOrAfter(list, now); i < list.length && list[i].at <= horizon; i++) {
        const t = list[i]
        if (t.kind === 'top' && !cfg.tops)
          continue
        if (t.at <= tickedTo + minGap)
          continue
        tickedTo = t.at
        metronome.tick((t.at - now) / rate, cfg.volume, t.kind === 'bottom', cfg.sound)
      }
    }

    let raf = requestAnimationFrame(function frame(ms) {
      raf = requestAnimationFrame(frame)
      place(ms, placedVersion !== version)
      placedVersion = version

      const edge = ctx.session.edgeState()
      const holding = edge.phase !== 'idle' && edge.holdBack > 0.02
      let source: 'script' | 'generated' | null = null
      const readout = turns.length < 2 && cfg.generated ? ctx.motion.readout() : null
      // Where the stroke is, before the user's range and invert: motion.axes
      // has it so (playhound 2.2.8's readout().pos is still after them).
      const strokePos = readout ? (ctx.motion.axes().L0 ?? readout.pos) : 0
      if (cfg.visible && !ctx.safety.panicked() && !(holding && cfg.edges === 'hide')) {
        if (turns.length >= 2) {
          source = 'script'
        }
        else if (readout) {
          tracker.feed(ms, { ...readout, pos: strokePos })
          if (tracker.ready())
            source = 'generated'
        }
      }
      if (!source && shown)
        tracker.reset()
      show(!!source)
      if (!source || rect.w < 8 || rect.h < 8) {
        lastPhase = Number.NaN
        return
      }

      const ratio = window.devicePixelRatio || 1
      if (ratio !== dpr) {
        dpr = ratio
        canvas.width = Math.round(rect.w * dpr)
        canvas.height = Math.round(rect.h * dpr)
        drawn = ''
      }

      const share = cfg.style === 'guide' ? GUIDE_SHARE : 1
      let now: number
      let aheadMs: number
      let rate = 1
      let playing = true
      let list: readonly Turn[]
      let path: readonly Action[] = []
      let posNow = 50
      let spm: number
      let rowEndX: number | null = null
      /** Beats that reached the hit zone since the last frame. */
      let landed = 0
      if (source === 'script') {
        rate = player.rate > 0 ? player.rate : 1
        playing = player.playing
        now = scriptTime(ctx.player.clock(), offsetMs)
        // Past the script's last stroke there is nothing more to follow.
        if (now > turns[turns.length - 1].at + END_GRACE_MS) {
          show(false)
          return
        }
        const scriptSpm = spmAround(turns, now)
        aheadMs = uncrowd(aheadInScript(windowS, rate) * share, scriptSpm)
        list = turns
        rowEndX = rowEnd(turns, now, aheadMs)
        // Strokes a minute as they come at this speed.
        spm = scriptSpm * rate
        if (cfg.style === 'guide') {
          path = pathBetween(actions, now, now + aheadMs)
          posNow = positionAt(actions, now) ?? 50
        }
        // A seek, or a pause: the ticks queued for where it was are wrong now.
        const step = now - lastNow
        if (!playing || !(step > -40 && step < 400 * rate)) {
          metronome.cancel()
          tickedTo = now - 1
        }
        else if (!holding) {
          landed = beatsBetween(turns, lastNow, now)
        }
        lastNow = now
        lastPhase = Number.NaN
      }
      else {
        now = ms
        spm = tracker.spm()
        aheadMs = uncrowd(windowS * 1000 * share, spm)
        // Behind as far as the beat-in-the-middle shows past beats.
        list = tracker.turns(now, aheadMs, aheadMs)
        if (cfg.style === 'guide') {
          path = tracker.path(now, aheadMs)
          posNow = Math.min(1, Math.max(0, strokePos)) * 100
        }
        // The generator's phase going round is a beat (a doubled stroke's, twice).
        const phase = readout!.phase
        if (phase !== null && lastPhase - phase > 0.5 && !holding)
          landed = 1
        lastPhase = phase ?? Number.NaN
        lastNow = Number.NaN
      }

      beats.add(landed)
      if (fastFor(ms, spm, playing && !holding))
        ctx.achievements.unlock('fast-minute')

      if (cfg.tick && playing && !holding)
        schedule(list, now, rate, source === 'generated' ? 15_000 / Math.max(1, spm) : 0)

      const edgeDim = holding ? 1 - 0.7 * edge.holdBack : 1
      const edgeText = holding ? `Edge · ${Math.max(0, Math.ceil(edge.remainingSec))} s` : null

      // Nothing moved (paused, and nothing else changed): leave the picture as it is.
      const sig = `${now}|${Math.round(aheadMs)}|${posNow}|${version}|${rect.w}x${rect.h}@${dpr}|${source}|${edgeText}|${edgeDim.toFixed(2)}`
      if (sig === drawn)
        return
      drawn = sig

      const base = {
        w: rect.w,
        h: rect.h,
        dpr,
        scale: cfg.scale,
        side: cfg.side,
        now,
        aheadMs,
        turns: list,
        showTops: cfg.tops,
        spm,
        colour: cfg.colour,
        oklch,
        palette,
        rowEndX,
        uncertain: source === 'generated',
        edgeDim,
        edgeText,
      }
      if (cfg.style === 'guide')
        drawGuide(g, { ...base, path, posNow })
      else
        drawMeter(g, { ...base, hit: cfg.hit, shape: cfg.shape, sizeByDepth: cfg.sizeByDepth, ring: cfg.ring, strip: cfg.strip, label: cfg.label, full: rect.full })
    })

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      unPicture()
      unTheme()
      metronome.cancel()
      beats.flush()
      box.remove()
    }
  }

  const removeOverlay = ctx.ui.overlay({ mount })

  return () => {
    clearTimeout(previewTimer)
    removeOverlay()
    beats.flush()
    metronome.close()
  }
}
