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
