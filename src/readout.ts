import type { Action, Turn } from './turns'

/**
 * Beats from playhound's generated motion, when there is no script: music
 * sync, tap tempo, the Manual source. `motion.readout()` tells the tempo
 * (spm), the stroke length (depth), when the next bottom comes
 * (`nextStrokeInMs`) and the stroke's shape; `motion.axes()` where the
 * stroke is now (pos), before the user's range and invert. The coming
 * strokes are laid out from that next bottom at the readout's tempo, with
 * each top where the shape puts it (a saw's late, a pulse's early) and the
 * path between in the shape itself.
 *
 * The tracker also watches `pos` frame by frame and notes where it turns
 * at the bottom and the top: that gives the stroke's levels, and the beats'
 * phase when the readout doesn't say when the next one is.
 *
 * Times here are real time (performance.now), not video time: the generator
 * doesn't follow the video's clock.
 */

/** The generator's stroke shapes (playhound's motion.readout().shape). */
export type StrokeShape = 'sine' | 'ease' | 'pulse' | 'saw' | 'sharp'

export interface ReadoutSample {
  spm: number
  depth: number
  /** 0–1, before the user's range and invert. */
  pos: number
  /** ms until the stroke is next at the bottom; null (or absent) when not known. */
  nextStrokeInMs?: number | null
  /** How the generator's stroke goes from bottom to top and back; a sine when absent. */
  shape?: StrokeShape
}

/** Below this, the generator isn't really stroking. */
export const MIN_SPM = 6
export const MIN_DEPTH = 0.03
/** Points per half stroke in a generated path. */
const PATH_STEPS = 8

/** Where each shape is at the top, as a share of the stroke from its bottom (as playhound's generator has it). */
export const TOP_AT: Record<StrokeShape, number> = { sine: 0.5, ease: 0.5, sharp: 0.5, pulse: 1 / 3, saw: 0.75 }

/**
 * Where a stroke of this shape is, 0 (bottom) to 1 (top), `t` of the way
 * through it from its bottom: the same curves as playhound's generator.
 */
export function strokeUnit(t: number, shape: StrokeShape = 'sine'): number {
  const f = ((t % 1) + 1) % 1
  if (shape === 'sine' || shape === 'ease') {
    const s = (1 - Math.cos(f * Math.PI * 2)) / 2
    return shape === 'ease' ? s * s * (3 - 2 * s) : s
  }
  if (shape === 'sharp')
    return f < 0.5 ? f * 2 : 2 - f * 2
  if (shape === 'saw') {
    if (f < TOP_AT.saw)
      return f / TOP_AT.saw
    const u = (f - TOP_AT.saw) / (1 - TOP_AT.saw)
    return 1 - u * u * (3 - 2 * u)
  }
  // pulse: a quick rise over the first third, a slower fall over the rest.
  if (f < 1 / 3)
    return 1 - (1 - f * 3) ** 3
  const u = (f - 1 / 3) / (2 / 3)
  return 1 - (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2)
}

export interface ReadoutTracker {
  /** Feed one frame's readout. */
  feed: (now: number, r: ReadoutSample) => void
  /** Whether there is enough to draw: a stroke going, and one turn seen. */
  ready: () => boolean
  /** The turns from `now - behindMs` to `now + aheadMs`, laid out from the next bottom (or the last turn seen). */
  turns: (now: number, aheadMs: number, behindMs?: number) => Turn[]
  /** The stroke over the same time as a path, in its own shape, for the stroke guide. */
  path: (now: number, aheadMs: number, behindMs?: number) => Action[]
  /** The tempo being drawn, strokes a minute; 0 when not ready. */
  spm: () => number
  reset: () => void
}

export function createReadoutTracker(): ReadoutTracker {
  let spm = 0
  let depth = 0
  let dir = 0
  /** The extreme the stroke is heading for, not yet confirmed as a turn. */
  let candAt = 0
  let candPos = 0
  let lastBottom: { at: number, pos: number } | null = null
  let lastTop: { at: number, pos: number } | null = null
  let lastNow = -Infinity
  /** When the next bottom is, as the readout says, or null. */
  let told: number | null = null
  let shape: StrokeShape = 'sine'

  function reset() {
    spm = 0
    depth = 0
    dir = 0
    lastBottom = null
    lastTop = null
    lastNow = -Infinity
    told = null
  }

  function feed(now: number, r: ReadoutSample) {
    // A gap (the tab was hidden, the overlay came back): start watching afresh.
    if (now - lastNow > 1000)
      dir = 0
    lastNow = now
    spm = Number.isFinite(r.spm) ? r.spm : 0
    depth = Number.isFinite(r.depth) ? r.depth : 0
    told = typeof r.nextStrokeInMs === 'number' && Number.isFinite(r.nextStrokeInMs) ? now + r.nextStrokeInMs : null
    shape = r.shape && r.shape in TOP_AT ? r.shape : 'sine'
    if (spm < MIN_SPM || depth < MIN_DEPTH) {
      lastBottom = null
      lastTop = null
      told = null
      dir = 0
      return
    }
    const pos = Math.min(1, Math.max(0, r.pos))
    // A turn counts once the stroke has come back a fair part of its length.
    const back = Math.max(0.015, depth * 0.25)
    if (dir === 0) {
      dir = 1
      candAt = now
      candPos = pos
      return
    }
    if (dir > 0) {
      if (pos >= candPos) {
        candAt = now
        candPos = pos
      }
      else if (candPos - pos >= back) {
        lastTop = { at: candAt, pos: candPos }
        dir = -1
        candAt = now
        candPos = pos
      }
    }
    else {
      if (pos <= candPos) {
        candAt = now
        candPos = pos
      }
      else if (pos - candPos >= back) {
        lastBottom = { at: candAt, pos: candPos }
        dir = 1
        candAt = now
        candPos = pos
      }
    }
  }

  const ready = () => spm >= MIN_SPM && depth >= MIN_DEPTH && (told !== null || !!(lastBottom || lastTop))

  /** The bottom turns' phase: the next bottom as told, a seen bottom, or a downstroke on from a seen top. */
  function anchor(period: number): number {
    if (told !== null)
      return told
    const down = (1 - TOP_AT[shape]) * period
    if (lastBottom && (!lastTop || lastBottom.at >= lastTop.at - down))
      return lastBottom.at
    return lastTop!.at + down
  }

  function levels(): { bottom: number, top: number } {
    const amp = Math.min(1, depth)
    let bottom = lastBottom?.pos ?? (lastTop ? lastTop.pos - amp : 0.5 - amp / 2)
    bottom = Math.max(0, Math.min(1 - amp, bottom))
    return { bottom: bottom * 100, top: (bottom + amp) * 100 }
  }

  function turns(now: number, aheadMs: number, behindMs = 0): Turn[] {
    if (!ready())
      return []
    const period = 60_000 / spm
    const a = anchor(period)
    const { bottom, top } = levels()
    const amp = top - bottom
    // Bottom to top, and top back down: half a stroke each for a sine, not for a saw or a pulse.
    const up = TOP_AT[shape] * period
    const down = period - up
    const out: Turn[] = []
    const from = now - behindMs
    const to = now + aheadMs
    for (let b = a + Math.floor((from - a) / period) * period; b <= to; b += period) {
      if (b >= from)
        out.push({ at: b, pos: bottom, kind: 'bottom', amp, speed: (amp / down) * 1000 })
      if (b + up >= from && b + up <= to)
        out.push({ at: b + up, pos: top, kind: 'top', amp, speed: (amp / up) * 1000 })
    }
    return out
  }

  function path(now: number, aheadMs: number, behindMs = 0): Action[] {
    if (!ready())
      return []
    const period = 60_000 / spm
    const a = anchor(period)
    const { bottom, top } = levels()
    const amp = top - bottom
    const topAt = TOP_AT[shape]
    // From the bottom before the window to the one after it, in the stroke's own shape.
    const out: Action[] = []
    let b = a + Math.floor((now - behindMs - a) / period) * period
    for (; b < now + aheadMs; b += period) {
      for (let j = 0; j < PATH_STEPS * 2; j++) {
        const f = j < PATH_STEPS ? (topAt * j) / PATH_STEPS : topAt + ((1 - topAt) * (j - PATH_STEPS)) / PATH_STEPS
        out.push({ at: b + f * period, pos: bottom + strokeUnit(f, shape) * amp })
      }
    }
    out.push({ at: b, pos: bottom })
    return out
  }

  return { feed, ready, turns, path, spm: () => (ready() ? spm : 0), reset }
}
