import type { Turn } from './turns'
import { firstAtOrAfter } from './turns'

/**
 * Where the beat meter's markers are at a moment: pure arithmetic over time,
 * so the drawing only has to turn `x` into pixels.
 */

export interface Marker {
  turn: Turn
  /** 0 at the hit zone, 1 at the far end of the lookahead; below 0 once it has passed. */
  x: number
}

/**
 * The turns from `behindMs` before `now` to `aheadMs` after it, placed along
 * the track. Spacing on the track is spacing in time, so the tempo shows.
 */
export function markersAt(turns: readonly Turn[], now: number, aheadMs: number, behindMs = 0): Marker[] {
  const out: Marker[] = []
  if (!(aheadMs > 0))
    return out
  for (let i = firstAtOrAfter(turns, now - behindMs); i < turns.length; i++) {
    const t = turns[i]
    if (t.at > now + aheadMs)
      break
    out.push({ turn: t, x: (t.at - now) / aheadMs })
  }
  return out
}

/**
 * The flash of the hit zone: 1 the moment a bottom turn reaches it, fading
 * to 0 over `decayMs`, scaled by how deep that stroke was (a shallow flick
 * flashes less than a full stroke). Also the turn that hit, for its colour.
 */
export function pulseAt(turns: readonly Turn[], now: number, decayMs = 220): { pulse: number, turn: Turn | null } {
  let i = firstAtOrAfter(turns, now + 1e-6) - 1
  while (i >= 0 && turns[i].kind !== 'bottom')
    i--
  if (i < 0)
    return { pulse: 0, turn: null }
  const t = turns[i]
  const age = now - t.at
  if (age < 0 || age >= decayMs)
    return { pulse: 0, turn: t }
  const fade = 1 - age / decayMs
  const depth = 0.45 + 0.55 * Math.min(1, t.amp / 60)
  return { pulse: fade * fade * depth, turn: t }
}

/** A marker's radius for a stroke of `amp` (0–100): a full stroke fills `maxR`, a flick is still visible. */
export function markerRadius(amp: number, maxR: number): number {
  return maxR * (0.4 + 0.6 * Math.min(1, Math.max(0, amp) / 100))
}

/**
 * How visible a marker is at `x`: fading in over the far end of the track
 * and out over `behindX` once past the hit zone.
 */
export function markerAlpha(x: number, behindX: number): number {
  if (x > 1 || x < -behindX)
    return 0
  if (x < 0)
    return behindX > 0 ? 1 + x / behindX : 0
  if (x > 0.85)
    return (1 - x) / 0.15
  return 1
}

/**
 * Heatmap colour for a speed in funscript units a second, the scale
 * playhound's timeline and EroScripts use: blue through green and yellow to
 * red as speed rises, darker past 500, greyer past 800.
 */
export function heatColor(speed: number, oklch = true, alpha = 1): string {
  const s = Math.max(0, speed)
  const hue = (((210 - s / 2.4) % 360) + 360) % 360
  const l = 80 - 40 * Math.min(1, Math.max(0, (s - 500) / 100))
  const c = 0.4 - 0.3 * Math.min(1, Math.max(0, (s - 800) / 100))
  const h = Math.round(hue * 10) / 10
  return oklch
    ? `oklch(${l}% ${c.toFixed(3)} ${h} / ${alpha})`
    : `hsla(${h},85%,${(l * 0.75).toFixed(1)}%,${alpha})`
}

/** Script time to wait for, from the clock: the clock reads the video, the script runs `offsetMs` ahead of it. */
export function scriptTime(clockS: number, offsetMs: number): number {
  return clockS * 1000 + offsetMs
}

/**
 * The lookahead in script time. The setting is in seconds of real time: at
 * double speed twice as much script passes in that time, so the beats close
 * up the way they sound.
 */
export function aheadInScript(lookaheadS: number, rate: number): number {
  const r = Number.isFinite(rate) && rate > 0 ? rate : 1
  return lookaheadS * 1000 * r
}

/**
 * Where the row of markers stops, when it stops inside the window: the `x`
 * of the last turn before the script ends or pauses for a while, else null
 * (the strokes carry on past the far end). A pause counts when the next turn
 * is more than `gapMs`, or three times the last spacing, after the last one
 * in the window, whichever is longer.
 */
export function rowEnd(turns: readonly Turn[], now: number, aheadMs: number, gapMs = 1500): number | null {
  if (!(aheadMs > 0))
    return null
  const after = firstAtOrAfter(turns, now + aheadMs + 1e-6)
  const last = after - 1
  if (last < 0 || turns[last].at < now)
    return null
  const next = turns[after]
  const spacing = last > 0 ? turns[last].at - turns[last - 1].at : 0
  if (next && next.at - turns[last].at <= Math.max(gapMs, 3 * spacing))
    return null
  return (turns[last].at - now) / aheadMs
}

/**
 * How visible a marker is toward the end of the row when the row stops
 * inside the window (see rowEnd): solid near the hit zone, fading over the
 * last `tail` of the row so the strokes thin out instead of stopping dead.
 */
export function tailFade(x: number, endX: number | null, tail = 0.3): number {
  if (endX === null || x <= 0)
    return 1
  const f = (endX + 0.05 - x) / tail
  return Math.max(0.15, Math.min(1, f))
}

/**
 * Generated motion only knows its tempo now, so the further ahead a beat is
 * the less sure it is: solid to `from`, fading to `floor` at the far end.
 */
export function uncertainFade(x: number, from = 0.35, floor = 0.15): number {
  if (x <= from)
    return 1
  return Math.max(floor, 1 - ((x - from) / (1 - from)) * (1 - floor))
}

/** A box: left, top, width, height, CSS pixels. */
export interface Rect { x: number, y: number, w: number, h: number }

export type Side = 'top' | 'bottom' | 'left' | 'right'
export type Align = 'start' | 'centre' | 'end'

export interface BarPlacement {
  side: Side
  /** Along the edge: left/top, centre, right/bottom. */
  align: Align
  /** Part of the side it covers, 0–1; 1 is edge to edge. */
  length: number
  /** Across the edge, px. */
  thickness: number
  /** What the player's own bars cover of the layer, top and bottom, px. */
  insetTop: number
  insetBottom: number
}

/** Space kept between the bar and the edge it sits on, and its ends when it isn't full length, px. */
export const EDGE_GAP = 12

/**
 * The bar's box in the layer: on `side` of the picture, clear of the
 * player's bars, `length` of that side long and placed along it by `align`.
 * Full length runs edge to edge of the picture.
 */
export function barRect(picture: Rect, layerH: number, p: BarPlacement): Rect & { full: boolean } {
  const full = p.length >= 0.999
  const margin = full ? 0 : EDGE_GAP
  const len = Math.min(1, Math.max(0.05, p.length))
  // The part of the picture the player's bars leave free.
  const top = Math.max(picture.y, p.insetTop)
  const bottom = Math.max(top, Math.min(picture.y + picture.h, layerH - p.insetBottom))
  const place = (start: number, size: number, l: number) =>
    p.align === 'start' ? start + margin : p.align === 'end' ? start + size - margin - l : start + (size - l) / 2
  if (p.side === 'top' || p.side === 'bottom') {
    const w = Math.max(0, (picture.w - 2 * margin) * len)
    const h = p.thickness
    const y = p.side === 'top' ? top + EDGE_GAP : bottom - EDGE_GAP - h
    return { x: place(picture.x, picture.w, w), y, w, h, full }
  }
  const h = Math.max(0, (bottom - top - 2 * margin) * len)
  const w = p.thickness
  const x = p.side === 'left' ? picture.x + EDGE_GAP : picture.x + picture.w - EDGE_GAP - w
  return { x, y: place(top, bottom - top, h), w, h, full }
}
