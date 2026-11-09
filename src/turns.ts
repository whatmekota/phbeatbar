/**
 * Strokes out of a funscript: the points where the stroke turns round.
 *
 * A bottom turn is where a downstroke ends: the beat a hand follows. A top
 * turn is where an upstroke ends. Wiggles smaller than `minMove` (funscript
 * units, 0–100) don't count as a turn, so a shaky line between two real
 * reversals stays one stroke.
 */

export interface Action { at: number, pos: number }

export interface Turn {
  /** Script time, ms. */
  at: number
  /** 0–100. */
  pos: number
  kind: 'top' | 'bottom'
  /** How far the stroke into this turn travelled, 0–100. */
  amp: number
  /** How fast it went, funscript units a second (the heatmap's scale). */
  speed: number
}

/** Sorted by time, finite, pos clamped to 0–100; of two points at the same ms the later one wins. */
export function cleanActions(actions: readonly { at: number, pos: number }[]): Action[] {
  const ok = actions
    .filter(a => a && Number.isFinite(a.at) && Number.isFinite(a.pos))
    .map(a => ({ at: a.at, pos: Math.min(100, Math.max(0, a.pos)) }))
    .sort((a, b) => a.at - b.at)
  const out: Action[] = []
  for (const a of ok) {
    if (out.length && out[out.length - 1].at === a.at)
      out[out.length - 1] = a
    else
      out.push(a)
  }
  return out
}

/**
 * The turning points of a cleaned script, in time order, alternating top and
 * bottom. A turn is placed where the stroke arrives at its extreme (the first
 * point of a flat stretch at the top or bottom), which is when a hand gets
 * there. The script's first point counts as a turn too, once the direction
 * away from it is clear.
 */
export function turningPoints(actions: readonly Action[], minMove = 5): Turn[] {
  const turns: Turn[] = []
  if (actions.length < 2)
    return turns
  let dir = 0
  // Before the direction is known: the lowest and highest point so far.
  let lo = actions[0]
  let hi = actions[0]
  let cand = actions[0]
  const push = (p: Action, kind: Turn['kind']) => {
    const prev = turns[turns.length - 1]
    const amp = prev ? Math.abs(p.pos - prev.pos) : 0
    const dt = prev ? p.at - prev.at : 0
    turns.push({ at: p.at, pos: p.pos, kind, amp, speed: dt > 0 ? (amp / dt) * 1000 : 0 })
  }
  for (let i = 1; i < actions.length; i++) {
    const p = actions[i]
    if (dir === 0) {
      if (p.pos < lo.pos)
        lo = p
      if (p.pos > hi.pos)
        hi = p
      if (hi.pos - lo.pos < minMove)
        continue
      // Whichever extreme came first is where the stroke started.
      if (lo.at <= hi.at) {
        push(lo, 'bottom')
        dir = 1
        cand = hi
      }
      else {
        push(hi, 'top')
        dir = -1
        cand = lo
      }
      continue
    }
    if (dir > 0) {
      if (p.pos > cand.pos) {
        cand = p
      }
      else if (cand.pos - p.pos >= minMove) {
        push(cand, 'top')
        dir = -1
        cand = p
      }
    }
    else {
      if (p.pos < cand.pos) {
        cand = p
      }
      else if (p.pos - cand.pos >= minMove) {
        push(cand, 'bottom')
        dir = 1
        cand = p
      }
    }
  }
  if (dir !== 0)
    push(cand, dir > 0 ? 'top' : 'bottom')
  return turns
}

/** Index of the first item at or after `t` (items.length if none); items sorted by `at`. */
export function firstAtOrAfter(items: readonly { at: number }[], t: number): number {
  let lo = 0
  let hi = items.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (items[mid].at < t)
      lo = mid + 1
    else
      hi = mid
  }
  return lo
}

/** The script's position at `t`, 0–100, straight between points; held before the first and after the last. Null if empty. */
export function positionAt(actions: readonly Action[], t: number): number | null {
  if (!actions.length)
    return null
  const i = firstAtOrAfter(actions, t)
  if (i === 0)
    return actions[0].pos
  if (i >= actions.length)
    return actions[actions.length - 1].pos
  const a = actions[i - 1]
  const b = actions[i]
  if (b.at === a.at)
    return b.pos
  return a.pos + ((b.pos - a.pos) * (t - a.at)) / (b.at - a.at)
}

/** The script's path from `t0` to `t1`: its position at both ends and every point between. */
export function pathBetween(actions: readonly Action[], t0: number, t1: number): Action[] {
  const start = positionAt(actions, t0)
  if (start === null || t1 <= t0)
    return []
  const out: Action[] = [{ at: t0, pos: start }]
  for (let i = firstAtOrAfter(actions, t0); i < actions.length && actions[i].at < t1; i++) {
    if (actions[i].at > t0)
      out.push(actions[i])
  }
  out.push({ at: t1, pos: positionAt(actions, t1)! })
  return out
}

/** Strokes a minute around `t`: bottom turns within `spanMs` either side. 0 if there are fewer than two. */
export function spmAround(turns: readonly Turn[], t: number, spanMs = 3000): number {
  let first = -1
  let last = -1
  let n = 0
  for (let i = firstAtOrAfter(turns, t - spanMs); i < turns.length && turns[i].at <= t + spanMs; i++) {
    if (turns[i].kind !== 'bottom')
      continue
    if (first < 0)
      first = turns[i].at
    last = turns[i].at
    n++
  }
  if (n < 2 || last <= first)
    return 0
  return ((n - 1) / (last - first)) * 60_000
}
