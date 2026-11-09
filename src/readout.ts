import type { Action, Turn } from './turns'

/**
 * Beats from playhound's generated motion, when there is no script: music
 * sync, tap tempo, the Manual source. `motion.readout()` tells the tempo
 * (spm), the stroke length (depth) and where the stroke is now (pos), but
 * not where in the stroke the generator is. So the tracker watches `pos`
 * frame by frame, notes when it turns at the bottom and the top, and lays
 * the coming strokes out from the last turn at the readout's tempo. It
 * corrects itself at every stroke, so a tempo change is followed within one.
 *
 * From playhound 2.2 the readout also says when the next bottom comes
 * (`nextStrokeInMs`): then that is used as it is, with nothing to infer, and
 * the bar is right from the first frame.
 *
 * Times here are real time (performance.now), not video time: the generator
 * doesn't follow the video's clock.
 */

export interface ReadoutSample {
  spm: number
  depth: number
  /** 0–1. */
  pos: number
  /** playhound 2.2+: ms until the stroke is next at the bottom; null (or absent) when not known. */
  nextStrokeInMs?: number | null
}

/** Below this, the generator isn't really stroking. */
export const MIN_SPM = 6
export const MIN_DEPTH = 0.03
/** Points per half stroke in a generated path. */
const EASE_STEPS = 6

export interface ReadoutTracker {
  /** Feed one frame's readout. */
  feed: (now: number, r: ReadoutSample) => void
  /** Whether there is enough to draw: a stroke going, and one turn seen. */
  ready: () => boolean
  /** The turns from `now - behindMs` to `now + aheadMs`, laid out from the last turn seen. */
  turns: (now: number, aheadMs: number, behindMs?: number) => Turn[]
  /** The same as a path (bottom and top points), for the stroke guide. */
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
  /** When the next bottom is, as the readout says (2.2+), or null. */
  let told: number | null = null

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

  /** The bottom turns' phase: a seen bottom, or half a stroke from a seen top. */
  function anchor(period: number): number {
    if (told !== null)
      return told
    if (lastBottom && (!lastTop || lastBottom.at >= lastTop.at - period / 2))
      return lastBottom.at
    return lastTop!.at + period / 2
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
    const speed = (amp / (period / 2)) * 1000
    const out: Turn[] = []
    // Half-stroke steps: even ones are bottoms.
    const half = period / 2
    let k = Math.ceil((now - behindMs - a) / half)
    for (let t = a + k * half; t <= now + aheadMs; k++, t = a + k * half) {
      const isBottom = ((k % 2) + 2) % 2 === 0
      out.push({ at: t, pos: isBottom ? bottom : top, kind: isBottom ? 'bottom' : 'top', amp, speed })
    }
    return out
  }

  function path(now: number, aheadMs: number, behindMs = 0): Action[] {
    if (!ready())
      return []
    const half = 30_000 / spm
    // One turn either side, so the path covers the whole window; eased
    // between turns, as the generator's stroke is.
    const ts = turns(now - half, aheadMs + 2 * half, behindMs)
    const out: Action[] = []
    for (let i = 0; i < ts.length; i++) {
      out.push({ at: ts[i].at, pos: ts[i].pos })
      const next = ts[i + 1]
      if (!next)
        break
      for (let j = 1; j < EASE_STEPS; j++) {
        const f = (1 - Math.cos((Math.PI * j) / EASE_STEPS)) / 2
        out.push({ at: ts[i].at + ((next.at - ts[i].at) * j) / EASE_STEPS, pos: ts[i].pos + (next.pos - ts[i].pos) * f })
      }
    }
    return out
  }

  return { feed, ready, turns, path, spm: () => (ready() ? spm : 0), reset }
}
