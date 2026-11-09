import type { Palette } from './draw'
import type { Config } from './settings'
import type { Action, Turn } from './turns'
import type { PlayerSnapshot, PluginContext, ScriptSnapshot } from './types'
import { drawGuide, drawMeter } from './draw'
import { aheadInScript, scriptTime } from './layout'
import { createMetronome, SCHEDULE_AHEAD_MS } from './metronome'
import { createReadoutTracker } from './readout'
import { FIELDS, readConfig } from './settings'
import { CSS } from './style'
import { cleanActions, firstAtOrAfter, pathBetween, positionAt, spmAround, turningPoints } from './turns'

/**
 * Beat bar: the stroke script drawn over the video as something to follow
 * by hand, Cock Hero style. The beats (where each downstroke ends) scroll
 * toward a hit zone that flashes as they land; spacing is tempo, size is
 * stroke length, colour is speed on the heatmap scale. Or, as a stroke
 * guide: where the stroke is now and where it goes over the next seconds.
 *
 * Without a script it follows playhound's generated motion (music sync, tap
 * tempo, Manual) through motion.readout, and hides when there is neither.
 * It draws only while something moves, and panic hides it.
 */

/** The stroke guide shows the nearer part of the lookahead: a path is denser than a row of beats. */
const GUIDE_SHARE = 2 / 3

/** How long the bar stays after the script's last stroke. */
const END_GRACE_MS = 2000

/** Keys to try for the toggle, in order; the first one free is taken. */
const TOGGLE_KEYS = ['Shift+B', 'Alt+B', 'Alt+Shift+B']
const ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><rect x="1.5" y="5" width="13" height="6" rx="3"/><circle cx="4.5" cy="8" r="1.6"/><path d="M8.5 7v2M11 6.5v3"/></svg>'

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
  let cfg: Config = readConfig(ctx.settings.all())
  /** Bumped by anything that changes the picture other than time. */
  let version = 0

  // ─── The script ──────────────────────────────────────────────────────────
  let actions: Action[] = []
  let turns: Turn[] = []
  let offsetMs = 0
  function takeScripts(s: ScriptSnapshot) {
    const axis = s.axes.find(a => a.axis === 'L0')
    actions = axis ? cleanActions(axis.actions) : []
    turns = turningPoints(actions)
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

  // ─── Settings and the toggle ─────────────────────────────────────────────
  ctx.settings.onChange((v) => {
    cfg = readConfig(v)
    version++
    if (!cfg.tick)
      metronome.cancel()
  })

  let key: string | null = null
  const toggle = {
    id: 'toggle',
    title: 'Show or hide the beat bar',
    hint: 'The beat meter over the video',
    icon: ICON,
    run() {
      const on = !cfg.visible
      ctx.settings.set('visible', on)
      cfg = { ...cfg, visible: on }
      version++
      const nothing = on && turns.length < 2 && !(cfg.generated && tracker.ready())
      ctx.ui.toast(on ? 'Beat bar on' : 'Beat bar off', nothing ? { detail: 'It shows once a stroke script is loaded, or generated motion runs.' } : undefined)
    },
  }
  for (const k of TOGGLE_KEYS) {
    // A taken key is refused and the command added without one; the next try replaces it.
    if (ctx.commands.register({ ...toggle, kbd: k })) {
      key = k
      break
    }
  }
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
    const themeObs = new MutationObserver(() => {
      palette = readPalette()
      version++
    })
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })

    let w = 0
    let h = 0
    let dpr = 0
    const ro = new ResizeObserver(() => {
      w = box.clientWidth
      h = box.clientHeight
      dpr = 0 // sized again on the next frame
    })
    ro.observe(box)

    let shown = false
    let drawn = ''
    let boxed = ''
    let lastNow = Number.NaN
    /** The last tick scheduled, in the drawn time; ticks go only to later beats. */
    let tickedTo = -Infinity

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

    function layoutBox() {
      const want = `${cfg.side}|${cfg.style}|${cfg.scale}|${cfg.opacity}`
      if (want === boxed)
        return
      boxed = want
      box.dataset.side = cfg.side
      box.dataset.style = cfg.style
      box.style.setProperty('--phbb-scale', String(cfg.scale))
      box.style.setProperty('--phbb-opacity', String(cfg.opacity))
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
        metronome.tick((t.at - now) / rate, cfg.volume, t.kind === 'bottom')
      }
    }

    let raf = requestAnimationFrame(function frame(ms) {
      raf = requestAnimationFrame(frame)
      layoutBox()

      let source: 'script' | 'generated' | null = null
      if (cfg.visible && !ctx.safety.panicked()) {
        if (turns.length >= 2) {
          source = 'script'
        }
        else if (cfg.generated) {
          tracker.feed(ms, ctx.motion.readout())
          if (tracker.ready())
            source = 'generated'
        }
      }
      if (!source && shown)
        tracker.reset()
      show(!!source)
      if (!source || w < 8 || h < 8)
        return

      const ratio = window.devicePixelRatio || 1
      if (ratio !== dpr) {
        dpr = ratio
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        drawn = ''
      }

      let now: number
      let aheadMs: number
      let rate = 1
      let playing = true
      let list: readonly Turn[]
      let path: readonly Action[] = []
      let posNow = 50
      let spm: number
      if (source === 'script') {
        rate = player.rate > 0 ? player.rate : 1
        playing = player.playing
        now = scriptTime(ctx.player.clock(), offsetMs)
        // Past the script's last stroke there is nothing more to follow.
        if (now > turns[turns.length - 1].at + END_GRACE_MS) {
          show(false)
          return
        }
        aheadMs = aheadInScript(cfg.lookaheadS, rate) * (cfg.style === 'guide' ? GUIDE_SHARE : 1)
        list = turns
        // Strokes a minute as they come at this speed.
        spm = spmAround(turns, now) * rate
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
        lastNow = now
      }
      else {
        now = ms
        aheadMs = cfg.lookaheadS * 1000 * (cfg.style === 'guide' ? GUIDE_SHARE : 1)
        list = tracker.turns(now, aheadMs, aheadMs * 0.15)
        spm = tracker.spm()
        if (cfg.style === 'guide') {
          path = tracker.path(now, aheadMs)
          posNow = Math.min(1, Math.max(0, ctx.motion.readout().pos)) * 100
        }
        lastNow = Number.NaN
      }

      if (cfg.tick && playing)
        schedule(list, now, rate, source === 'generated' ? 15_000 / Math.max(1, spm) : 0)

      // Nothing moved (paused, and nothing else changed): leave the picture as it is.
      const sig = `${now}|${posNow}|${version}|${w}x${h}@${dpr}|${source}`
      if (sig === drawn)
        return
      drawn = sig

      const base = { w, h, dpr, scale: cfg.scale, side: cfg.side, now, aheadMs, turns: list, showTops: cfg.tops, spm, oklch, palette }
      if (cfg.style === 'guide')
        drawGuide(g, { ...base, path, posNow })
      else
        drawMeter(g, base)
    })

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      themeObs.disconnect()
      metronome.cancel()
      box.remove()
    }
  }

  const removeOverlay = ctx.ui.overlay({ mount })

  return () => {
    removeOverlay()
    metronome.close()
  }
}
